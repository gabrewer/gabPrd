# PRD Creator

Status: BOOT-001 desktop bootstrap implementation approved in issue #9. Full product contracts remain in refinement; product workflow implementation is not approved.
Created: 2026-10-09
Planning record: https://github.com/gabrewer/gabPrd/issues/8

## 1. Product Name & One-Liner

**PRD Creator** is a Windows app that helps non-coders turn an idea into a reviewed, editable product requirements document through an interactive Pi conversation, then publish it to a Git branch without using a terminal.

## 2. Problem & Audience

Writing a PRD with Pi currently requires navigating a repository, arranging a branch, starting the brainstorm workflow, locating and editing the resulting Markdown, and committing and pushing the result. These steps distract from product thinking and assume familiarity with developer tools.

The primary user is a non-coder who can describe a product idea and answer questions but should not need to understand Git commands, worktrees, or Pi's terminal interface.

An existing local clone and installed, configured **Pi, Git, and GitHub CLI (`gh`)** are prerequisites. The writer approved assuming these tools and their existing provider/remote authentication are ready before using the app, and requiring an existing `brainstorm` skill available through Pi's configured resources. Version/availability checks and safe diagnostics still apply: configuration can expire or become unavailable. The first release does not install tools, clone repositories, perform login, copy credentials, or silently change tool configuration. Product publication uses Git and still creates no pull request; assuming `gh` is available does not expand publication scope.

## 3. Goals & Success Measures

- Let a writer complete idea → interactive brainstorm → draft → review → publish without opening a terminal during a correctly configured workflow.
- Keep repository mechanics out of the writing experience.
- Preserve unfinished documents and conversations across app restarts.
- Give the writer explicit control over when a document is published.
- Protect unrelated work in the selected repository.

Success is demonstrated when a representative non-coder can complete that workflow, resume an unfinished PRD, and find the approved document on its remote branch. Numerical usability targets are not yet set.

## 4. Core User Flows & Features

### P0 — Select a workspace

1. The writer chooses an already-cloned local Git repository through a folder picker.
2. The app checks that the folder is a usable repository with the required `origin/main` base.
3. Settings remember the folder as the default for new PRDs.
4. Changing the default does not relocate existing PRDs or change their repository association.

Use plain-language validation and error messages. Do not silently choose a different repository, remote, or base branch when the expected configuration is missing.

### P0 — Start a PRD

1. The writer selects **New PRD** and enters their initial brainstorm text.
2. The app fetches `origin/main` and creates a unique branch and isolated Git worktree based on that fetched revision.
3. After validating availability of the required configured `brainstorm` skill, the app starts it in that PRD's workspace with the selected repository's instructions/context, supplying the initial text. Missing skill availability produces a clear prerequisite error, not generic-chat fallback or automatic installation.
4. The writer stays in the app; branch creation and Pi startup appear as understandable progress states.

The workspace must not change the original checkout's branch or overwrite its uncommitted work. If fetching or workspace creation fails, show the failure and a way to try again; do not silently start from an outdated base.

### P0 — Brainstorm interactively

- Show Pi's questions and responses in an in-app conversation.
- Let the writer answer follow-up questions and refine the idea over multiple turns.
- Keep the conversation active until the brainstorm workflow produces the PRD, including any confirmation it requests before drafting.
- Do not automatically answer product questions or invent the writer's approval.
- Preserve the conversation as part of the resumable PRD workspace.

### P0 — Read, edit, and review

- Display the generated PRD in a Markdown editor with a rendered preview.
- Allow direct manual editing of the Markdown file.
- Keep the conversation available for review requests and further questions.
- When the writer asks Pi to change the PRD, Pi applies the requested edits directly; there is no mandatory proposal-acceptance step for each edit.
- Refresh the displayed document after Pi changes it.
- Manual edits and Pi edits operate on the same document. Use explicit Save/Ctrl+S and a visible unsaved indicator, save manual changes before Pi revisions, and keep source editing read-only while Pi revises. Include manual undo/redo and reject stale writes without silently losing changes.
- Producing a draft does not automatically publish it.

Suggested layout: conversation on one side and document editor/preview on the other. This is a design direction, not a fixed layout requirement.

### P0 — Resume unfinished work

- Provide a **Your PRDs** list with enough information to identify and reopen a document.
- Reopening restores the document, its conversation, and its original workspace association.
- Preserve completed conversation turns and saved document content across normal app closure and restart.
- If the underlying folder or file is missing, explain the problem instead of silently replacing the PRD or starting a new conversation.
- Resuming a workspace does not imply that an interrupted Pi operation continues automatically.

### P0 — Approve and publish

1. The writer saves any manual changes, reviews that saved revision, and explicitly selects **Approve & Publish**.
2. The app validates that the saved revision still exactly matches the approved revision and commits only that PRD on its dedicated branch. Later edits invalidate approval; do not silently save and publish different content under an earlier approval.
3. The app pushes the branch to `origin` and reports success only after the push succeeds.
4. The app does not open a pull request or merge anything.

Commit only the approved PRD, not unrelated repository changes, conversation records, credentials, or local app state. If Pi modifies other files, exclude them from publication and explain that they are not part of the approved document.

If a commit succeeds but pushing fails, preserve the local result and report that it has not yet been published. Never overwrite remote history automatically to resolve a failure.

### P0 — Revise after publication

- The writer can reopen a published PRD and make further manual or Pi revisions in v1, preserving its validated repository/workspace/session association.
- A later local edit is an unpublished revision, not an automatic update of the remote document. Preserve the recorded last successful publication separately from the current draft state.
- Each later publication requires fresh explicit approval of the exact saved revision and the same scoped commit/push behavior; no automatic publication, merging, or force-push is introduced.
- Exact branch/remote reconciliation, missing-worktree recovery, and interrupted publication behavior remain contract/verification work.

## 5. Non-Goals

- Creating or cloning repositories.
- Teaching users Git or embedding a general-purpose terminal as the primary interface.
- Opening pull requests, merging branches, or implementing the PRD's proposed feature.
- Automatically deciding product questions or approving a document on the writer's behalf.
- Real-time collaboration or multi-user document editing.
- Cloud-hosted accounts, cross-device synchronization, or a hosted application backend in the initial scope.
- A general Git client or repository-wide code editor.

## 6. Accessibility Acceptance Criteria

This is a user-facing Windows workflow; accessibility is in scope.

- Setup, new PRD creation, conversation, editing, preview, resume, and publication work using only the keyboard.
- Controls have meaningful accessible names; messages identify their speaker, and inputs expose labels, help, and errors programmatically.
- Focus order is predictable and visible. Dialogs restore focus to the initiating control, and incoming Pi messages do not steal focus.
- Screen readers can navigate the conversation and Markdown preview, including headings and lists.
- Announce new questions, operation completion, and failures without reading every streamed token as a separate interruption.
- Status is conveyed with text, not color alone. No required action depends on dragging, hovering, or pointer gestures.
- The primary workflows remain usable at 200% scaling/zoom and with reduced motion enabled.

Validation plan: keyboard-only walkthroughs and Windows screen-reader testing of the complete workflow, plus automated accessibility checks supported by the chosen UI technology. These checks have not yet been run.

## 7. Contract & Data Requirements

This is a local desktop product, not a UI-only mockup. It needs real filesystem, Git, Pi-session, and settings integration. A remote application backend is not currently required.

### Required local information

- Remembered default repository directory.
- Each PRD's identity/display name, repository association, worktree location, branch name, Markdown path, and Pi conversation/session reference.
- Enough information to reopen unfinished work and accurately distinguish local work from successful publication.

The Markdown file is the document being edited and committed. Conversation storage must support resuming Pi, not merely displaying a disconnected transcript. **SQLite is selected for local app metadata**; it is an embedded library bundled with the application, not a database server or separate user installation. The `better-sqlite3` driver and local-service ownership are selected; SQLite metadata and Pi-managed resumable session JSONL live under gabPrd's per-user app-data folder, outside the repository. Exact filenames/schema/migrations and recovery contracts remain to be defined. Do not commit the database or local session state to the selected repository.

### External contracts

- **Git:** fetch `origin/main`; create a unique branch/worktree; commit the approved file; push that branch to `origin`.
- **Pi:** execute the configured brainstorm skill in the correct workspace, exchange interactive messages, locate the produced document, support document review/editing, and resume the session.
- **Repository conventions:** use the selected repository's instructions and brainstorm workflow. Follow its existing PRD/design-document location convention; when no convention exists, default to `docs/design/` inside the PRD worktree. The app must not assume every repository uses Lessi-specific paths or policies. New PRDs use `yyyy-mm-dd-[prd name].md`, with the creation date and filesystem-safe PRD name. Existing PRDs retain their filenames on revision. Ambiguous folders, name validation/collisions, and path containment require contract/UI design, not arbitrary overwriting.

### Initial Contract Impact Check

| Check | Assessment |
|---|---|
| Accessibility criteria | Yes; keyboard and Windows screen-reader validation required. |
| UI only | No; local persistence, Git, filesystem, and Pi integration required. |
| API request/response changes | Typed desktop/local-service/IPC contracts are required but do not exist yet. Pi SDK in an Electron utility process is selected; message/resource/tool contracts and packaged runtime validation remain pending. |
| Validation/auth/ownership | Validate selected repository and PRD workspace/file/session association. Pi, Git, and `gh` are assumed installed/configured; use existing authentication without managing credentials. Test unavailable, expired, and insufficient access with safe errors and no unintended mutation. |
| Existing auth or ownership boundaries | Git remote/provider access and local filesystem permissions are invoked. Test permission/auth failures and exclusion of unrelated files. |
| Cross-service command authority | Local application services enforce write-side linkage/revision validation and publication authority; renderer requests are not authority. No remote application backend or cross-product service boundary is proposed. |
| Public/durable error paths | Yes; show safe actionable messages, not raw credentials, provider payloads, or stack traces. Test exception-bearing boundaries with sentinel secrets. |
| Potentially growing reads | PRD list and conversation history can grow. Choose bounded loading during technical refinement. |
| Cross-entity linkage | PRD records link repository, worktree, branch, file, and session; validate associations before editing or publication. |
| Persistence | Yes; SQLite for settings and PRD workspace/operation/publication metadata; resumable Pi conversation storage remains distinct. The bundled `better-sqlite3` driver and per-user app-data ownership are selected; schema/migrations, linkage validation, and restart/recovery tests are required. |
| Integration tests | Yes; Git, Pi session lifecycle, document edits, restart/resume, and publication failures. |
| Runtime validation | Windows app runtime required. No Aspire dependency established. |
| Distributed workflow impact | Yes; Pi/provider operations and Git fetch/push cross process/network boundaries. |

## 8. Reliability & Recovery Requirements

- A failure must not discard the writer's existing draft or completed conversation turns.
- Distinguish waiting for an answer, Pi working, draft available, and failed operations in plain language.
- A Pi error must not be mistaken for a completed PRD.
- If startup, generation, review, or publication fails, keep the workspace available and explain which step did not complete.
- Do not report publication success based only on a successful local commit.
- When a push outcome is uncertain, verify the branch's remote state before reporting success or performing another publication attempt.
- Do not silently overwrite manual edits, delete worktrees, discard local changes, or force-push remote history.
- Do not store or display secrets in document content, ordinary error messages, or committed files.

These requirements cover observed workflow boundaries, not a prescribed recovery architecture. No background retry service, distributed transaction, or cloud synchronization system is proposed. Detailed timeout, cancellation, crash-recovery, and retry behavior must be resolved proportionally after inspecting the Pi integration.

## 9. Technical Considerations

### Approved application stack and prerequisites

The writer selected **Electron**, then approved **strict TypeScript, React, and the Pi TypeScript SDK hosted in an Electron utility process**. Pi, Git, and `gh` are assumed already installed and configured, including their existing authentication. The writer also requires an existing **`brainstorm` skill** to be available through Pi's configured resources. These architecture/prerequisite decisions do not approve implementation, runtime probes, package installation, commits, or development publication.

Electron is a fit for the product's conversation-and-document UI. Its official [process model](https://www.electronjs.org/docs/latest/tutorial/process-model) supports a web renderer and a separate Node-capable utility process. Follow the official [security guidance](https://www.electronjs.org/docs/latest/tutorial/security): sandbox the renderer, enable context isolation, disable renderer Node integration, validate IPC senders and arguments, and expose narrow application commands rather than arbitrary filesystem, shell, or credential access. A Pi subprocess or working directory is not an OS sandbox.

Process direction: React renderer → narrow validated preload/IPC bridge → local application services in the main process → Pi SDK utility process. Git/filesystem/publication authority must not be exposed as arbitrary renderer operations. Define the exact service/tool handoff and edit/publication synchronization through typed contracts before builders.

The SDK is an application dependency that must be pinned and packaged; do not resolve executable SDK code from an arbitrary global CLI installation. Reuse existing Pi configuration/authentication through the supported SDK facilities, without presenting credentials to the renderer. Prove compatibility with Electron's bundled Node runtime and real Pi configuration/session/resource loading. Availability checks are diagnostics, not an installation or login wizard.

The `brainstorm` skill is a prerequisite, not an app-bundled fallback. Validate that it is available before starting a brainstorm; if missing or unreadable, show a clear actionable message and do not silently substitute generic chat, install/copy a skill, or alter existing instructions. Preserve available user/repository skill content and ownership. Exact configured-resource discovery/precedence, skill identity/path, SDK invocation, and missing-skill rejection/no-mutation behavior still need version-aware contracts and integration evidence. This does not resolve the deferred executable-extension/tool policy.

### Approved metadata persistence

The writer chose to keep **SQLite** after comparing it with typed JSON records and clarifying deployment. SQLite is for local app metadata, including settings, PRD workspace/session associations, and operation/publication state. It does not replace the Markdown document or resumable Pi conversation. Bundle the SQLite library with the application; no separate database installer, server, or service is required for users.

The writer also approved **`better-sqlite3`** as the bundled driver, owned by local services rather than the renderer. Electron ABI rebuilding/unpacking and packaged Windows loading/restart tests are required; approval is not packaged compatibility evidence.

A SQLite transaction does not atomically cover Git, document files, and Pi sessions. Typed state, validated resource linkage, and explicit recovery/reconciliation remain necessary. The per-user app-data storage arrangement below is approved. Exact filenames/schema, migrations, recovery, and native-module packaging remain pending design or runtime verification.

### Approved build and installer tooling

The writer approved **Electron Forge + Webpack + npm**. For BOOT-001, the writer additionally approved removing Forge's Webpack integration plugin and invoking the pinned Webpack compiler directly through Forge `generateAssets` build hooks, avoiding the unpatched development-server dependency chain. No development HTTP server/HMR or new compiler packages; both modes use the fixed local scheme/CSP. All remaining direct dependency pins and packaged runtime gates stay unchanged. Use project-local pinned dependencies and a lockfile. Package the utility-process entry and Pi runtime assets explicitly; development startup is not packaged execution evidence. An approved bootstrap must establish actual build/test/package commands.

After comparing traditional MSI and modern MSIX alternatives, the writer accepted **Forge Squirrel.Windows** for the proposed per-user setup executable. Signing/trust, exact versions/configuration, and real Windows install/upgrade/uninstall behavior remain release decisions and evidence gates. Preserve documents, metadata, and completed conversations through installer operations; data-retention behavior requires an explicit contract. Installer selection does not approve an automatic updater, distribution/publishing, or implementation.

### Approved Markdown editor and preview

The writer selected **CodeMirror 6** for Markdown source editing and **`react-markdown` + `remark-gfm`** for rendered preview. Wrap them in one app-owned React document component rather than expose separate editing and preview systems to the writer. Source editing and rendered preview are two views of one document, not independently saved documents.

The preview supports GitHub-flavored Markdown, including tables, task lists, and strikethrough, without raw HTML execution. Preserve safe URL handling and review plugins/custom renderers and link/image behavior; selecting a rendering library does not settle external-resource policies.

Integration requirements: both views consume the same current text/revision; the preview is read-only and never rewrites or saves Markdown. Local services own file saving and revision validation. Pi or external updates must not replace unsaved manual content silently. Validate the selected editor Markdown configuration against the preview's supported dialect with shared fixtures for headings, lists, tables, task lists, code, links, escaping, and unsafe content. The editing/publication policy below is approved; exact lifecycle, conflict, and recovery contracts still require design and verification.

Keep Tab available for focus navigation. Keyboard/screen-reader, 200% scaling, reduced-motion, editing/undo, and source/preview synchronization evidence must be obtained in the real Windows app. Selecting CodeMirror does not waive those gates.

### Approved editing and publication policy

The writer approved:

- Explicit **Save / Ctrl+S**, with a visible unsaved-changes indicator.
- Save manual changes before starting a Pi revision; do not discard unsaved work to start it.
- Temporarily keep source editing read-only while Pi revises the document.
- Include undo/redo for manual editing in v1.
- Publish only the exact saved revision explicitly approved by the writer. Later manual, Pi, or external edits invalidate approval and require fresh approval before publication.

Local services must enforce revision checks and serialized mutations, reject stale writes without overwriting current content, and prevent publication while edits can still occur. A UI read-only state is not sufficient authority. Cancellation/completion must reconcile document state and confirm no remaining mutation before editing resumes. Exact operation/approval tokens, undo-history handling across Pi replacements, external-edit conflict behavior, crash recovery, and error contracts still require domain/contract design and automated integration evidence.

### Approved document and session storage

The writer approved this separation:

- **SQLite metadata:** local-service-owned database in gabPrd's per-user app-data directory, using Electron's user-data location, outside the selected repository.
- **Resumable Pi sessions:** Pi-managed persistent session JSONL in the same app-owned per-user data area, outside the repository. Use supported SDK session persistence rather than a replacement display-only transcript, so reopening restores actual conversation context.
- **Markdown PRD:** document content remains in its isolated Git worktree.
- **Publication:** includes only the exact approved PRD; conversations and application metadata are never included in the product publication.

Record the exact session identity/path and repository/worktree/branch/document association, validating linkage before saving, prompting, resuming, or publishing. Preserve existing external Pi configuration/authentication and sessions; this approval does not authorize relocating them or copying credentials. Exact app-data filenames/subdirectories, schema/migrations, crash reconciliation, backup/retention behavior, and installer interaction remain contract/verification work. Restart/resume, corruption/no-silent-reset, concurrent edits, no-mutation rejection, and scoped Git publication need automated integration evidence.

Installer packaging, exact SQLite/session storage/schema/recovery contracts, editor/preview configuration and external-resource policies, dependency versions, detailed edit/conflict/recovery contracts, and build/test commands remain pending design, approval where consequential, or runtime verification. Selected stack/tooling, storage arrangement, and editing/publication policy do not authorize implementation.

### Approved PRD location and later revisions

The writer approved following the selected repository's existing PRD/design-document convention, with **`docs/design/`** as the fallback when none exists. The Markdown stays inside its isolated worktree. This is the application's generated-PRD default, not a relocation of this existing product contract or other files. Both **brainstorm** and **product-designer** must use **`yyyy-mm-dd-[prd name].md`** when creating a new PRD. Use the PRD's creation date and a filesystem-safe PRD name, for example `2026-10-09-prd-creator.md`; brackets denote a placeholder, not literal characters or a directory path. Revisions keep the existing filename/date, including this product contract's current path. Do not rename existing documents automatically or overwrite a different PRD on collision. Resolve ambiguous folders explicitly and validate path containment; name normalization, date-source validation, and collision handling remain contract work.

Published PRDs remain revisable in v1. Record the last verified remote publication separately from the current local draft; any new edit invalidates current publication approval but does not erase past publication history. Each later publication requires fresh explicit approval of the exact saved revision. Detailed state/remote-conflict/recovery contracts remain unimplemented and unverified.

### Approved first bootstrap scope

[BOOT-001 / issue #9](https://github.com/gabrewer/gabPrd/issues/9), linked beneath the existing planning epic, specifies the first real application/build/test surface. The writer approved its bounded implementation, exact dependency installation/native rebuilding, fixture-only probes, local packaging and Windows verification. Its body/comments own technical scope, contracts, files, acceptance B1–B8 and verification; this section records the approved design, not a local execution-status mirror or second product PRD. Approval does not waive evidence or authorize broader product workflows, pushes or PR creation.

Approved first milestone:

- One accessible Electron/React bootstrap window with actual starting/ready/failed runtime diagnostics and a read-only Refresh status action. No fake conversation, document or publication workflow, and no claim that SDK import proves configured brainstorming is ready.
- Strict TypeScript, sandboxed/context-isolated renderer and bundled CommonJS preload; one validated status IPC operation with trusted current main-frame identity, exact versioned payload/result unions and fixed safe errors. Local services—not renderer paths or UI locks—own all mutations.
- A once-only, correlated SDK import/asset check in an Electron utility process, plus real native SQLite creation/close/reopen and executable restart against a marked, isolated temporary fixture. Preserve corrupt/missing/foreign data rather than silently reseeding. No writes to existing app/Pi data; test roots and child paths require containment/link validation, and concurrent same-fixture launches cannot duplicate probes.
- Production shell assets served through a fixed three-asset `gabprd://app` map with restrictive CSP, no arbitrary URL-to-filesystem translation, navigation/popups/permissions denied. This is a proposed app-local scheme, not Windows protocol-handler registration or a settled future Markdown/external-resource policy.
- Forge 8 explicit `.webpack/main/index.cjs` and sibling utility entry; keep the Pi ESM package/production dependency tree and runtime assets rather than compiling executable SDK code from a global CLI. Native SQLite rebuilding, ASAR/native/WASM handling, package allowlist/pruning and source-map exclusion require packaged evidence.

Approved primary pins are **Electron 44.7.0**, **Forge 8.0.1**, **React/React DOM 19.3.0**, **TypeScript 6.0.3**, **Pi SDK 1.1.0**, and **better-sqlite3 13.0.3**; issue #9 lists every development/test pin. Registry/official-source screening checked engine/peer declarations, JavaScript compiler API assumptions and Electron's bundled **Node 24.21.0 / ABI 149**, distinct from observed host Node 24.13.0/npm 11.6.2. Static screening is not security or runtime compatibility evidence. Install through npm CLI; lockfile, fresh npm-ci verification and relevant dependency findings belong to execution. Dependency substitutions, overrides or security-risk exceptions require explicit human disposition, not silent remediation.

The task establishes—not assumes—real `typecheck`, Node/tsx unit, Forge production build/package, package inspection and Playwright packaged-Electron verification commands. Automated runtime tests cover IPC rejection/no-mutation, SDK/native assets, SQLite reopen/restart/corruption, concurrent launches, utility timeout/exit/close/late messages and sentinel-safe errors. Playwright Electron support is experimental; do not disable sandbox/CSP or silently skip required evidence. Required initial Windows keyboard/Narrator, **200% OS scaling plus app zoom**, and reduced-motion walkthroughs supplement automation. Unavailable checks remain **NOT CHECKED and blocking** unless explicitly accepted by the human.

Execution is sequential with exact specialist file ownership: release/toolchain lead, domain/API contracts, test-writer-owned tests, local-service composition, persistence, Pi adapter and accessible shell builders. Explicit role routing is required; the supplied automatic router's known defects are not a bootstrap dependency. Tests precede behavior implementation, with an explicit toolchain-only greenfield enabler to make RED commands runnable. Preserve canonical destroy/review/SHIP IT/commit/final-test/PM/human-acceptance gates; push/PR creation remains separately authorized. The proposed 39-path bootstrap is its own review slice, expected to trigger ADVISORY against main; do not add product workflow scope before review, and pause at canonical STRONG thresholds.

Exclude product model/provider requests, skill/extension/MCP/resource execution, real conversation sessions/authentication/configuration access, selected-repository/worktree mutations, PRD editing/publication, existing data migration, Squirrel installer construction/installation, signing/updater and release distribution. Exclusions do not select the deferred product Pi tool/extension policy. Squirrel installer and full runtime/session/edit/publication verification remain required later. **The bootstrap must establish and verify the real application/build/test/package surface; manifests or authored tests alone do not establish working behavior. No package installation or application runtime probe occurred during preparation. Bounded task execution is now expressly approved, not inferred from stack/team/planning approval; required review/runtime/human-acceptance gates remain.**

### Deferred Pi tool and extension policy

The writer asked to skip the discussion of additional Pi restrictions for now, citing Git for source management. The proposed draft-only write tools, prohibition on arbitrary shell/Git tools, and prohibition on automatic third-party executable-extension loading are **not approved** and must not be presented as selected defaults. This is a deferred decision, not an approved unrestricted tool configuration.

Continue other planning without reopening this discussion now. The approved save/manual-edit protections, exact-revision publication approval, preservation of unrelated files/conversations, credential safety, and narrow renderer IPC remain unchanged. Git can recover committed tracked content but does not protect untracked files, external paths, credentials, or remote mutations; no OS-sandbox guarantee is inferred. Exact Pi capability/configuration compatibility must be made explicit before affected mutating integration work is declared implementation-ready.

### Open implementation choices

- Refine exact SQLite/session filenames, schema/migrations, recovery, and installer data-retention behavior within the approved app-data storage arrangement; Windows support/signing and installer configuration/validation remain outstanding.
- Pi tool/extension scope is deferred by the writer. Resource/configuration compatibility and packaged utility-process lifecycle contracts remain unresolved.
- Exact discovery/precedence and invocation of the required existing `brainstorm` skill through Pi's configured resources for the selected repository; clear missing-skill diagnostics are approved, but SDK compatibility remains unverified.
- How the app identifies the generated PRD and knows when it is ready to display without depending on fragile wording in chat responses.
- Branch/worktree naming and storage location.
- Exact editing/undo/conflict/recovery contracts implementing the approved Save/Ctrl+S, save-before-Pi, read-only-during-Pi, and revision-bound approval policy.
- Exact restart/interruption/corruption recovery contracts for the approved Pi-managed session persistence.

### Planning evidence and remaining audits

- Product evidence: this brainstorm established the audience and the workflow decisions listed below.
- Destination inspected: `projects/prd-creator/` was empty before this document was created; no existing PRD for this project was found there.
- Pre-bootstrap gabPrd planning inventory: documentation, Pi orchestration assets, and orchestration/resource tests existed; no application manifest, source scaffold, or product build/test/package surface existed. BOOT-001 must establish and verify real paths and commands before downstream implementation-ready tasks.
- gabCode was inspected read-only at commit `855acf296072e476a07972fc3ecbd0c304aaa4eb`. Its Windows client is C#/.NET 10/WPF (`src/GabCode.Windows/GabCode.Windows.csproj`). Git/process/worktree implementations and tests exist, but the Markdown editor remains a design (`Documentation/design/2026-09-20-markdown-review-editing-prd.md`), Markdown currently opens externally, and Pi is terminal-hosted rather than managed by a structured session adapter. Unrelated release edits were preserved.
- With Electron, gabCode's C# runtime code and WPF UI are not directly reusable. Requirements, language-neutral fixtures, and behavioral contracts are reuse candidates. Sharing a web editor would require a separate approved change to gabCode; no shared package/repository, sibling-checkout dependency, or cross-repository modification is authorized.
- Official SDK, RPC, session-format/lifecycle, skill, and security documentation in the installed Pi 1.1.0 distribution was inspected. SDK sessions support an explicit workspace, persistent session managers, streamed/finalized messages, cancellation, and custom tool/resource configuration. RPC is a viable alternative. `message_end` carries a finalized message; `agent_settled` marks the end of automatic run activity. Neither proves draft readiness, writer approval, or publication. Startup, restart, controlled mutations, and failure paths still require automated integration evidence.
- Official [Electron accessibility guidance](https://www.electronjs.org/docs/latest/tutorial/accessibility), [Forge TypeScript/Webpack](https://www.electronforge.io/templates/typescript-+-webpack-template), [Forge TypeScript/Vite](https://www.electronforge.io/templates/vite-+-typescript), and [Playwright Electron automation](https://playwright.dev/docs/api/class-electron) were inspected. Forge's Vite integration and Playwright's Electron automation are documented as experimental. Forge/Webpack/npm and Squirrel.Windows are selected; installer and test-tool configuration remain pending.
- Remaining-stack recommendations were checked against the [CodeMirror guide](https://codemirror.net/docs/guide/) and [Tab/no-keyboard-trap policy](https://codemirror.net/examples/tab/), [`react-markdown` security guidance](https://github.com/remarkjs/react-markdown#security), [SQLite atomic-commit explanation](https://sqlite.org/atomiccommit.html), [`better-sqlite3` Electron rebuilding/unpacking guidance](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/troubleshooting.md), [Forge Webpack](https://www.electronforge.io/config/plugins/webpack), [native-module unpacking](https://www.electronforge.io/config/plugins/auto-unpack-natives), and [Squirrel.Windows](https://www.electronforge.io/config/makers/squirrel.windows). These are documentation evidence, not packaged compatibility or accessibility results.
- Native-installer research checked [Forge WiX MSI](https://www.electronforge.io/config/makers/wix-msi), [Microsoft Windows Installer](https://learn.microsoft.com/en-us/windows/win32/msi/windows-installer-portal), [Forge MSIX](https://www.electronforge.io/config/makers/msix), and [Microsoft MSIX overview](https://learn.microsoft.com/en-us/windows/msix/overview). MSI uses the built-in Windows Installer service; Forge's documented maker requires WiX Toolset v3 on the build machine, not users' machines. Forge MSIX support is currently experimental and requires Windows SDK build tools; MSIX installation requires a signed package with trusted publisher identity. Neither MSI nor MSIX is selected; the writer subsequently accepted Squirrel.Windows. MSI install context and MSIX filesystem/process/Pi/Git/configuration behavior would need explicit assessment if reconsidered, not assumed compatibility.
- Team-resource integrity check `node verify/team-setup/check-resources.mjs` passed during planning; this is not application verification. Product runtime, packaging, Pi integration/restart, edit-conflict, publication, keyboard/screen-reader, 200% scaling, and reduced-motion evidence are **NOT CHECKED**, blocking unless explicitly accepted by the human.
- This is not a parity or migration project, so a source-delta audit is not currently applicable.
- Before implementation planning, refine this same document with the code/test inventory, official Pi integration evidence, completed Contract Impact Check, and proportional distributed-workflow assessment. Do not convert these unanswered design choices into implementation discovery tasks or claim them resolved.

## 10. Milestones

1. **Workspace and conversation:** remembered repository selection, isolated PRD branch/worktree creation, and interactive Pi brainstorming.
2. **Draft and resume:** Markdown editing/preview, direct Pi revisions, and reopening unfinished PRDs with their conversations.
3. **Publication and validation:** explicit approval, scoped commit/push, failure handling, and end-to-end accessibility and non-coder usability validation.

Milestones describe delivery slices, not an authorized sprint or an implementation task board.

## 11. Open Questions & Decisions

### Confirmed decisions

- Windows application for non-coders.
- Electron desktop framework with strict TypeScript, React, and the Pi SDK in an Electron utility process.
- Pi, Git, and `gh` are already installed and configured; v1 uses existing authentication, with safe diagnostics rather than tool installation or credential management.
- An existing `brainstorm` skill must be available through Pi's configured resources. Missing availability produces a clear prerequisite message rather than bundled/copied skills or silent generic-chat fallback.
- Brainstorm and product-designer create new PRDs using `yyyy-mm-dd-[prd name].md`; existing PRD revisions retain their filenames and creation dates, without automatic renames or collision overwrites.
- Embedded SQLite with `better-sqlite3` for local app metadata, bundled with the application; no database server or separate user installation.
- Electron Forge + Webpack + npm for build tooling, with Squirrel.Windows for a per-user setup executable; signing/trust and installer runtime evidence remain outstanding.
- CodeMirror 6 for Markdown source editing and `react-markdown` + `remark-gfm` for read-only preview; source and preview are two views of one document rather than independently saved documents, with no raw HTML execution.
- SQLite metadata and Pi-managed resumable session JSONL in gabPrd's per-user app-data folder, outside the repository; Markdown remains in its isolated worktree, and publication excludes conversations/app metadata.
- Remaining detailed storage/recovery/installer-configuration/product choices and execution approval are separate decisions.
- Choose an existing local repository folder and remember it as the default.
- Create each PRD on its own branch/worktree from fetched `origin/main`; follow the repository's document convention, falling back to `docs/design/` when none exists.
- Run an interactive Pi brainstorm with answers entered inside the app.
- Show and allow editing of the generated Markdown PRD, with explicit Save/Ctrl+S, visible unsaved changes, and manual undo/redo.
- Save manual changes before Pi revisions; keep source editing read-only while Pi revises. Pi applies requested revisions directly to the draft without silently discarding manual work.
- Preserve unfinished PRDs and conversations so writers can resume them.
- Publish only the exact saved revision after explicit approval; later edits invalidate approval. Commit and push, with no pull request.
- Allow revisions after publication in v1; each later publication requires fresh approval, while past successful publication remains recorded.
- Save this product contract under `projects/prd-creator/` in the requested repository.

### Questions to resolve during refinement

- Define exact filenames/schema/migrations/recovery for the approved per-user app-data SQLite/Pi-session storage, plus Windows support/signing and installer data-retention/configuration policies. SQLite/`better-sqlite3`, CodeMirror 6, `react-markdown`/GFM, Forge/Webpack/npm, and per-user Squirrel.Windows are selected; required runtime/accessibility evidence is still outstanding.
- Which versions, resource/configuration policies, and diagnostics keep the bundled Pi SDK compatible with the writer's existing configured environment? Additional tool/extension restriction discussion is deferred, not an approved scoped or unrestricted configuration.
- Exact discovery/precedence, identity/path validation, and invocation contracts for the required configured `brainstorm` skill, including missing/unreadable-skill diagnostics and no-mutation tests.
- Exact convention discovery/ambiguity handling, filesystem-safe name/date validation, and collision behavior for the approved repository-convention/`docs/design/` location and `yyyy-mm-dd-[prd name].md` naming policies.
- Exact undo-history, external-edit conflict, cancellation, and recovery behavior around Pi revisions, enforcing the approved editing policy.
- Exact draft/last-publication state, branch/remote-conflict reconciliation, and recovery contracts for approved post-publication revisions.
- What worktree retention/deletion controls, if any, should the first release expose? No automatic destructive cleanup is approved.

## 12. User-Visible Acceptance Criteria

- [ ] I can select an existing local repository and the app remembers it after restart.
- [ ] If the required `brainstorm` skill is unavailable, I receive a clear prerequisite message instead of silent generic-chat fallback or automatic skill installation.
- [ ] I can start a new PRD without issuing Git commands; it is isolated from existing work and based on freshly fetched `origin/main`.
- [ ] I can enter an idea, read Pi's follow-up questions, and answer them inside the app until a PRD is created.
- [ ] New PRDs follow the repository's folder convention, or use `docs/design/` when none exists, and use `yyyy-mm-dd-[prd name].md`; revisions retain existing filenames and do not move or overwrite other documents.
- [ ] I can read the PRD as rendered Markdown and edit its Markdown source.
- [ ] I can ask Pi to review or revise the document and see requested edits applied directly without losing my manual edits.
- [ ] I can close the app and reopen an unfinished PRD with its saved draft and conversation intact.
- [ ] I can save explicitly with Save/Ctrl+S, see unsaved changes, and undo/redo manual edits; my changes are saved before Pi revises and the source editor is read-only during that revision.
- [ ] Nothing is published until I explicitly approve the exact saved revision; later edits require fresh approval.
- [ ] Publishing commits my approved PRD and pushes its dedicated branch, without including conversations, app metadata, or unrelated files, opening a pull request, or merging.
- [ ] I can revise a published PRD; later edits are not published automatically, and each later publication requires fresh approval while previous successful publication remains recorded.
- [ ] If something fails, I receive an understandable explanation, keep my existing work, and am not falsely told publication succeeded.
- [ ] I can complete the primary workflow with a keyboard and screen reader and at 200% scaling/zoom.
