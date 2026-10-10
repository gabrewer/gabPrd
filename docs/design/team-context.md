# gabPrd Team Setup Context

## Sources and current inventory

- Product contract: `docs/design/2026-10-09-prd-creator-prd.md` (initial, not an implementation-approved plan).
- Workflow authority: `instructions/TEAM-ORCHESTRATION.md` and `instructions/TOOL-PI.md`.
- Repository: https://github.com/gabrewer/gabPrd; companion: https://github.com/gabrewer/gabCode.
- Current repository contains documentation and existing `.agents/skills/brainstorm/SKILL.md` and `.agents/skills/inspire/SKILL.md`. Preserve these skills and supplied instruction files.
- No application, package manifest, build surface, test framework, CI, or repository-level AGENTS.md was found during setup inspection. Build/test/run commands are not yet established.
- Initial documentation is on `feature/initial-product-contract`, with PR #1 open. Agent installation is a separate concern; do not silently commit pre-existing untracked instructions or skills.

## Product-specific specialization

This is a local Windows desktop application for non-coders: repository selection → isolated PRD worktree → interactive Pi brainstorm → Markdown editing/review → resume → explicit approval and branch publication.

- `backend-builder` owns local application command/service composition—not an assumed cloud server. Git, Pi session adapters, and persistence are owned by their specialist builders; tasks define interface and file handoffs.
- `api-developer` owns typed UI/local-service and Pi integration contracts—not assumed HTTP endpoints.
- `domain-modeler` models repository/workspace/document/session/branch associations and publication state. Do not impose Marten, event sourcing, a database, or tenancy.
- `frontend-builder` owns the accessible desktop shell, navigation, repository setup, PRD list, and settings. Conversation/editor implementations belong to their specialist builders. Do not prescribe React, Vitest, Playwright, Bun, or web-specific paths before selecting and validating the UI stack.
- `test-writer` covers real temporary Git repositories/remotes, persistence/restart, file/linkage validation, manual/Pi edit conflicts, failure recovery, and scoped publication. Tests must exercise boundary behavior, not only mocked UI behavior.
- `destroyer` targets data loss, credential disclosure, unintended staging/publication, stale base handling, uncertain push outcomes, session recovery, and accessibility regressions in task-owned changes.
- `review-agent` judges evidence against original requirements, not merely the implementation. Human acceptance remains separate.

## Product constraints for every role

Protect the original checkout and unrelated changes. Fetch `origin/main` before creating a PRD workspace; never silently substitute another base. Preserve manual edits and completed conversation turns. Validate repository/worktree/branch/file/session associations before mutation. Publish only the approved document after explicit approval; exclude credentials, sessions, and unrelated files. Do not auto-approve brainstorm questions, force-push product branches, delete worktrees, open product-generated PRs, or merge them.

Development PRs for gabPrd itself are distinct from the application's publication flow. Develop on feature branches, synchronize by rebase with preserved uncommitted work, and use force-with-lease only for explicitly authorized rebased development-branch updates. Never perform blanket cleanup of a dirty checkout: the generic failed-task cleanup example must not discard user work.

## Decisions needed before implementation planning

Select and validate the Windows UI/packaging stack, Pi SDK versus RPC, installation/authentication prerequisites, brainstorm skill discovery, structured draft discovery, worktree storage/naming, save/conflict behavior, and session persistence/interruption semantics. Refine the existing PRD with official integration evidence before implementation-ready sprint planning. Establish the first real build/test surface in an explicit bootstrap task; downstream tasks must reference real commands and paths.

Neither gabPrd nor gabCode has a Markdown editor today. A component shared by both is a future possibility, not an existing dependency or approved separate package/repository. Inspect gabCode and resolve compatibility before committing to extraction or sharing.

Accessibility requires keyboard-only workflows, Windows screen-reader validation, focus/announcement behavior, 200% scaling, and reduced motion. Unavailable runtime evidence is `NOT CHECKED`, not PASS.

## Approved Pi topology

- `/pm-agent`: product-designer and pm; consult domain-modeler/api-developer for contract readiness. Existing brainstorm/inspire skills remain product-thinking helpers, not competing sprint coordinators.
- `/team-lead`: domain-modeler → api-developer → test-writer → assigned specialist builder → build gate → destroyer → review-agent → git-committer → tester/smoke → pm summary and human acceptance preparation. The approved expanded team has 23 workers: product-designer, pm, desktop-architect, pi-integration-specialist, domain-modeler, api-developer, accessibility-specialist, shared-component-architect, frontend-builder (desktop shell), backend-builder (local command orchestration), conversation-builder, pi-integration-builder, git-workspace-builder, persistence-recovery-builder, markdown-editor-builder, windows-release-engineer, test-writer, security-data-safety-reviewer, destroyer, review-agent, tester, git-committer, and acceptance-coordinator. Ownership and handoffs are documented in `docs/team/README.md`.
- `/pr-checkpoint`: a read-only branch-size/review-boundary utility, not another planning/execution owner.
- Add a `tester` skill for repeatable final verification and evidence reporting.
- Use `.agents/skills/` for workers and `.pi/prompts/` for front doors. Conservative sequential role adoption in the active Pi session; no claim of isolated native subagents or independently enforced skill tool permissions.
- Approved provider/model for every new prompt/worker: `openai-codex/gpt-6.1-sol`, verified by `pi --list-models`. Planning/architecture/quality roles and prompts use high thinking; bounded builders and git-committer use medium. `.pi/skill-models.json` is manual assignment metadata, not automatic routing. Project defaults use high for new sessions; verify phase selection manually or record an approved deviation.

## Setup gates

The human approved the expanded resource map and selected GitHub Issues. The selected marker is persisted once in AGENTS.md; every prompt/worker resolves it from loaded repository context. Installation and verification are tracked in GitHub issue #2. This approval covers team setup only, not an application sprint, stack choice, implementation, or shared-editor extraction.
