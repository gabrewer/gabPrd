import Database from 'better-sqlite3';
import { lstatSync } from 'node:fs';
import type { Stats } from 'node:fs';
import path from 'node:path';
import { SQLITE_DRIVER_VERSION } from '../shared/bootstrap-contracts';
import type { FixtureContext, PendingCheck, SqliteCheck } from '../shared/bootstrap-contracts';
import { safeError } from '../shared/bootstrap-validation';
import { reserveDatabase, validateFixture } from './fixture-root';

const VALUE = 'gabprd-bootstrap-v1';
const SCHEMA = 'CREATE TABLE bootstrap_probe (fixture_id TEXT NOT NULL, probe_value TEXT NOT NULL) STRICT';
const LIMIT = 1024 * 1024;
type FailureCode = 'FIXTURE_INVALID' | 'SQLITE_UNAVAILABLE' | 'SQLITE_CORRUPT';
type Identity = { root: Stats; marker: Stats; database: Stats | undefined };
function same(a: Stats, b: Stats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.birthtimeMs === b.birthtimeMs;
}
function reject(): never { throw new Error(); }
function identity(context: FixtureContext): Identity {
  return { root: lstatSync(context.root), marker: lstatSync(path.join(context.root, 'bootstrap-owner.json')),
    database: context.databaseExpected ? lstatSync(context.database) : undefined };
}
/** Repeat the backend's marker/root/child/link checks immediately before native opens. */
function revalidate(context: FixtureContext, previous: Identity): void {
  const fresh = validateFixture(context.root);
  for (const key of ['root', 'fixtureId', 'databaseExpected', 'database', 'userData', 'sessionData', 'logs', 'piDirectory'] as const) {
    if (fresh[key] !== context[key]) reject();
  }
  const current = identity(fresh);
  if (!same(previous.root, current.root) || !same(previous.marker, current.marker)
    || (previous.database && (!current.database || !same(previous.database, current.database)))) reject();
  // A fixture has no WAL/recovery state. Do not let SQLite recover foreign sidecars.
  for (const suffix of ['-journal', '-wal', '-shm']) {
    try { lstatSync(context.database + suffix); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    reject();
  }
  if (current.database && current.database.size > LIMIT) reject();
}
function verify(db: Database.Database, fixtureId: string): void {
  const objects = db.prepare<[], { type: string; name: string; tbl_name: string; sql: string }>(
    'SELECT type, name, tbl_name, sql FROM sqlite_schema LIMIT 2').all();
  if (objects.length !== 1 || objects[0]?.type !== 'table' || objects[0].name !== 'bootstrap_probe'
    || objects[0].tbl_name !== 'bootstrap_probe' || objects[0].sql !== SCHEMA) reject();
  const rows = db.prepare<[], { fixture_id: unknown; probe_value: unknown }>(
    'SELECT fixture_id, probe_value FROM bootstrap_probe LIMIT 2').all();
  if (rows.length !== 1 || rows[0]?.fixture_id !== fixtureId || rows[0].probe_value !== VALUE) reject();
  const checks = db.pragma('quick_check') as { quick_check?: unknown }[];
  if (!Array.isArray(checks) || checks.length !== 1 || checks[0]?.quick_check !== 'ok') reject();
}
function corrupt(error: unknown): boolean {
  // Only inspect a native error code, never interpolate or log its message/cause.
  try {
    const code = error && typeof error === 'object' ? Object.getOwnPropertyDescriptor(error, 'code')?.value : undefined;
    return code === 'SQLITE_NOTADB' || code === 'SQLITE_CORRUPT';
  } catch { return false; }
}

/** Main calls once, after acquiring the selected fixture's single-instance lock. */
export function probeSqlite(fixture: FixtureContext): Exclude<SqliteCheck, PendingCheck> {
  let failure: FailureCode | undefined;
  let phase: FailureCode = 'FIXTURE_INVALID';
  let writer: Database.Database | undefined;
  let reader: Database.Database | undefined;
  try {
    const creation = !fixture.databaseExpected;
    let context = fixture;
    let owned = identity(context);
    revalidate(context, owned);
    if (creation) {
      // Backend consumes intent BEFORE wx reservation; interruption is never reseeded.
      context = reserveDatabase(fixture);
      owned = identity(context);
      revalidate(context, owned);
      if (owned.database?.size !== 0) reject();
      phase = 'SQLITE_UNAVAILABLE';
      // The constructor lazily loads the native addon: keep it inside this catch.
      writer = new Database(context.database, { fileMustExist: true, timeout: 1000 });
      writer.transaction(() => {
        writer!.exec(SCHEMA);
        writer!.prepare<[string, string]>('INSERT INTO bootstrap_probe (fixture_id, probe_value) VALUES (?, ?)')
          .run(context.fixtureId, VALUE);
      }).exclusive();
      phase = 'SQLITE_CORRUPT';
      verify(writer, context.fixtureId);
      writer.close();
      writer = undefined;
    }
    phase = 'FIXTURE_INVALID';
    revalidate(context, owned);
    phase = 'SQLITE_UNAVAILABLE';
    reader = new Database(context.database, { readonly: true, fileMustExist: true, timeout: 1000 });
    phase = 'SQLITE_CORRUPT';
    verify(reader, context.fixtureId);
    reader.close();
    reader = undefined;
    phase = 'FIXTURE_INVALID';
    revalidate(context, owned);
  } catch (error) {
    failure = corrupt(error) && phase !== 'FIXTURE_INVALID' ? 'SQLITE_CORRUPT' : phase;
  } finally {
    // Attempt every remaining native close even if one close itself throws.
    for (const handle of [writer, reader]) {
      try { if (handle?.open) handle.close(); } catch { failure = 'SQLITE_UNAVAILABLE'; }
    }
  }
  return failure ? Object.freeze({ status: 'failed', error: safeError(failure) })
    : Object.freeze({ status: 'passed', driverVersion: SQLITE_DRIVER_VERSION, reopenVerified: true });
}
