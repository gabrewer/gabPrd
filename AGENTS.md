# gabPrd Project Instructions

**State backend:** github-issues

## Workflow and authority

- Planning requests enter `.pi/prompts/pm-agent.md`; approved-plan execution enters `.pi/prompts/team-lead.md`. `/pr-checkpoint` is only a read-only review-boundary utility. Load the entry-point instructions, do not bypass their gates.
- Follow `instructions/TEAM-ORCHESTRATION.md` and `instructions/TOOL-PI.md`, specialized by `docs/design/team-context.md` and `docs/team/README.md`.
- Product authority is `docs/design/2026-10-09-prd-creator-prd.md`. Installing the team is not approval of implementation, architecture, or any sprint.
- Reuse the state backend from this automatically loaded context in every role. GitHub issue bodies/comments are authoritative for execution state; do not create local status/report mirrors. Durable design/contract documents may be committed.
- Target all GitHub commands explicitly at `gabrewer/gabPrd`. Load the available `gh` skill before using the GitHub CLI through the shell tool. Draft bodies/comments under ignored `.pi/tmp/`. Never close issues or apply final disposition labels. Human acceptance/disposition is separate from tests and commits.

## Greenfield and project boundaries

- No application build/test/run commands or UI stack exist yet. Inspect before planning; do not invent paths, frameworks, or passing build evidence. Resolve PRD integration choices with official documentation and update the existing PRD before implementation-ready tasking. Establish the real build/test surface in an explicit approved bootstrap task.
- This is a Windows local desktop app, not an assumed cloud backend. Generic server/Marten/React/Vitest/Playwright/Bun examples are not stack decisions. Typed local service and Pi contracts replace assumed HTTP endpoints where appropriate.
- Neither project has a Markdown editor. Sharing with gabCode is a possibility requiring inspection and a human decision, not an existing dependency.
- Preserve existing brainstorm/inspire skills and user-supplied instructions. Read and respect their ownership; they do not replace sprint coordination.

## Data safety and verification

- Protect original checkouts, unrelated files, drafts, and completed conversations. Validate repository/worktree/branch/file/session links before mutation. Never hide structured domain state in free-text fields.
- Product publication requires explicit writer approval and publishes only the approved PRD on its own branch. No product-generated PRs, automatic merging, force-pushing, auto-answers, or destructive worktree cleanup.
- Require automated integration evidence for Git, Pi lifecycle, persistence/restart, concurrent edits, and other runtime boundaries. Validate rejection/no-mutation paths and secret-safe errors with sentinel secrets.
- Require real Windows runtime, keyboard/screen-reader, 200% scaling, and reduced-motion evidence. Unavailable evidence is `NOT CHECKED` and blocking unless a human explicitly accepts the gap.
- Worker roles run sequentially in the active Pi session by default. Skills/model metadata alone do not isolate agents, enforce permissions, or switch models. The optional `sprint_workers` extension runs at most two approved ready builders in detached worktrees with explicit subprocess model/tool flags. Use disjoint scopes and committed contracts/tests/dependencies; account for dirty parent changes first. Parent owns GitHub updates, shared runtime, integration, commits and gates. Never auto-integrate or treat return as completion. Read `docs/team/sprint-workers.md` before dispatch. This is process/worktree isolation, not an OS sandbox; parent routing remains manual.

## Git safety and review boundaries

- Never commit or push directly to main/master; use feature branches and review PRs. Rebase mainline updates with autostash or an explicit stash; never merge mainline into features. For an authorized update of a previously pushed rebased branch, only `--force-with-lease` is allowed.
- Pushes and PR creation require user authorization. Review approval is not push authorization.
- Preserve unrelated uncommitted changes. The generic orchestration failed-task cleanup example is overridden: never run blanket `git checkout -- .`, `git reset --hard`, or `git clean -fd`. Stop and propose task-scoped recovery for human approval.
- Commit only explicit task-owned files after `SHIP IT`; never stage broadly or commit temporary/session artifacts. Package additions use the selected package manager CLI, not hand-edited dependency manifests.
- Apply canonical PR checkpoints before work, after coherent batches, and before independent scope: advisory at 8 commits OR 30 files; strong at 15 commits OR 60 files. At STRONG, stabilize then pause for a human decision. Existing PR base wins; otherwise use origin/main (origin/master only if appropriate).
