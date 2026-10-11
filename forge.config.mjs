import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { lstatSync, realpathSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import webpack from 'webpack';
import AutoUnpackNativesPlugin from '@electron-forge/plugin-auto-unpack-natives';
const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
function contained(base, file) {
  const relative = path.relative(base, file);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
}
function screenTree(directory, boundary) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.bin') continue;
    const file = path.join(directory, entry.name);
    const stat = lstatSync(file);
    if (stat.isSymbolicLink()) {
      if (!contained(boundary, realpathSync(file))) throw new Error('Package tree contains an escaping link.');
      // Do not recurse through links; their real targets are screened in the owned tree.
    } else if (stat.isDirectory()) screenTree(file, boundary);
  }
}
export function packageIgnore(file) {
  const name = file.replaceAll('\\', '/').replace(/^\/+/, '');
  if (!name) return false;
  if (name.split('/').some(part => ['..', '.git', '.pi', '.agents', '.bin', 'node_gyp_bins'].includes(part))) return true;
  if (/\.map$/i.test(name) || /(^|\/)(\.env(?:\.[^/]*)?|auth\.json|credentials(?:\.json)?|sessions)(\/|$)/i.test(name)) return true;
  const allowed = ['package.json', 'package-lock.json'].includes(name)
    || name === '.webpack' || name.startsWith('.webpack/')
    || name === 'node_modules' || name.startsWith('node_modules/');
  if (!allowed) return true;
  const source = path.join(root, name);
  if (existsSync(source)) {
    const boundary = name.startsWith('node_modules') ? realpathSync(path.join(root, 'node_modules')) : realpathSync(root);
    if (!contained(boundary, realpathSync(source))) throw new Error('Package input escapes its owned tree.');
  }
  return false;
}
async function compile(config) {
  const compiler = webpack(config);
  await new Promise((resolve, reject) => {
    const finish = (error, stats) => {
      compiler.close(closeError => {
        if (error || closeError || !stats || stats.hasErrors()) reject(new Error('Bootstrap compilation failed; inspect owned source/configuration.'));
        else resolve();
      });
    };
    try { compiler.run(finish); } catch (error) { finish(error); }
  });
}
export default {
  outDir: path.join(root, 'out'),
  packagerConfig: {
    name: 'gabPrd', executableName: 'gabPrd', prune: true,
    asar: { unpack: '**/*.{node,wasm}' }, ignore: packageIgnore,
  },
  rebuildConfig: { force: true, onlyModules: ['better-sqlite3'], mode: 'sequential' },
  plugins: [new AutoUnpackNativesPlugin({})], makers: [], publishers: [],
  hooks: {
    generateAssets: async (_config, platform, arch) => {
      if (platform !== 'win32' || arch !== 'x64') throw new Error('Bootstrap supports Windows x64 only.');
      screenTree(path.join(root, 'node_modules'), realpathSync(path.join(root, 'node_modules')));
      // Sequential compilers share the renderer directory without deleting sibling outputs.
      for (const config of ['main', 'renderer', 'preload']) await compile(require(`./webpack.${config}.config.cjs`));
    },
    packageAfterCopy: async (_config, buildPath, version, platform, arch) => {
      if (version !== '44.7.0' || platform !== 'win32' || arch !== 'x64') throw new Error('Unexpected Electron native rebuild target.');
      screenTree(buildPath, realpathSync(buildPath));
    },
    packageAfterPrune: async (_config, buildPath) => {
      const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
      for (const [location, metadata] of Object.entries(lock.packages)) {
        if (metadata.dev && existsSync(path.join(buildPath, location))) throw new Error('Development dependency survived production pruning.');
      }
    },
  },
};
