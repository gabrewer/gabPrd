import { app, session } from 'electron';
import type { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { lstatSync } from 'node:fs';
import type { Stats } from 'node:fs';
import path from 'node:path';
import { SHELL_URL, SHUTDOWN_TIMEOUT_MS } from '../shared/bootstrap-contracts';
import type { FixtureContext } from '../shared/bootstrap-contracts';
import { safeError } from '../shared/bootstrap-validation';
import { installAssetProtocol, registerBootstrapScheme } from './assets';
import { BootstrapRun } from './bootstrap-state';
import { createFixture, prepareFixtureDirectories, validateFixture } from './fixture-root';
import { registerBootstrapIpc } from './ipc';
import { startPiUtility } from './pi-utility';
import { probeSqlite } from './sqlite-probe';
import { createBootstrapWindow } from './window';

function report(code: 'FIXTURE_INVALID' | 'INTERNAL'): void {
  console.error(safeError(code).message);
}
function invalid(): never { throw new Error(safeError('FIXTURE_INVALID').message); }
function same(a: Stats, b: Stats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.birthtimeMs === b.birthtimeMs;
}
function identity(context: FixtureContext): Stats[] {
  return [context.root, path.join(context.root, 'bootstrap-owner.json'),
    context.userData, context.sessionData, context.logs, context.piDirectory].map(file => lstatSync(file));
}
/** Preserve the selected identity across lock acquisition; helpers also keep their own WeakMap authority. */
function freshContext(context: FixtureContext, previous: Stats[]): FixtureContext {
  const fresh = validateFixture(context.root);
  for (const key of ['root', 'fixtureId', 'databaseExpected', 'database', 'userData', 'sessionData', 'logs', 'piDirectory'] as const) {
    if (fresh[key] !== context[key]) invalid();
  }
  if (!identity(fresh).every((stat, index) => same(stat, previous[index]!))) invalid();
  return fresh;
}
function selectFixture(): FixtureContext {
  // Ignore Electron/automation arguments; only this exact main-only option is consumed.
  const options = process.argv.filter(argument => argument === '--bootstrap-fixture-root'
    || argument.startsWith('--bootstrap-fixture-root='));
  if (options.length === 0) return createFixture();
  if (options.length !== 1 || !options[0]!.startsWith('--bootstrap-fixture-root=')) invalid();
  const root = options[0]!.slice('--bootstrap-fixture-root='.length);
  if (!root || !path.isAbsolute(root)) invalid();
  return validateFixture(root); // No fallback, replacement or cleanup on rejection.
}

function bootstrap(): void {
  try { registerBootstrapScheme(); } catch { report('INTERNAL'); app.exit(1); return; }
  let fixture: FixtureContext;
  let selectedIdentity: Stats[];
  try {
    fixture = selectFixture();
    prepareFixtureDirectories(fixture);
    selectedIdentity = identity(fixture);
    fixture = freshContext(fixture, selectedIdentity);
    app.setPath('userData', fixture.userData);
    app.setPath('sessionData', fixture.sessionData);
    app.setAppLogsPath(fixture.logs);
  } catch { report('FIXTURE_INVALID'); app.exit(1); return; }

  try {
    if (!app.requestSingleInstanceLock()) { app.exit(0); return; }
    fixture = freshContext(fixture, selectedIdentity);
  } catch { report('FIXTURE_INVALID'); app.exit(1); return; }

  const runId = randomUUID();
  const controller = new BootstrapRun(runId);
  let ownedWindow: BrowserWindow | undefined;
  let disposeIpc: (() => void) | undefined;
  let ownedPi: ReturnType<typeof startPiUtility> | undefined;
  let stopping = false;
  let shutdownPromise: Promise<void> | undefined;

  const shutdown = (): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    stopping = true;
    controller.stop();
    // Schedule work after assigning the promise, so event reentry cannot create another budget.
    shutdownPromise = Promise.resolve().then(async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        disposeIpc?.();
        disposeIpc = undefined;
        const budget = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(safeError('INTERNAL').message)), SHUTDOWN_TIMEOUT_MS);
        });
        // Adapter resolves only after actual owned-child exit, not merely kill acceptance.
        await Promise.race([ownedPi?.shutdown() ?? Promise.resolve(), budget]);
        app.exit(0);
      } catch {
        report('INTERNAL');
        app.exit(1); // Child exit is unconfirmed; do not claim clean shutdown or kill global PIDs.
      } finally { if (timer !== undefined) clearTimeout(timer); }
    });
    return shutdownPromise;
  };
  app.on('before-quit', event => { event.preventDefault(); void shutdown(); });
  app.on('window-all-closed', () => { void shutdown(); });
  process.on('SIGINT', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });

  void app.whenReady().then(async () => {
    if (stopping) return;
    try {
      installAssetProtocol(session.defaultSession, app.getAppPath());
      ownedWindow = createBootstrapWindow();
      disposeIpc = registerBootstrapIpc(ownedWindow, controller);
      await ownedWindow.loadURL(SHELL_URL);
    } catch {
      if (!stopping) { controller.failUtility('INTERNAL'); report('INTERNAL'); }
      return; // Keep the owned diagnostic window; no external/development URL fallback.
    }
    if (stopping) return;
    try {
      fixture = freshContext(fixture, selectedIdentity);
      const sqlite = probeSqlite(fixture);
      controller.completeSqlite(sqlite);
      if (sqlite.status === 'failed') return; // No implied SDK success or retry on terminal SQL failure.
      // The probe intentionally replaces the intent marker on creation. Its old context is stale.
      const afterSqlite = validateFixture(fixture.root);
      const afterIdentity = identity(afterSqlite);
      if (afterSqlite.fixtureId !== fixture.fixtureId || !afterSqlite.databaseExpected
        || !same(selectedIdentity[0]!, afterIdentity[0]!)
        || !afterIdentity.slice(2).every((stat, index) => same(stat, selectedIdentity[index + 2]!))) invalid();
      fixture = freshContext(afterSqlite, afterIdentity);
      ownedPi = startPiUtility(fixture, runId, controller);
    } catch {
      // Never interpolate error/cause/paths; the shell exposes only the fixed typed failure.
      controller.failUtility('INTERNAL');
    }
  }, () => {
    if (!stopping) { controller.failUtility('INTERNAL'); report('INTERNAL'); }
  });
}

bootstrap();
