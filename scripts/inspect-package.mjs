import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, lstatSync, realpathSync, readdirSync } from 'node:fs';
import { listPackage, statFile, extractFile } from '@electron/asar';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packageRoot = path.join(root, 'out/gabPrd-win32-x64');
const archive = path.join(packageRoot, 'resources/app.asar');
const unpacked = archive + '.unpacked';
function assert(condition) { if (!condition) throw new Error('Packaged bootstrap asset/production-closure or exclusion check failed.'); }
function contained(base, file) {
  const relative = path.relative(base, file);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
}
function screenDisk(directory, boundary, archivedFiles) {
  assert(contained(boundary, realpathSync(directory)));
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    assert(!lstatSync(file).isSymbolicLink() && contained(boundary, realpathSync(file)));
    if (entry.isDirectory()) screenDisk(file, boundary, archivedFiles);
    else {
      const relative = path.relative(unpacked, file).replaceAll('\\', '/');
      assert(!/\.map$/i.test(file) && archivedFiles.has(relative) && statFile(archive, path.normalize(relative)).unpacked);
    }
  }
}
try {
  assert(process.platform === 'win32' && process.arch === 'x64');
  assert(existsSync(path.join(packageRoot, 'gabPrd.exe')) && existsSync(archive));
  const boundary = realpathSync(packageRoot);
  assert(contained(boundary, realpathSync(archive)) && !lstatSync(archive).isSymbolicLink());
  const files = listPackage(archive, { isPack: false }).map(file => file.replaceAll('\\', '/').replace(/^\/+/, ''));
  const set = new Set(files);
  const read = file => { assert(set.has(file)); const bytes = extractFile(archive, path.normalize(file)); assert(bytes.length > 0); return bytes; };
  const json = file => JSON.parse(read(file).toString('utf8'));
  // Independently enumerate the exact OpenAI7.19 executable-code exception, not session data.
  const openAiPrefix='node_modules/openai/resources/beta/agents/sessions';
  const openAiStems=['artifacts','events','index','items','sessions','subagents','turns','subagents/index','subagents/items','subagents/subagents','subagents/turns','subagents/turns/index','subagents/turns/items','subagents/turns/turns'];
  const openAiFiles=openAiStems.flatMap(stem=>['js','mjs'].map(extension=>openAiPrefix+'/'+stem+'.'+extension));
  const openAiAllowed=new Set([openAiPrefix,openAiPrefix+'/subagents',openAiPrefix+'/subagents/turns',...openAiFiles]);
  assert(json('node_modules/openai/package.json').version==='7.19.0');
  for(const file of openAiFiles)assert(read(file).equals(readFileSync(path.join(root,file))));
  const ownAssets = new Set(['.webpack', '.webpack/main', '.webpack/main/index.cjs', '.webpack/main/pi-utility.cjs',
    '.webpack/renderer', '.webpack/renderer/main_window', '.webpack/renderer/main_window/preload.cjs',
    '.webpack/renderer/main_window/index.html', '.webpack/renderer/main_window/index.js', '.webpack/renderer/main_window/shell.css']);
  for (const file of files) {
    assert(['package.json', 'package-lock.json', 'node_modules'].includes(file) || ownAssets.has(file) || file.startsWith('node_modules/'));
    assert(!/\.map$/i.test(file));
    assert(!file.split('/').some(part => ['..', '.git', '.pi', '.agents', '.bin', 'node_gyp_bins'].includes(part)));
    assert(!/(^|\/)(\.env(?:\.[^/]*)?|auth\.json|credentials(?:\.json)?)(\/|$)/i.test(file));
    assert(!/(^|\/)sessions(\/|$)/i.test(file) || openAiAllowed.has(file));
    const stat = statFile(archive, path.normalize(file), false);
    if ('link' in stat) {
      const target = path.posix.normalize(stat.link);
      assert(!target.startsWith('../') && !path.posix.isAbsolute(target) && target.startsWith('node_modules/'));
    }
    if ('size' in stat) {
      const bytes = extractFile(archive, path.normalize(file));
      assert(!bytes.includes(Buffer.from('BOOTSTRAP_SENTINEL_SECRET_DO_NOT_EMIT')));
      if (/\.(node|wasm)$/i.test(file)) {
        const disk = path.join(unpacked, file);
        assert(stat.unpacked && existsSync(disk) && contained(boundary, realpathSync(disk)) && !lstatSync(disk).isSymbolicLink());
        assert(readFileSync(disk).equals(bytes));
        if (file.endsWith('.wasm')) assert(bytes.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109])));
      }
    }
  }
  screenDisk(unpacked, boundary, set);
  const manifest = json('package.json');
  assert(manifest.name === 'gabprd' && manifest.version === '0.0.0' && manifest.main === '.webpack/main/index.cjs');
  const sourceManifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  for (const [location, metadata] of Object.entries(lock.packages)) {
    if (!location) continue;
    if (metadata.dev) { assert(!set.has(location) && !set.has(location + '/package.json')); continue; }
    // Optional platform packages absent from this real installation are not required on Windows.
    if (!existsSync(path.join(root, location, 'package.json')) && metadata.optional) continue;
    assert(json(location + '/package.json').version === metadata.version);
  }
  for (const [name, version] of Object.entries(sourceManifest.dependencies)) {
    assert(manifest.dependencies[name] === version && json('node_modules/' + name + '/package.json').version === version);
  }
  const sdkRoot = 'node_modules/@earendil-works/pi-coding-agent';
  const sdk = json(sdkRoot + '/package.json');
  assert(sdk.version === '1.1.0' && sdk.type === 'module');
  // Known packaged locations only; no SDK getPackageDir(), imports or host-ABI SQLite loads.
  for (const asset of ['package.json', 'README.md', 'docs/sdk.md', 'dist/index.js',
    'dist/modes/interactive/theme/dark.json', 'dist/modes/interactive/theme/light.json', 'dist/core/export-html/template.html']) read(sdkRoot + '/' + asset);
  for (const asset of ['node_modules/@silvia-odwyer/photon-node/photon_rs_bg.wasm', 'node_modules/quickjs-wasi/quickjs.wasm',
    'node_modules/better-sqlite3/prebuilds/win32-x64.node']) {
    read(asset); assert(statFile(archive, path.normalize(asset)).unpacked && existsSync(path.join(unpacked, asset)));
  }
  for (const asset of ownAssets) if (/\.(cjs|js|html|css)$/.test(asset)) read(asset);
  for (const asset of ['.webpack/main/index.cjs', '.webpack/main/pi-utility.cjs', '.webpack/renderer/main_window/preload.cjs', '.webpack/renderer/main_window/index.js']) {
    const text = read(asset).toString('utf8');
    assert(!/sourceMappingURL|\beval\s*\(/.test(text));
  }
  const utility = read('.webpack/main/pi-utility.cjs').toString('utf8');
  assert(/import\(["']@earendil-works\/pi-coding-agent["']\)/.test(utility));
  const html = read('.webpack/renderer/main_window/index.html').toString('utf8');
  assert(/src=["'](?:\.\/)?index\.js["']/.test(html) && /href=["'](?:\.\/)?shell\.css["']/.test(html));
  console.log('Known app.asar production closure, fixed shell/SDK/native/WASM assets, unpacked locations and exclusions verified. Runtime loading remains a separate gate.');
} catch {
  console.error('Package inspection failed safely: missing/unsupported artifact, invalid production closure, asset or excluded content. No files were changed.');
  process.exitCode = 1;
}
