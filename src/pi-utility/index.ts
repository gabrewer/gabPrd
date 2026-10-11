import type {} from 'electron';
import { closeSync, lstatSync, openSync, readFileSync, readSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { SDK_VERSION } from '../shared/bootstrap-contracts';
import type { UtilityErrorCode, UtilityResult } from '../shared/bootstrap-contracts';
import { parseUtilityInit } from '../shared/bootstrap-validation';

const appRoot = path.resolve(__dirname, '../..');
const modules = path.join(appRoot, 'node_modules');
const sdkRoot = path.join(modules, '@earendil-works', 'pi-coding-agent');
const requireFromSdk = createRequire(path.join(sdkRoot, 'package.json'));

function reject(): never { throw new Error(); }
/** Only fixed own-production-tree paths. No global resolution fallback or resource discovery. */
function packagedFile(file: string): void {
  const relative = path.relative(appRoot, file);
  if (path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep)) reject();
  let current = appRoot;
  if (realpathSync(current) !== current || lstatSync(current).isSymbolicLink()) reject();
  for (const component of relative.split(path.sep)) {
    current = path.join(current, component);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || realpathSync(current) !== current) reject();
  }
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.size === 0) reject();
}
function wasm(file: string): void {
  packagedFile(file);
  const descriptor = openSync(file, 'r');
  try {
    const header = Buffer.alloc(8);
    if (readSync(descriptor, header, 0, 8, 0) !== 8
      || !header.equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]))) reject();
  } finally { closeSync(descriptor); }
}
async function probe(runId: string): Promise<UtilityResult> {
  let failure: UtilityErrorCode = 'SDK_UNAVAILABLE';
  try {
    // The fixed local package must exist before native bare-specifier import can run.
    // Never require() the SDK: its public export is import-only.
    if (Object.hasOwn(process.env, 'PI_PACKAGE_DIR')) reject();
    const manifest = path.join(sdkRoot, 'package.json');
    packagedFile(manifest);
    if (lstatSync(manifest).size > 64 * 1024) reject();
    const metadata = JSON.parse(readFileSync(manifest, 'utf8')) as {
      name?: unknown; version?: unknown; type?: unknown;
      exports?: { '.'?: { import?: unknown } };
    };
    if (metadata.name !== '@earendil-works/pi-coding-agent' || metadata.version !== SDK_VERSION
      || metadata.type !== 'module' || metadata.exports?.['.']?.import !== './dist/index.js') reject();
    const entry = path.join(sdkRoot, 'dist', 'index.js');
    packagedFile(entry);
    const sdk = await import('@earendil-works/pi-coding-agent');
    if (sdk.VERSION !== SDK_VERSION || typeof sdk.getPackageDir !== 'function'
      || sdk.getPackageDir() !== sdkRoot) reject();
    failure = 'SDK_ASSET_MISSING';
    for (const asset of ['package.json', 'README.md', 'docs/sdk.md',
      'dist/modes/interactive/theme/dark.json', 'dist/modes/interactive/theme/light.json',
      'dist/core/export-html/template.html']) packagedFile(path.join(sdkRoot, asset));
    // Exact asset locations inspected in the approved npm production tree; no WASM execution.
    const quickjs = path.join(modules, 'quickjs-wasi', 'quickjs.wasm');
    const photon = path.join(modules, '@silvia-odwyer', 'photon-node', 'photon_rs_bg.wasm');
    if (requireFromSdk.resolve('quickjs-wasi/quickjs.wasm') !== quickjs
      || requireFromSdk.resolve('@silvia-odwyer/photon-node/photon_rs_bg.wasm') !== photon) reject();
    wasm(quickjs);
    wasm(photon);
    return { contractVersion: 1, type: 'bootstrap.result', runId, ok: true,
      sdkVersion: SDK_VERSION, assetsVerified: true };
  } catch {
    return { contractVersion: 1, type: 'bootstrap.result', runId, ok: false, errorCode: failure };
  }
}

// An entrypoint, not a CLI/session factory. Consume at most one incoming init.
const port = process.parentPort;
if (process.type === 'utility' && port) {
  // Keep the owned child visible after the completed handshake until main kills its handle.
  setInterval(() => {}, 1000);
  port.once('message', (event: { data: unknown }) => {
    const init = parseUtilityInit(event.data);
    if (!init) return;
    void probe(init.runId).then(result => {
      try { port.postMessage(result); } catch { /* Parent deadline/exit owns the safe outcome. */ }
    }, () => {
      try { port.postMessage({ contractVersion: 1, type: 'bootstrap.result', runId: init.runId,
        ok: false, errorCode: 'INTERNAL' } satisfies UtilityResult); } catch { /* No raw errors. */ }
    });
  });
}
