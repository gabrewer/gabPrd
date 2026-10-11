import { app, utilityProcess } from 'electron';
import type { UtilityProcess } from 'electron';
import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import type { Stats } from 'node:fs';
import path from 'node:path';
import { SHUTDOWN_TIMEOUT_MS, UTILITY_TIMEOUT_MS } from '../shared/bootstrap-contracts';
import type { BootstrapController, FixtureContext } from '../shared/bootstrap-contracts';
import { parseUtilityInit, parseUtilityResult, safeError } from '../shared/bootstrap-validation';
import { validateFixture } from './fixture-root';

function reject(): never { throw new Error(safeError('INTERNAL').message); }
function same(a: Stats, b: Stats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.birthtimeMs === b.birthtimeMs;
}
function revalidate(fixture: FixtureContext): void {
  const files = [fixture.root, path.join(fixture.root, 'bootstrap-owner.json'),
    fixture.userData, fixture.sessionData, fixture.logs, fixture.piDirectory];
  const before = files.map(file => lstatSync(file));
  const fresh = validateFixture(fixture.root);
  for (const key of ['root', 'fixtureId', 'databaseExpected', 'database', 'userData', 'sessionData', 'logs', 'piDirectory'] as const) {
    if (fresh[key] !== fixture[key]) reject();
  }
  for (const [index, file] of files.entries()) {
    const stat = lstatSync(file);
    if (!same(before[index]!, stat) || stat.isSymbolicLink() || realpathSync(file) !== file
      || (index !== 1 && !stat.isDirectory())) reject();
  }
  // No config/auth/session/resources are created, read or discovered.
  if (readdirSync(fixture.piDirectory).length !== 0) reject();
}
function environment(fixture: FixtureContext): Record<string, string> {
  if (process.platform !== 'win32') reject();
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
  if (!systemRoot || /[\x00-\x1f";]/.test(systemRoot) || !path.isAbsolute(systemRoot)) reject();
  const root = realpathSync(systemRoot);
  if (!lstatSync(root).isDirectory()) reject();
  const system32 = path.join(root, 'System32');
  if (!lstatSync(system32).isDirectory() || realpathSync(system32) !== system32) reject();
  const command = path.join(system32, 'cmd.exe');
  if (!lstatSync(command).isFile() || realpathSync(command) !== command) reject();
  // Build from scratch: no credentials, global SDK overrides or Node injection flags.
  // PATH/ComSpec/PATHEXT use only the verified Windows system context, not user tools.
  return { SystemRoot: root, WINDIR: root, ComSpec: command,
    PATH: system32 + ';' + root, PATHEXT: '.COM;.EXE;.BAT;.CMD',
    TEMP: fixture.root, TMP: fixture.root,
    HOME: fixture.piDirectory, USERPROFILE: fixture.piDirectory,
    APPDATA: fixture.piDirectory, LOCALAPPDATA: fixture.piDirectory,
    PI_CODING_AGENT_DIR: fixture.piDirectory };
}

/** Main calls once, after app ready and the selected fixture's instance lock. */
export function startPiUtility(fixture: FixtureContext, runId: string, controller: BootstrapController): { shutdown(): Promise<void> } {
  let child: UtilityProcess | undefined;
  let stopping = false;
  let settled = false;
  let exited = false;
  let killAccepted = false;
  let terminating = false;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let shutdownPromise: Promise<void> | undefined;
  let resolveExit!: () => void;
  const exit = new Promise<void>(resolve => { resolveExit = resolve; });
  const cancelDeadline = (): void => { if (deadline !== undefined) clearTimeout(deadline); deadline = undefined; };
  const killOwned = (): void => {
    terminating = true;
    if (!child || exited || killAccepted) return;
    try { killAccepted = child.kill(); } catch { /* Only the bounded exit wait decides shutdown success. */ }
  };
  const fail = (code: 'UTILITY_TIMEOUT' | 'UTILITY_EXITED' | 'INTERNAL'): void => {
    settled = true;
    cancelDeadline();
    if (!stopping) controller.failUtility(code);
  };
  try {
    const init = parseUtilityInit({ contractVersion: 1, type: 'bootstrap.init', runId });
    if (!init || !app.isReady()) reject();
    revalidate(fixture);
    const env = environment(fixture);
    revalidate(fixture); // Immediately before fork; status reads never reach this operation.
    child = utilityProcess.fork(path.join(__dirname, 'pi-utility.cjs'), [], {
      cwd: fixture.piDirectory, env, execArgv: [],
      serviceName: 'gabPrd Pi bootstrap', stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Drain without forwarding unknown logs, error causes or diagnostic reports.
    child.stdout?.on('data', () => {});
    child.stderr?.on('data', () => {});
    child.stdout?.on('error', () => {});
    child.stderr?.on('error', () => {});
    child.on('error', () => { if (!stopping && !settled) fail('INTERNAL'); });
    child.once('exit', () => {
      exited = true;
      resolveExit();
      // Even a previously passed SDK check cannot survive an unexpected process exit.
      if (!stopping) fail('UTILITY_EXITED');
    });
    child.once('spawn', () => { if (stopping || terminating) killOwned(); });
    child.on('message', (value: unknown) => {
      if (stopping || settled) return;
      const result = parseUtilityResult(value, runId);
      if (!result) return; // Wrong correlation/malformed messages cannot reset the deadline.
      settled = true;
      cancelDeadline();
      controller.acceptUtility(result);
    });
    deadline = setTimeout(() => { if (!stopping && !settled) { fail('UTILITY_TIMEOUT'); killOwned(); } }, UTILITY_TIMEOUT_MS);
    child.postMessage(init); // Exactly one init; no generic operation/retry surface.
  } catch {
    fail('INTERNAL');
    if (child) killOwned();
    else { exited = true; resolveExit(); }
  }
  return { shutdown(): Promise<void> {
    if (shutdownPromise) return shutdownPromise;
    stopping = true;
    settled = true;
    cancelDeadline();
    controller.stop();
    shutdownPromise = (async () => {
      if (exited) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const budget = new Promise<never>((_, rejectWait) => {
          timer = setTimeout(() => rejectWait(new Error(safeError('INTERNAL').message)), SHUTDOWN_TIMEOUT_MS);
        });
        killOwned();
        await Promise.race([exit, budget]);
      } finally { if (timer !== undefined) clearTimeout(timer); }
    })();
    return shutdownPromise;
  } };
}
