import type { BootstrapController, BootstrapSnapshot, BootstrapState, PendingCheck, PiSdkCheck, SqliteCheck } from '../shared/bootstrap-contracts';
import { parseResult, parseUtilityInit, parseUtilityResult, safeError } from '../shared/bootstrap-validation';

export class BootstrapRun implements BootstrapController {
  private state: BootstrapState = 'starting';
  private sqlite: SqliteCheck = Object.freeze({ status: 'pending' });
  private piSdk: PiSdkCheck = Object.freeze({ status: 'pending' });
  constructor(private readonly runId: string) {
    if (!parseUtilityInit({ contractVersion: 1, type: 'bootstrap.init', runId })) throw new Error(safeError('INTERNAL').message);
  }
  snapshot(): BootstrapSnapshot {
    // The parser constructs fresh, deeply frozen data; no internal references escape.
    const parsed = parseResult({ ok: true, snapshot: { contractVersion: 1, state: this.state, sqlite: this.sqlite, piSdk: this.piSdk } });
    if (!parsed?.ok) throw new Error(safeError('INTERNAL').message);
    return parsed.snapshot;
  }
  completeSqlite(check: Exclude<SqliteCheck, PendingCheck>): boolean {
    if (this.state !== 'starting' || this.sqlite.status !== 'pending') return false;
    const parsed = parseResult({ ok: true, snapshot: { contractVersion: 1, state: 'stopping', sqlite: check, piSdk: this.piSdk } });
    if (!parsed?.ok || parsed.snapshot.sqlite.status === 'pending') return false;
    this.sqlite = parsed.snapshot.sqlite;
    this.settle();
    return true;
  }
  acceptUtility(value: unknown): boolean {
    if (this.state !== 'starting' || this.piSdk.status !== 'pending') return false;
    const result = parseUtilityResult(value, this.runId);
    if (!result) return false;
    this.piSdk = result.ok
      ? Object.freeze({ status: 'passed', sdkVersion: result.sdkVersion, assetsVerified: true })
      : Object.freeze({ status: 'failed', error: safeError(result.errorCode) });
    this.settle();
    return true;
  }
  failUtility(code: 'UTILITY_TIMEOUT' | 'UTILITY_EXITED' | 'INTERNAL'): boolean {
    if (this.state === 'failed' || this.state === 'stopping') return false;
    if (code !== 'UTILITY_TIMEOUT' && code !== 'UTILITY_EXITED' && code !== 'INTERNAL') return false;
    if (this.state === 'ready' && code !== 'UTILITY_EXITED') return false;
    this.piSdk = Object.freeze({ status: 'failed', error: safeError(code) });
    this.state = 'failed';
    return true;
  }
  stop(): void { this.state = 'stopping'; }
  private settle(): void {
    if (this.sqlite.status === 'failed' || this.piSdk.status === 'failed') this.state = 'failed';
    else if (this.sqlite.status === 'passed' && this.piSdk.status === 'passed') this.state = 'ready';
  }
}
