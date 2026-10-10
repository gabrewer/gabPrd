# Electron guidance for gabPrd

## 1. Purpose, authority, and approved stack

This is a curated, documentation-only adaptation of the community Electron Development guide, not its unchanged installation. Use it through the existing roles and their task ownership. Paths in this reference are repository-root paths.

This reference does not authorize implementation, installation, automatic updates, publishing, or a new worker.

The product authority is `docs/design/2026-10-09-prd-creator-prd.md`; the approved task issue and its comments define execution scope. Those authorities and repository safety/orchestration instructions prevail over community examples. Return unresolved product, architecture, contract, or test-policy decisions to their owners rather than choosing them while coding.

Selected foundations:

- Electron, strict TypeScript, React, and the packaged Pi TypeScript SDK in an Electron utility process.
- Electron Forge + Webpack + npm + Squirrel.Windows for the proposed per-user Windows setup executable.
- Embedded `better-sqlite3` for local metadata; Pi-managed persistent session JSONL under the app's per-user data area, outside the selected repository.
- CodeMirror 6 source editing and read-only `react-markdown` + `remark-gfm` preview of the same document/revision, without raw HTML execution.

Do not substitute Vite, electron-builder/NSIS, pnpm, electron-store, tRPC, or an updater because an upstream example prefers it. Signing, updater/distribution policy, exact dependency versions, asset protocol, and implementation-ready bootstrap commands are not selected here. Pin compatible versions and verify APIs against those versions' official documentation during an approved bootstrap. The upstream and official-document revisions below are research snapshots, not a selected Electron release.

## 2. Process boundaries and typed IPC

Keep the renderer focused on accessible UI and untrusted Markdown/conversation display. Privileged filesystem, persistence, Git, session, and publication authority belongs to local services, not renderer-provided paths or UI locks. Main coordinates services and Electron lifecycle; the Pi adapter belongs in its approved utility process. A separate process is not automatically an OS sandbox or an authorization boundary.

- Explicitly preserve renderer `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, and normal web security. Do not weaken them to fix imports or native-module loading.
- Keep preload small and bundled for its sandboxed execution environment. Main-process module format and sandboxed-preload format have different constraints; main ESM support does not mean native ESM imports work in sandboxed preload. Check the pinned Electron version rather than asserting CommonJS is universally required.
- Expose narrow, operation-specific functions through `contextBridge`; do not expose raw `ipcRenderer`, `require`, arbitrary channel forwarding, generic filesystem/database execution, or unrestricted Node capabilities.
- Define shared command/result/event contracts through api-developer. An allowlist of channel names does not authorize arbitrary arguments or resource access. Shared types do not grant runtime privileges.
- Validate IPC sender/frame identity and runtime payloads before privileged work.
- Bind requests to the approved window/frame/origin and current operation/resource authority; reject missing, destroyed, untrusted or mismatched senders. Use the pinned version's supported frame/origin APIs, not a URL substring or a hard-coded example development origin.
- TypeScript types are not runtime validation.
- Validate schemas, bounds, identifiers, repository/worktree/branch/document/session links, saved revision and approval authority in local services before mutation. Resolve paths from validated authoritative records, not arbitrary renderer strings. Define stale/concurrent/cancelled behavior in the approved contracts.
- Return typed, bounded, secret-safe errors and explicit outcomes. Do not send raw provider payloads, exception messages, credentials, stack traces, subprocess arguments, or unrestricted error details to the renderer or logs. Keep structured state in structured fields, not JSON hidden in `error.message`.
- Remove IPC handlers/listeners on their defined lifecycle, and unsubscribe React effects on cleanup. Define request correlation and cancellation before adding callbacks; do not use synchronous IPC for privileged operations.

## 3. Files, assets, and Windows path safety

The upstream `file:save` example accepts any renderer-supplied string path. Do not reuse it for PRD editing: resource identity, containment, expected revision and write authority must all be validated before a write. A folder picker or string-type check alone does not establish document authority.

Never use a string-prefix check such as `filePath.startsWith(baseDir)` as path containment.

For example, `C:\gabPrd\renderer-backup\sentinel.txt` shares the prefix `C:\gabPrd\renderer` but is outside that directory. URL decoding can reveal traversal separators after an initial parse. Design path checks around path components and the actual filesystem policy, not textual prefix matching.

- Specify URL scheme/host, decoding, permitted assets, canonical path and containment rules before registering an asset protocol. Reject malformed encodings, traversal, absolute/drive/UNC escapes and unexpected hosts under the selected policy; do not silently repair an unauthorized target.
- A lexical relative-path check is not sufficient for symlinks/junctions/reparse points or check/use races. Resolve and validate actual repository/worktree/file/session associations using the selected Windows filesystem policy; test changed links and concurrent replacement. Do not invent a universal race-safe recipe from a short snippet.
- Separate immutable packaged assets from mutable PRDs, databases and sessions. Asset loading must not expose arbitrary local files. Validate installed/package paths as well as development paths; never fall back to an unrelated directory when an asset is missing.
- Preserve original checkouts, unrelated changes and completed conversation turns. Never silently overwrite a collision, rename an existing PRD, or use blanket worktree cleanup as recovery.

## 4. Content, navigation, and permissions

Treat Markdown, conversation text, URLs and renderer messages as untrusted data. Preview is read-only and cannot execute raw HTML or rewrite the source document. Specify external-link/image/resource policy before declaring rendering integration ready.

- Apply a restrictive CSP appropriate to the actual content origin and build output. HTTP-header delivery requires an HTTP-capable response; it is not a universal solution for `file://`. Electron documents meta-tag delivery for that case and recommends considering custom protocols. Exact production scheme/host/privileges remain an explicit bootstrap contract, not a copied `app://` example.
- Do not enable `unsafe-eval`, disable web security, or grant broad protocol privileges to make a build work. Validate development and production CSP separately; a development allowance is not a production policy.
- Deny unexpected navigation, new windows, webviews and permissions. Use APIs supported by the pinned Electron version, such as `setWindowOpenHandler`, rather than deprecated `new-window` recipes. Do not add BrowserView or remote-content embedding merely because upstream examples contain them.
- Before opening an external link, parse it and apply the explicitly selected scheme/host policy in the privileged service. Never pass a raw untrusted URL to `shell.openExternal`; an example allowlist is not our approved policy.
- Keep development servers on loopback with a defined trusted origin. A production app must not fall back to a development server or expose debugging ports. Test the actual packaged build and its installed assets.

## 5. Pi hosting and capability limits

Pin and package the Pi SDK and required runtime assets as application dependencies. Do not import arbitrary global CLI executable code into the app. Verify compatibility with Electron's bundled Node runtime and the utility-process entry's module format in an explicitly approved packaged probe.

The utility process has Node capabilities; renderer sandbox settings do not confine its filesystem, shell, network or Git operations.

Pi tool/extension policy remains deferred.

Neither an unrestricted configuration nor the earlier restrictive proposal is approved by this guide. Resolve affected capability/resource/compatibility contracts before mutating Pi integration becomes implementation-ready; preserve existing credential, document and publication protections meanwhile.

- Reuse existing configured Pi resources/authentication under the approved contracts. Do not copy credentials, relocate existing external configuration/sessions, install a replacement brainstorm skill, or silently fall back to generic chat.
- Validate the required configured brainstorm skill and exact repository/worktree/document/session linkage before starting or resuming work. A displayed transcript is not a resumable Pi session.
- Define startup/import/asset failure, streaming and completed-turn persistence, cancellation, provider failure, process exit/crash, retry and exact-session resumption semantics. Do not guess SDK event names or treat renderer closure as durable completion.
- Coordinate shutdown so saved documents and completed conversation turns remain durable; distinguish an operation that failed before mutation from one with an uncertain outcome. No automatic answers, approval, publication, or destructive cleanup.
- The integration specialist supplies official SDK evidence; the assigned builder implements approved contracts. New capability decisions return to the human, not a community skill's implied defaults.

## 6. Packaging and Windows release guidance

Use the approved Forge/Webpack/npm/Squirrel toolchain. Exact manifests, source layout, entry points, dependency pins and build/test/package commands must be established by the approved bootstrap; upstream scaffolding and its file names are not gabPrd implementation outputs.

- Verify main, preload, renderer and utility-process entries, packaged assets and production CSP. Exercise packaged startup rather than assuming development success proves distribution compatibility.
- Native modules need the correct Electron ABI/architecture. Forge integrates Electron rebuilding, but that does not prove `better-sqlite3` is actually externalized, unpacked where necessary and loadable in our package. Verify the selected Forge/Webpack native-module configuration and a real isolated SQLite round trip after packaging.
- Specify ASAR/native asset handling, resource paths and any fuse/integrity settings against the selected toolchain/version. ASAR packaging alone is not source secrecy or an integrity guarantee. Security hardening must not break the approved utility-process/SDK/native loading paths unnoticed.
- Keep app metadata/session storage under per-user app data and PRDs in their linked worktrees. Do not introduce JSON/electron-store persistence or migrate existing user data because the upstream sample does so.
- Handle the selected installer's startup events and normal startup distinctly under approved contracts; do not start sessions or mutate selected repositories during installer handling. Validate per-user permission and installed-path behavior.
- Signing/trust, prerequisite diagnostics, install/upgrade/uninstall data retention and release distribution require human decisions and real Windows evidence. Existing Pi/Git/gh availability/authentication is assumed, with safe diagnostics—not installation or login wizards.
- Do not add update polling, auto-install-on-quit, publisher configuration, release tags, certificate/cloud provisioning, or deployment without separate authorization. Squirrel selection does not select an updater policy.
- Package additions use the selected package manager CLI only after approval. Do not hand-edit dependency manifests or run community scaffolding scripts as documentation setup.

## 7. Document, persistence, and publication lifecycle

Preserve the approved editing policy: explicit Save/Ctrl+S with dirty-state visibility; save manual changes before Pi revisions; source read-only during Pi revisions; manual undo/redo; stale writes rejected without silently discarding edits. Main/local services enforce revision checks and serialized mutations—UI disabling is not the safety mechanism.

SQLite owns local metadata, Pi owns persistent session records, and Markdown remains in its isolated worktree. SQLite transactions cannot make Markdown, Git, provider/session and remote operations atomic. Define durable operation state, reconciliation and restart behavior through domain-modeler/api-developer before implementing retries. Do not swallow corrupt state and reset to defaults as the upstream settings sample does.

- Bind publication approval to the exact saved revision. Later manual/Pi/external edits invalidate approval. Revalidate links, revision and authority at the mutation boundary, including concurrent attempts.
- Publish only the explicitly approved PRD on its own branch; exclude conversations, metadata, credentials and unrelated files. Preserve post-publication draft/session linkage and distinguish last verified remote publication from the current draft.
- The product creates no PR, automatic merge, force-push or destructive workspace cleanup. Development review PRs are a separate authorized workflow, not a product permission.
- For uncertain push/process outcomes, verify reality before retrying or advancing state. Recovery must preserve original checkouts, saved documents, completed turns and unrelated user work.

## 8. Evidence and role handoffs

Required runtime evidence not executed is NOT CHECKED and blocking unless a human accepts the gap.

Use actual commands and frameworks established by an approved task. The existing commands `node verify/team-setup/check-resources.mjs` and `node verify/team-setup/test-validator.mjs` validate instruction resources only; they do not prove app security, packaged compatibility, runtime accessibility or human acceptance. Do not invent npm app commands or install Vitest/Playwright from an example. Playwright's Electron support is experimental and needs an explicit compatible-version/evidence decision if selected.

Require automated boundary evidence, not only mocks, type checking, screenshots, or a title/version smoke test:

- Trusted/untrusted/destroyed IPC frames, invalid and oversized payloads, forged or mismatched resource links, stale revisions, genuine concurrent edits/publication, and no mutation on rejection.
- Windows path/URL parsing, sibling-prefix bypass, drive/UNC/absolute escapes, symlinks/junctions and check/use races under the approved policy, in real temporary repositories/worktrees/files.
- Sentinel-secret tests for errors/logs, external-content/navigation rejection, packaged CSP, and credential exclusion from renderer/package/publication paths.
- Packaged Pi import/assets and approved lifecycle/resource/provider tests: missing skill, startup failure, streaming, cancellation, completed-turn durability, process crash and restart/resume. Bootstrap exclusions still apply until a task authorizes those checks.
- Real temporary Git repositories/remotes, persistence/restart, native SQLite loading/round trip, concurrent mutations, partial failure/reconciliation, document approval invalidation and exact scoped publication.
- Real Windows packaged startup and, when authorized, installation/upgrade/uninstall with prerequisite absence and data-retention checks. Developer-machine launch is not clean-machine installer evidence.
- Keyboard-only operation, focus restoration and announcements, Windows screen-reader verification, 200% scaling, reduced motion and source/preview synchronization. Browser automation alone is not screen-reader evidence.

Existing role ownership stays intact:

| Role | Use of this reference |
|---|---|
| desktop-architect | Whole guide; approved architecture/bootstrap decisions and unresolved feasibility |
| api-developer | Sections 2-4 and 7; typed commands/events, authority and recovery contracts |
| security-data-safety-reviewer | Sections 2-5 and 7-8; task-scoped security/data-safety findings, no production fixes |
| pi-integration-builder | Sections 2, 5, 7-8; implement only approved Pi/process/lifecycle contracts |
| windows-release-engineer | Sections 1, 6 and 8; approved packaging/install diagnostics and real evidence |
| test-writer | Sections 2-8; pre-implementation contracts and rejection/runtime-boundary tests |

UI/editor, persistence/Git, accessibility and final-verification owners consult applicable sections without acquiring another role's files or decision authority. Architects/reviewers retain their approved thinking levels; builders remain medium. This document does not switch models or repair the pending router compatibility issues. Resource guards check key text/reference/license integrity, not full semantic correctness; normal scoped security/destroy/review gates remain mandatory.

## Source, attribution, and primary documentation

Adapted from the community [Electron Development skill](https://github.com/sickn33/agentic-awesome-skills/tree/1c7bdea7f9094080fdb6f8b9b0aefb13030a2e31/skills/electron-development), including its detailed guide. Retained themes: process separation, sandbox/preload principles, IPC lifecycle, navigation, packaging, debugging and testing. Rewritten/omitted material: arbitrary-path IPC, generic channel APIs, prefix-only containment, deprecated/blanket security recipes, alternative stack/persistence/updater defaults and unrelated platform scope. No upstream executable examples or scripts are installed.

Copyright (c) 2026 Antigravity User. The full upstream MIT notice is preserved in `.agents/skills/desktop-architect/references/LICENSE.electron-development`. Preserve that notice when redistributing copied or substantially adapted material. Community metadata such as `risk: safe` is not an audit result or permission enforcement.

Official documentation is primary for API/version facts:

- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [process model](https://www.electronjs.org/docs/latest/tutorial/process-model), [sandbox](https://www.electronjs.org/docs/latest/tutorial/sandbox), [ES modules](https://www.electronjs.org/docs/latest/tutorial/esm), [native modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules), [ASAR integrity](https://www.electronjs.org/docs/latest/tutorial/asar-integrity), and [accessibility](https://www.electronjs.org/docs/latest/tutorial/accessibility).
- Electron source fact checks used [revision 04449e9846edb0eff60cb82bd619c0559bc62ec3](https://github.com/electron/electron/tree/04449e9846edb0eff60cb82bd619c0559bc62ec3/docs). Recheck against the selected supported release; latest documentation can change.
- [Forge TypeScript/Webpack](https://www.electronforge.io/templates/typescript-+-webpack-template), [Webpack plugin](https://www.electronforge.io/config/plugins/webpack), [native unpack plugin](https://www.electronforge.io/config/plugins/auto-unpack-natives), and [Squirrel.Windows maker](https://www.electronforge.io/config/makers/squirrel.windows).
- [Playwright Electron limitations](https://playwright.dev/docs/api/class-electron). Pi integration facts come from the official documentation for the pinned SDK, audited by pi-integration-specialist—not from an Electron community guide.
