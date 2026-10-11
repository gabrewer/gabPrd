# gabPrd
A Windows PRD-writing companion to [gabCode](https://github.com/gabrewer/gabCode), powered by interactive Pi conversations.

## Status

Original planning statement: “Product definition only; implementation has not started.” See the [initial product requirements](docs/design/2026-10-09-prd-creator-prd.md).

BOOT-001 provides a bounded Windows desktop toolchain and bootstrap shell with secure preload/IPC, fixture validation, a native SQLite probe and Pi utility import/asset checks. The automated verifier builds and inspects the package, then exercises the actual packaged Windows executable for native SQLite loading/reopen/restart, SDK import/assets and bootstrap boundary checks; sources and type/unit checks alone are not packaged runtime evidence. See [BOOT-001 / issue #9](https://github.com/gabrewer/gabPrd/issues/9) and [planning epic #8](https://github.com/gabrewer/gabPrd/issues/8) for authoritative execution evidence and remaining human Windows, quality-review, commit, final-smoke and acceptance gates. Conversations, documents and publishing are not implemented by this bootstrap.

## Potential shared component

Neither gabPrd nor gabCode currently has a Markdown editor. A future editor and preview component could be built for use by both projects; the technology and sharing approach remain open.

The original statement above is preserved as planning history. The PRD now selects CodeMirror 6 and a React Markdown preview for future gabPrd work; sharing with gabCode remains undecided and is not a dependency.

## BOOT-001 local toolchain

Use Windows x64, Node 24.13.0+ within major 24 and npm 11.6.2+ within major 11 (declared baseline: npm 11.6.2). Dependencies are exact-pinned in the npm-generated manifest/lockfile. From this repository root:

```text
npm ci
npm audit --json
npm audit --omit=dev --json
npm run typecheck
npm run test:unit
npm run rebuild:sqlite
npm run package
npm run inspect:package
npm run test:runtime
npm run verify:bootstrap
```

- `typecheck`: strict app/shared/preload/utility and test TypeScript; `test:unit`: sequential Node/tsx contract/state/fixture tests, not host-Node SQLite loading.
- `rebuild:sqlite`: only better-sqlite3, Electron 44.7.0 x64 (Electron Node 24.21.0 / ABI 149, not the host ABI).
- `build` and `package`: both invoke Forge packaging for Windows x64. Output contract: `out/gabPrd-win32-x64/gabPrd.exe` and `resources/app.asar`, not an installer.
- `inspect:package`: read-only closure/asset/pruning/native/WASM/source-map/exclusion checks on that known package. It never imports SQLite or the Pi SDK in host Node.
- `test:runtime`: Playwright drives the packaged Electron executable with sandbox/CSP intact; no browser download is needed. Evidence goes under ignored `.pi/tmp/bootstrap-evidence/`.
- `verify:bootstrap`: fail-fast environment diagnostics → typecheck → unit → SQLite rebuild → package → inspect → packaged runtime tests. Run through npm; the driver uses Node plus npm's CLI path and argument arrays, not shell strings or `npm.cmd` execution. It does not install or repair prerequisites.
- `npm start`: Forge local convenience only, not packaged evidence. Forge `generateAssets` uses the pinned Webpack JavaScript compiler for main, utility, renderer and sandboxed CommonJS preload. Start and package both compile in production mode, without dev server/HMR/eval/source maps or CSP relaxation. Restart manually after source changes.

Native source-build fallback requires Python 3 and Visual Studio C++/Windows SDK tools. Diagnostics report absent prerequisites safely; no tool installation, auth inspection or remediation is performed. The declared environment/native checks do not prove an Electron native rebuild succeeds.

The package allowlist retains metadata, generated `.webpack` bundles and pruned production `node_modules`; SDK ESM/package-relative assets remain external. Native `.node` and WASM assets are unpacked. Checkout source/tests/team resources, user/session/draft/credential files and source maps are excluded. Clean-machine/permission evidence is not established. Unavailable manual evidence for Windows keyboard/Narrator, real 200% OS display scaling plus app zoom, actual Windows reduced-motion and accessible failure-screen walkthroughs is **NOT CHECKED** and blocks unless a human explicitly accepts the gap; automated focus/zoom/media-emulation checks do not replace it. See [BOOT-001 / issue #9](https://github.com/gabrewer/gabPrd/issues/9) for the authoritative current execution disposition. No Squirrel installer, signing, updater, distribution, provider/session/repository operation or publication is established here.
