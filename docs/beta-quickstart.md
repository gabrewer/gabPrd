# PRD Creator core beta

This beta covers **idea → configured brainstorm → generated PRD → conversation-led revisions → reopen**. It is a subset of the full product: the document view is read-only. Manual source editing, Ctrl+S, editor undo/recovery UI, publication and further visual polish are not included. A build or scripted test result is not release acceptance; issue [#13](https://github.com/gabrewer/gabPrd/issues/13) records the applicable evidence and disposition.

## Before starting

- Use Windows x64 and a local Git checkout with a usable `origin/main`. Git must be installed and available to the application. Network/authentication must work if that remote requires them.
- Normal Pi configuration must already provide a working provider/model and a trusted skill named `brainstorm`. The application bundles Pi SDK **1.1.0**, but does not provision credentials or install skills for you.
- The skill must be discoverable through normal user/package configuration or resources actually present in the new worktree. Uncommitted instructions/settings in your original checkout are deliberately **not** overlaid onto it. The app repository's development skills are not bundled into your project.
- Normal configured Pi tools, extensions and MCP integrations run with your user permissions. This is **not an OS sandbox**. Only use repositories, instructions and integrations you trust. Terminal-only extensions may produce an explicit compatibility error rather than being silently disabled.

## Run a provided build

1. Extract the **entire** portable build to a folder. Keep its resources and DLLs together; copying only `gabPrd.exe` will not work.
2. Run `gabPrd.exe`. A portable build is not an installer or auto-updater. Only run a build from a trusted sender; signing/clean-machine validation must not be assumed.
3. Choose your existing repository, type your idea, and continue. No working title is required.
4. Confirm the displayed document location. Pi starts in a separate, app-owned Git worktree based on freshly fetched `origin/main`; the app does not switch, stage or reset your original checkout.
5. Answer the brainstorm's questions yourself. If a configured extension presents a question dialog, answer or cancel it explicitly. No answers or approvals are supplied for you.
6. When a real Markdown file is found and verified, its rendered document becomes primary. Use the conversation to request changes. Generated/revised files and completed conversation turns persist; saving a draft does **not** publish it.
7. Open **Your PRDs** to return to the saved document and its recorded conversation. Reopening does not replay an interrupted request or select a newer unrelated session.

Text you have not submitted must be submitted or cleared before navigating away or closing normally. Resolve/cancel an open question first. Unsubmitted form/composer text is not promised to survive a forced process termination or OS restart; submit it before shutting down Windows.

## If something fails

- Read the app's fixed error message. Missing/unreadable `brainstorm` resources must be fixed in normal Pi configuration, not replaced by a generic chat prompt.
- A safely allocated session that failed before any prompt can offer **Retry workspace setup** after configuration is corrected. This is an explicit retry, not permission to replay a materialized or uncertain prompt. If retry is unavailable, preserve the profile and ask for help rather than deleting session/worktree files.
- A missing, changed or invalid saved document retains its association. Do not delete private metadata or create an empty replacement to bypass the error.
- If ordinary close is blocked, keep the window open, resolve the indicated input/action, and try again. Do not use blanket process kills or worktree cleanup as routine recovery.
- Share the fixed error code and build identity with the maintainer. Do not post credentials, raw provider errors, session logs or private repository content.

## Files and privacy

Application records and retained worktrees are under the application's Windows user-data directory, separate from the portable executable. Inside it, `product-v1/workspaces` contains the workspaces and `product-v1/sessions` contains conversation files. The document's relative filename is shown under **Document location**.

To share a PRD manually, copy its verified Markdown file; do not move it out of its retained workspace or remove the worktree. Keep private profile/session/recovery files out of source control and bug-report attachments. This beta has no app Publish/PR/merge workflow. Normal Pi tools are not globally restricted from Git commands, so do not ask them to publish unless you intend that external tool action.

## Release-validation walkthrough

Use a disposable repository you own and normal trusted Pi configuration. Record actual results on issue #13 without private conversation content. This checklist is an expected-results protocol, not a claim that the checks have passed.

1. Complete one **real-provider** brainstorm with the writer's own answers, generate a real PRD, request a concrete revision, close cleanly and reopen. Expect the revised file and completed conversation, the same session, and no replay of the last request. Scripted responses do not satisfy this step.
2. Check the original checkout, branch/index and a known unrelated draft before/after. Expect no app staging, reset, publication, deletion or edits to them.
3. Type an idea or unsent follow-up and attempt navigation/close. Expect the text and window to remain until submission or explicit clearing; then a clean close must work. Resolve/cancel a question explicitly, never by an automatic answer.
4. Use only the keyboard through repository selection, idea entry, location confirmation, replies, review and reopening. Expect visible focus, reachable controls and no focus theft when messages/drafts arrive. Use Focus conversation/Focus PRD when the viewport is narrow.
5. With Windows Narrator, check control names, errors, saved conversation and document navigation. Expect meaningful announcements without every streamed token being read; dialog focus must return to the conversation.
6. Set actual Windows display scaling to 200%, also check app zoom, and enable Windows reduced motion. Expect operable controls, readable/reachable content and no essential motion. Browser emulation is only supplemental evidence.
7. Verify the complete portable folder on another supported Windows user/machine, including missing-prerequisite errors and normal install-folder permissions. Do not assume signing, installation or clean-machine readiness from a developer-machine run.

Missing real-provider/Windows/accessibility/prerequisite evidence remains NOT CHECKED and blocks release unless the human explicitly accepts the particular gap. A code-review verdict or commit is not that acceptance.

## Building from source

Use the repository's pinned Windows/Node/npm toolchain, then:

```text
npm ci
npm run typecheck
npm run package
npm run inspect:package
```

The application is `out/gabPrd-win32-x64/gabPrd.exe`. Build/inspection alone does not establish real-provider, accessibility or clean-machine readiness. Focused product integration commands and complete-sprint verification are documented in the main README; `verify:prd` still represents the full milestone, including deferred editor work, and must not be advertised as a passing beta-only gate.
