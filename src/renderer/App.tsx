import { useEffect, useRef, useState } from 'react';
import type { BootstrapResult, BootstrapSnapshot, PiSdkCheck, SqliteCheck } from '../shared/bootstrap-contracts';
import { parseResult, safeError } from '../shared/bootstrap-validation';

const POLL_MS = 250;
const READ_BUDGET_MS = 20_000;
const STATE_TEXT = Object.freeze({
  starting: 'Starting: checking the temporary database and packaged Pi SDK.',
  ready: 'Ready: the bootstrap database and packaged Pi SDK checks passed.',
  failed: 'Failed: a bootstrap check could not finish. Conversations are not enabled.',
  stopping: 'Stopping: the bootstrap checks are shutting down.',
});
function checkText(check: SqliteCheck | PiSdkCheck | undefined, kind: 'sqlite' | 'piSdk'): string {
  if (!check || check.status === 'pending') return 'Pending: waiting for the startup check.';
  if (check.status === 'failed') return `Failed: ${check.error.message}`;
  if (kind === 'sqlite' && 'driverVersion' in check)
    return `Passed: SQLite driver ${check.driverVersion}; temporary database close and reopen verified.`;
  if (kind === 'piSdk' && 'sdkVersion' in check)
    return `Passed: Pi SDK ${check.sdkVersion}; import and packaged assets verified. Configured brainstorming was not checked.`;
  return safeError('INTERNAL').message;
}

export default function App() {
  const [diagnosticFixture, setDiagnosticFixture] = useState(() => document.documentElement.dataset.bootstrapFixture === 'true');
  useEffect(() => {
    const update = () => setDiagnosticFixture(document.documentElement.dataset.bootstrapFixture === 'true');
    document.addEventListener('gabprd-bootstrap-fixture', update);
    update();
    return () => document.removeEventListener('gabprd-bootstrap-fixture', update);
  }, []);
  return diagnosticFixture ? <BootstrapDiagnostics /> : <main aria-label="PRD Creator" />;
}

function BootstrapDiagnostics() {
  const [result, setResult] = useState<BootstrapResult>();
  const [announcement, setAnnouncement] = useState('');
  const refresh = useRef<() => void>(() => {});
  const lastAnnouncement = useRef('');

  useEffect(() => {
    let mounted = true;
    let generation = 0;
    let poll: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const clearTimers = () => {
      if (poll !== undefined) clearTimeout(poll);
      if (deadline !== undefined) clearTimeout(deadline);
      poll = undefined;
      deadline = undefined;
    };
    const announce = (text: string) => {
      if (lastAnnouncement.current === text) return;
      lastAnnouncement.current = text;
      setAnnouncement(text);
    };
    const startRead = () => {
      clearTimers();
      const current = ++generation;
      const unavailable = () => {
        if (!mounted || current !== generation) return;
        ++generation; // Ignore late resolutions, including a hung bridge call.
        clearTimers();
        const error = safeError('INTERNAL');
        setResult({ ok: false, error });
        announce(error.message);
      };
      deadline = setTimeout(unavailable, READ_BUDGET_MS);
      const read = async (): Promise<void> => {
        let parsed: BootstrapResult | undefined;
        try {
          const value: unknown = await window.gabPrd.bootstrap.getStatus();
          parsed = parseResult(value);
        } catch { /* Do not display or stringify transport errors. */ }
        if (!mounted || current !== generation) return;
        if (!parsed) { unavailable(); return; }
        setResult(parsed);
        if (parsed.ok && parsed.snapshot.state === 'starting') {
          poll = setTimeout(() => { void read(); }, POLL_MS);
        } else {
          clearTimers();
          announce(parsed.ok ? STATE_TEXT[parsed.snapshot.state] : parsed.error.message);
        }
      };
      void read();
    };
    refresh.current = startRead;
    startRead();
    return () => {
      mounted = false;
      ++generation;
      clearTimers();
      refresh.current = () => {};
    };
  }, []);

  const snapshot: BootstrapSnapshot | undefined = result?.ok ? result.snapshot : undefined;
  const statusText = result && !result.ok ? result.error.message : STATE_TEXT[snapshot?.state ?? 'starting'];
  return (
    <main aria-labelledby="bootstrap-heading">
      <h1 id="bootstrap-heading">PRD Creator — Bootstrap</h1>
      <p>Conversations, documents and publishing are not implemented yet.</p>
      <p>This build checks only a temporary SQLite database and the packaged Pi SDK. It does not check your configured brainstorm skill or start a conversation.</p>
      <section aria-labelledby="status-heading">
        <h2 id="status-heading">Startup status</h2>
        <p>{statusText}</p>
        <ul aria-label="Runtime checks">
          <li>
            <h3>SQLite database</h3>
            <p>{checkText(snapshot?.sqlite, 'sqlite')}</p>
          </li>
          <li>
            <h3>Pi SDK</h3>
            <p>{checkText(snapshot?.piSdk, 'piSdk')}</p>
          </li>
        </ul>
        <button type="button" onClick={() => refresh.current()}>Refresh status</button>
        <p className="hint">Refresh reads the current status only; it does not run the checks again.</p>
      </section>
      <p className="announcement" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
    </main>
  );
}
