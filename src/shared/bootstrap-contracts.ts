/** BOOT-001 only. These contracts do not grant product/session/repository capabilities. */
export const CONTRACT_VERSION = 1 as const;
export const STATUS_CHANNEL = 'gabprd.bootstrap.status' as const;
export const SHELL_URL = 'gabprd://app/main_window/index.html' as const;
export const SDK_VERSION = '1.1.0' as const;
export const SQLITE_DRIVER_VERSION = '13.0.3' as const;
export const UTILITY_TIMEOUT_MS = 15_000;
export const SHUTDOWN_TIMEOUT_MS = 5_000;

export const ERROR_MESSAGES = Object.freeze({
  INVALID_REQUEST: 'The startup status request was not valid.',
  UNAUTHORIZED_CALLER: 'This window cannot request startup status.',
  FIXTURE_INVALID: 'The temporary test workspace could not be verified. Existing data was left in place.',
  SQLITE_UNAVAILABLE: 'The temporary database check could not finish. Existing data was left in place.',
  SQLITE_CORRUPT: 'The temporary database could not be verified. It was not reset or replaced.',
  SDK_UNAVAILABLE: 'The packaged Pi runtime could not be loaded. Conversations are not enabled in this build.',
  SDK_ASSET_MISSING: 'A packaged Pi runtime asset is missing. Conversations are not enabled in this build.',
  UTILITY_TIMEOUT: 'The Pi runtime check took too long and was stopped.',
  UTILITY_EXITED: 'The Pi runtime check stopped unexpectedly.',
  INTERNAL: 'The startup check could not finish safely. Existing data was left in place.',
} as const);
export type BootstrapErrorCode = keyof typeof ERROR_MESSAGES;
export type BootstrapError = Readonly<{ code: BootstrapErrorCode; message: string }>;
export type BootstrapState = 'starting' | 'ready' | 'failed' | 'stopping';
export type PendingCheck = Readonly<{ status: 'pending' }>;
export type FailedCheck = Readonly<{ status: 'failed'; error: BootstrapError }>;
export type SqliteCheck = PendingCheck | FailedCheck | Readonly<{
  status: 'passed'; driverVersion: typeof SQLITE_DRIVER_VERSION; reopenVerified: true;
}>;
export type PiSdkCheck = PendingCheck | FailedCheck | Readonly<{
  status: 'passed'; sdkVersion: typeof SDK_VERSION; assetsVerified: true;
}>;
export type BootstrapSnapshot = Readonly<{
  contractVersion: typeof CONTRACT_VERSION;
  state: BootstrapState;
  sqlite: SqliteCheck;
  piSdk: PiSdkCheck;
}>;
export type BootstrapRequest = Readonly<{ contractVersion: typeof CONTRACT_VERSION }>;
export type BootstrapResult = Readonly<{ ok: true; snapshot: BootstrapSnapshot }>
  | Readonly<{ ok: false; error: BootstrapError }>;
export interface BootstrapBridge {
  getStatus(): Promise<BootstrapResult>;
}

export type UtilityErrorCode = 'SDK_UNAVAILABLE' | 'SDK_ASSET_MISSING' | 'INTERNAL';
export type UtilityInit = Readonly<{
  contractVersion: typeof CONTRACT_VERSION; type: 'bootstrap.init'; runId: string;
}>;
export type UtilityResult = Readonly<{
  contractVersion: typeof CONTRACT_VERSION; type: 'bootstrap.result'; runId: string;
  ok: true; sdkVersion: typeof SDK_VERSION; assetsVerified: true;
}> | Readonly<{
  contractVersion: typeof CONTRACT_VERSION; type: 'bootstrap.result'; runId: string;
  ok: false; errorCode: UtilityErrorCode;
}>;

/** Main/test-harness only; never included in a renderer snapshot. */
export type FixtureMarker = Readonly<{
  schemaVersion: 1; fixtureId: string; canonicalRoot: string; databaseExpected: boolean;
}>;
export type FixtureContext = Readonly<{
  root: string; fixtureId: string; databaseExpected: boolean;
  database: string; userData: string; sessionData: string; logs: string; piDirectory: string;
}>;
export type CallerIdentity = Readonly<{ sender: object; frame: object | null; url: string }>;
export type ExpectedCaller = Readonly<{ sender: object; mainFrame: object; url: string }>;
export interface BootstrapController {
  snapshot(): BootstrapSnapshot;
  completeSqlite(check: Exclude<SqliteCheck, PendingCheck>): boolean;
  acceptUtility(value: unknown): boolean;
  failUtility(code: 'UTILITY_TIMEOUT' | 'UTILITY_EXITED' | 'INTERNAL'): boolean;
  stop(): void;
}
