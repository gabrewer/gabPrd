import { randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync, readSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FixtureContext, FixtureMarker } from '../shared/bootstrap-contracts';
import { safeError } from '../shared/bootstrap-validation';

const MARKER = 'bootstrap-owner.json';
const DATABASE = 'bootstrap.sqlite3';
// Private bootstrap paths, not product storage names or user-config discovery.
const CHILDREN = ['user-data', 'session-data', 'logs', 'pi-config'] as const;
const identities = new WeakMap<FixtureContext, { root: Stats; marker: Stats }>();
function invalid(): never { throw new Error(safeError('FIXTURE_INVALID').message); }
function guarded<T>(action: () => T): T { try { return action(); } catch { return invalid(); } }
function descendant(base: string, candidate: string): boolean {
  const relative = path.relative(base, candidate);
  return relative !== '' && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep);
}
function same(a: Stats, b: Stats): boolean { return a.dev === b.dev && a.ino === b.ino && a.birthtimeMs === b.birthtimeMs; }
function optionalStat(file: string): Stats | undefined {
  try { return lstatSync(file); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
function directory(file: string): Stats {
  const stat = lstatSync(file);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(file) !== file) invalid();
  return stat;
}
function canonicalRoot(root: string): Stats {
  if (typeof root !== 'string' || !path.isAbsolute(root) || path.resolve(root) !== root || realpathSync(root) !== root) invalid();
  const temporary = realpathSync(tmpdir());
  if (!descendant(temporary, root)) invalid();
  // Inspect every component of the canonical path, not just the final directory.
  const parsed = path.parse(root);
  let current = parsed.root;
  directory(current);
  for (const component of root.slice(parsed.root.length).split(path.sep)) {
    current = path.join(current, component);
    directory(current);
    // Reject repository checkouts even when they happen to live under OS temp.
    if (optionalStat(path.join(current, '.git'))) invalid();
  }
  return directory(root);
}
function regular(file: string, limit: number): Stats {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > limit || realpathSync(file) !== file) invalid();
  return stat;
}
function readMarker(root: string): { value: FixtureMarker; stat: Stats } {
  const file = path.join(root, MARKER), stat = regular(file, 4096);
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes: Buffer;
  try {
    if (!same(stat, fstatSync(fd))) invalid();
    bytes = Buffer.alloc(4097);
    const length = readSync(fd, bytes, 0, bytes.length, 0);
    if (length > 4096 || length !== stat.size || !same(stat, regular(file, 4096))) invalid();
    bytes = bytes.subarray(0, length);
  } finally { closeSync(fd); }
  const value: unknown = JSON.parse(bytes.toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const r = value as Record<string, unknown>;
  const keys = ['schemaVersion', 'fixtureId', 'canonicalRoot', 'databaseExpected'];
  if (Object.keys(r).length !== keys.length || !keys.every(k => Object.hasOwn(r, k)) || r.schemaVersion !== 1
    || typeof r.fixtureId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(r.fixtureId)
    || r.canonicalRoot !== root || typeof r.databaseExpected !== 'boolean') invalid();
  return { value: Object.freeze({ schemaVersion: 1, fixtureId: r.fixtureId, canonicalRoot: root, databaseExpected: r.databaseExpected }), stat };
}
function inspect(root: string, allowReservedMissing = false): FixtureContext {
  const rootStat = canonicalRoot(root), marker = readMarker(root);
  for (const child of CHILDREN) {
    const file = path.join(root, child);
    if (optionalStat(file)) directory(file);
  }
  const database = path.join(root, DATABASE), databaseStat = optionalStat(database);
  if (databaseStat) {
    if (!marker.value.databaseExpected) invalid();
    regular(database, 1024 * 1024);
  } else if (marker.value.databaseExpected && !allowReservedMissing) invalid();
  if (!same(rootStat, canonicalRoot(root)) || !same(marker.stat, regular(path.join(root, MARKER), 4096))) invalid();
  const context: FixtureContext = Object.freeze({ root, fixtureId: marker.value.fixtureId, databaseExpected: marker.value.databaseExpected,
    database, userData: path.join(root, CHILDREN[0]), sessionData: path.join(root, CHILDREN[1]), logs: path.join(root, CHILDREN[2]), piDirectory: path.join(root, CHILDREN[3]) });
  identities.set(context, { root: rootStat, marker: marker.stat });
  return context;
}
function recheck(context: FixtureContext): FixtureContext {
  const identity = identities.get(context);
  if (!identity) invalid();
  const fresh = inspect(context.root);
  const next = identities.get(fresh)!;
  if (!same(identity.root, next.root) || !same(identity.marker, next.marker)
    || fresh.fixtureId !== context.fixtureId || fresh.databaseExpected !== context.databaseExpected) invalid();
  for (const key of ['root', 'database', 'userData', 'sessionData', 'logs', 'piDirectory'] as const) if (fresh[key] !== context[key]) invalid();
  return fresh;
}
export function createFixture(): FixtureContext {
  return guarded(() => {
    const root = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), 'gabprd-bootstrap-')));
    canonicalRoot(root);
    const marker: FixtureMarker = { schemaVersion: 1, fixtureId: randomUUID(), canonicalRoot: root, databaseExpected: false };
    writeFileSync(path.join(root, MARKER), JSON.stringify(marker), { flag: 'wx', mode: 0o600 });
    return inspect(root);
  });
}
/** Read-only: callers must invoke again after obtaining their single-instance lock. */
export function validateFixture(root: string): FixtureContext { return guarded(() => inspect(root)); }
export function prepareFixtureDirectories(context: FixtureContext): void {
  guarded(() => {
    recheck(context);
    for (const child of CHILDREN) {
      recheck(context);
      const file = path.join(context.root, child);
      if (!optionalStat(file)) mkdirSync(file, { mode: 0o700 });
      directory(file);
      recheck(context);
    }
  });
}
export function reserveDatabase(context: FixtureContext): FixtureContext {
  return guarded(() => {
    const fresh = recheck(context);
    if (fresh.databaseExpected || optionalStat(fresh.database)) invalid();
    const marker: FixtureMarker = { schemaVersion: 1, fixtureId: fresh.fixtureId, canonicalRoot: fresh.root, databaseExpected: true };
    const bytes = JSON.stringify(marker);
    if (Buffer.byteLength(bytes) > 4096) invalid();
    // Atomic replacement on the owned root. No reset/retry/cleanup on interruption.
    const temporary = path.join(fresh.root, 'bootstrap-owner-' + randomUUID() + '.tmp');
    recheck(context);
    const fd = openSync(temporary, 'wx', 0o600);
    try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
    regular(temporary, 4096);
    recheck(context);
    renameSync(temporary, path.join(fresh.root, MARKER));
    // Expected=true/missing is permitted ONLY within this reservation operation.
    const reserved = inspect(fresh.root, true);
    if (reserved.fixtureId !== fresh.fixtureId || !reserved.databaseExpected
      || !same(identities.get(reserved)!.root, identities.get(fresh)!.root) || optionalStat(reserved.database)) invalid();
    const databaseFd = openSync(reserved.database, 'wx', 0o600);
    try { fsyncSync(databaseFd); } finally { closeSync(databaseFd); }
    const result = inspect(reserved.root);
    if (result.fixtureId !== reserved.fixtureId || !result.databaseExpected
      || !same(identities.get(result)!.root, identities.get(reserved)!.root)
      || !same(identities.get(result)!.marker, identities.get(reserved)!.marker)) invalid();
    return result;
  });
}
