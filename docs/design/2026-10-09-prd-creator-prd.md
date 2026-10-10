# PRD Creator

Status: Initial product contract; implementation choices remain open.
Created: 2026-10-09

## 1. Product Name & One-Liner

**PRD Creator** is a Windows app that helps non-coders turn an idea into a reviewed, editable product requirements document through an interactive Pi conversation, then publish it to a Git branch without using a terminal.

## 2. Problem & Audience

Writing a PRD with Pi currently requires navigating a repository, arranging a branch, starting the brainstorm workflow, locating and editing the resulting Markdown, and committing and pushing the result. These steps distract from product thinking and assume familiarity with developer tools.

The primary user is a non-coder who can describe a product idea and answer questions but should not need to understand Git commands, worktrees, or Pi's terminal interface.

An existing local clone is a prerequisite. Repository cloning, Git credentials, and initial Pi/provider setup are not yet defined as app-managed capabilities. The app must explain missing prerequisites without claiming setup succeeded.

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
3. The app starts the selected repository's Pi brainstorm skill in that PRD's workspace, supplying the initial text.
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
- Manual edits and Pi edits must operate on the same document without silently losing unsaved writer changes. The exact interaction while Pi is editing remains a design decision.
- Producing a draft does not automatically publish it.

Suggested layout: conversation on one side and document editor/preview on the other. This is a design direction, not a fixed layout requirement.

### P0 — Resume unfinished work

- Provide a **Your PRDs** list with enough information to identify and reopen a document.
- Reopening restores the document, its conversation, and its original workspace association.
- Preserve completed conversation turns and saved document content across normal app closure and restart.
- If the underlying folder or file is missing, explain the problem instead of silently replacing the PRD or starting a new conversation.
- Resuming a workspace does not imply that an interrupted Pi operation continues automatically.

### P0 — Approve and publish

1. The writer reviews the current draft and explicitly selects **Approve & Publish**.
2. The app saves the current document and commits that PRD on its dedicated branch.
3. The app pushes the branch to `origin` and reports success only after the push succeeds.
4. The app does not open a pull request or merge anything.

Commit only the approved PRD, not unrelated repository changes, conversation records, credentials, or local app state. If Pi modifies other files, exclude them from publication and explain that they are not part of the approved document.

If a commit succeeds but pushing fails, preserve the local result and report that it has not yet been published. Never overwrite remote history automatically to resolve a failure.

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

The Markdown file is the document being edited and committed. Conversation storage must support resuming Pi, not merely displaying a disconnected transcript. Persistence format and storage ownership are open technical decisions; do not commit local session state to the selected repository.

### External contracts

- **Git:** fetch `origin/main`; create a unique branch/worktree; commit the approved file; push that branch to `origin`.
- **Pi:** execute the configured brainstorm skill in the correct workspace, exchange interactive messages, locate the produced document, support document review/editing, and resume the session.
- **Repository conventions:** use the selected repository's instructions and brainstorm workflow. The app must not assume every repository uses Lessi-specific paths or policies.

### Initial Contract Impact Check

| Check | Assessment |
|---|---|
| Accessibility criteria | Yes; keyboard and Windows screen-reader validation required. |
| UI only | No; local persistence, Git, filesystem, and Pi integration required. |
| API request/response changes | No product API specified; Pi integration contract still to be selected and inspected. |
| Validation/auth/ownership | Validate selected repository and PRD workspace/file association. Git and Pi/provider credentials use existing configured access; credential setup is unresolved. |
| Existing auth or ownership boundaries | Git remote/provider access and local filesystem permissions are invoked. Test permission/auth failures and exclusion of unrelated files. |
| Cross-service command authority | No separate service-authoritative product boundary proposed. |
| Public/durable error paths | Yes; show safe actionable messages, not raw credentials, provider payloads, or stack traces. Test exception-bearing boundaries with sentinel secrets. |
| Potentially growing reads | PRD list and conversation history can grow. Choose bounded loading during technical refinement. |
| Cross-entity linkage | PRD records link repository, worktree, branch, file, and session; validate associations before editing or publication. |
| Persistence | Yes; settings, resumable PRD workspace associations, and conversations. |
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

### Open implementation choices

- Windows UI framework and application packaging.
- Hosting Pi through its SDK versus communicating with Pi through RPC. The user permits either; neither has been selected or validated.
- Pi/provider installation and authentication prerequisites, including how a non-coder gets help if setup is missing.
- How the app discovers and invokes the brainstorm skill in the selected repository.
- How the app identifies the generated PRD and knows when it is ready to display without depending on fragile wording in chat responses.
- Branch/worktree naming and storage location.
- Document save behavior, protection of manual edits during Pi edits, and whether Undo is included.
- Session persistence and exact behavior after interruption.

### Planning evidence and remaining audits

- Product evidence: this brainstorm established the audience and the workflow decisions listed below.
- Destination inspected: `projects/prd-creator/` was empty before this document was created; no existing PRD for this project was found there.
- No implementation code, Pi SDK/RPC documentation, or runtime integration has been inspected for this product. No tests have been run.
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
- Choose an existing local repository folder and remember it as the default.
- Create each PRD on its own branch/worktree from fetched `origin/main`.
- Run an interactive Pi brainstorm with answers entered inside the app.
- Show and allow editing of the generated Markdown PRD.
- Pi applies requested revisions directly to the draft.
- Preserve unfinished PRDs and conversations so writers can resume them.
- Publish only after explicit approval; commit and push, with no pull request.
- Save this product contract under `projects/prd-creator/` in the requested repository.

### Questions to resolve during refinement

- Which Pi integration and Windows UI stack best support an accessible embedded conversation and resumable sessions?
- Who installs/configures Pi, providers, and Git credentials before a writer starts?
- What should happen if the selected repository has no brainstorm skill?
- Where should generated PRDs live when a repository has no established document convention?
- How should manual editing behave while Pi is revising the same draft, and should Undo be part of the first release?
- Does the first release allow further revisions after a PRD has already been published?
- What worktree retention/deletion controls, if any, should the first release expose? No automatic destructive cleanup is approved.

## 12. User-Visible Acceptance Criteria

- [ ] I can select an existing local repository and the app remembers it after restart.
- [ ] I can start a new PRD without issuing Git commands; it is isolated from existing work and based on freshly fetched `origin/main`.
- [ ] I can enter an idea, read Pi's follow-up questions, and answer them inside the app until a PRD is created.
- [ ] I can read the PRD as rendered Markdown and edit its Markdown source.
- [ ] I can ask Pi to review or revise the document and see requested edits applied directly without losing my manual edits.
- [ ] I can close the app and reopen an unfinished PRD with its saved draft and conversation intact.
- [ ] Nothing is published until I explicitly approve it.
- [ ] Publishing commits my approved PRD and pushes its dedicated branch, without including unrelated files, opening a pull request, or merging.
- [ ] If something fails, I receive an understandable explanation, keep my existing work, and am not falsely told publication succeeded.
- [ ] I can complete the primary workflow with a keyboard and screen reader and at 200% scaling/zoom.
