import { ERROR_MESSAGES, SDK_VERSION, SQLITE_DRIVER_VERSION, SHELL_URL } from './bootstrap-contracts';
import type { BootstrapError, BootstrapErrorCode, BootstrapResult, BootstrapSnapshot, PiSdkCheck, SqliteCheck, UtilityInit, UtilityResult } from './bootstrap-contracts';

// Inspect data descriptors only. Never invoke input getters or stringify unknown values.
function record(value: unknown): Record<string, unknown> | undefined {
  try {
    if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return undefined;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== 'string') return undefined;
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return undefined;
      result[key] = descriptor.value;
    }
    return result;
  } catch { return undefined; }
}
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function uuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
export function safeError(code: BootstrapErrorCode): BootstrapError {
  const safeCode = typeof code === 'string' && Object.hasOwn(ERROR_MESSAGES, code) ? code : 'INTERNAL';
  return Object.freeze({ code: safeCode, message: ERROR_MESSAGES[safeCode] });
}
function error(value: unknown): BootstrapError | undefined {
  const r = record(value);
  if (!r || !exact(r, ['code', 'message']) || typeof r.code !== 'string' || !Object.hasOwn(ERROR_MESSAGES, r.code)) return undefined;
  const safe = safeError(r.code as BootstrapErrorCode);
  return r.message === safe.message ? safe : undefined;
}
export function isRequest(value: unknown): boolean {
  const r = record(value);
  return !!r && exact(r, ['contractVersion']) && r.contractVersion === 1;
}
export function isTrustedCaller(value: unknown, expected: unknown): boolean {
  const r = record(value), e = record(expected);
  return !!r && !!e && exact(r, ['sender', 'frame', 'url']) && exact(e, ['sender', 'mainFrame', 'url'])
    && typeof e.sender === 'object' && e.sender !== null && typeof e.mainFrame === 'object' && e.mainFrame !== null
    && r.sender === e.sender && r.frame === e.mainFrame && r.url === SHELL_URL && e.url === SHELL_URL;
}
function check(value: unknown, kind: 'sqlite'): SqliteCheck | undefined;
function check(value: unknown, kind: 'piSdk'): PiSdkCheck | undefined;
function check(value: unknown, kind: 'sqlite' | 'piSdk'): SqliteCheck | PiSdkCheck | undefined {
  const r = record(value);
  if (!r) return undefined;
  if (r.status === 'pending' && exact(r, ['status'])) return Object.freeze({ status: 'pending' });
  if (r.status === 'failed' && exact(r, ['status', 'error'])) {
    const parsed = error(r.error);
    return parsed ? Object.freeze({ status: 'failed', error: parsed }) : undefined;
  }
  if (r.status !== 'passed') return undefined;
  if (kind === 'sqlite' && exact(r, ['status', 'driverVersion', 'reopenVerified']) && r.driverVersion === SQLITE_DRIVER_VERSION && r.reopenVerified === true)
    return Object.freeze({ status: 'passed', driverVersion: SQLITE_DRIVER_VERSION, reopenVerified: true });
  if (kind === 'piSdk' && exact(r, ['status', 'sdkVersion', 'assetsVerified']) && r.sdkVersion === SDK_VERSION && r.assetsVerified === true)
    return Object.freeze({ status: 'passed', sdkVersion: SDK_VERSION, assetsVerified: true });
  return undefined;
}
export function parseResult(value: unknown): BootstrapResult | undefined {
  const r = record(value);
  if (!r) return undefined;
  if (r.ok === false && exact(r, ['ok', 'error'])) {
    const parsed = error(r.error);
    return parsed ? Object.freeze({ ok: false, error: parsed }) : undefined;
  }
  if (r.ok !== true || !exact(r, ['ok', 'snapshot'])) return undefined;
  const s = record(r.snapshot);
  if (!s || !exact(s, ['contractVersion', 'state', 'sqlite', 'piSdk']) || s.contractVersion !== 1) return undefined;
  const sqlite = check(s.sqlite, 'sqlite'), piSdk = check(s.piSdk, 'piSdk');
  if (!sqlite || !piSdk) return undefined;
  const bothPassed = sqlite.status === 'passed' && piSdk.status === 'passed';
  const failed = sqlite.status === 'failed' || piSdk.status === 'failed';
  if (!(s.state === 'stopping' || (s.state === 'ready' && bothPassed) || (s.state === 'failed' && failed) || (s.state === 'starting' && !failed && !bothPassed))) return undefined;
  const snapshot: BootstrapSnapshot = Object.freeze({ contractVersion: 1, state: s.state, sqlite, piSdk });
  return Object.freeze({ ok: true, snapshot });
}
export function parseUtilityInit(value: unknown): UtilityInit | undefined {
  const r = record(value);
  if (!r || !exact(r, ['contractVersion', 'type', 'runId']) || r.contractVersion !== 1 || r.type !== 'bootstrap.init' || !uuid(r.runId)) return undefined;
  return Object.freeze({ contractVersion: 1, type: 'bootstrap.init', runId: r.runId });
}
export function parseUtilityResult(value: unknown, runId: string): UtilityResult | undefined {
  const r = record(value);
  if (!r || !uuid(runId) || r.contractVersion !== 1 || r.type !== 'bootstrap.result' || r.runId !== runId) return undefined;
  if (r.ok === true && exact(r, ['contractVersion', 'type', 'runId', 'ok', 'sdkVersion', 'assetsVerified']) && r.sdkVersion === SDK_VERSION && r.assetsVerified === true)
    return Object.freeze({ contractVersion: 1, type: 'bootstrap.result', runId, ok: true, sdkVersion: SDK_VERSION, assetsVerified: true });
  if (r.ok === false && exact(r, ['contractVersion', 'type', 'runId', 'ok', 'errorCode']) && (r.errorCode === 'SDK_UNAVAILABLE' || r.errorCode === 'SDK_ASSET_MISSING' || r.errorCode === 'INTERNAL'))
    return Object.freeze({ contractVersion: 1, type: 'bootstrap.result', runId, ok: false, errorCode: r.errorCode });
  return undefined;
}
