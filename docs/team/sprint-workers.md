# Bounded gabPrd Sprint Workers

## What is installed

- `.pi/extensions/sprint-workers.ts`: model-callable `sprint_workers` tool; `/sprint-pause` command.
- `.pi/lib/sprint-workers.ts`: validated batch dispatch, detached Git worktrees, real Pi subprocesses, cancellation, usage and scope reports.
- `.pi/lib/sprint-panel.ts`: live status panel; `/sprint-view [details|plain|powerline|hide|show]`.
- `.pi/lib/worker-lifecycle.ts`: captured batch completion; shutdown/switch/fork and explicit pause abort **and join** preparation/process/log/result completion before returning.
- `.pi/tests/*.test.mjs`: dependency-free Node tests, real temporary Git repositories/processes, joined shutdown regressions, and UI/RPC lifecycle harnesses.

Adapted from the user-specified Lessi extension and its dispatcher/panel/tests. No Aspire, slots, Blazor, Lessi-specific model-map shape, or Lessi event names remain. Host imports are supplied by Pi; no application stack or package manifest is introduced. Direct library/tests require Node with TypeScript type-stripping support (verified on Node 24); Pi itself loads extensions through its host loader.

## Entry and approval

Use `/pm-agent` to prepare an explicitly approved plan, then `/team-lead <issue>` to execute. The team lead may call the tool for one/two independent ready **builder** assignments. It is not another planning front door or an autonomous sprint loop. Default role adoption remains sequential. `/sprint-view` only controls presentation; `/sprint-pause` stops an active batch without deleting work.

Before dispatch:

1. Commit or otherwise explicitly account for parent changes; the extension requires a clean tracked/untracked parent checkout. Do not stash/delete unrelated user files automatically. It must run from the repository root.
2. Commit the required tests, domain/contracts, skill definitions, model map, and dependencies. Workers branch from the exact committed HEAD; they do not see parent uncommitted work. Plan a reviewed contract/test foundation slice first when necessary.
3. Assign exact literal repo-relative files/directories with no overlap (including case-insensitive directory ancestry). No globs, traversal, absolute/drive paths, Windows reserved/trailing-dot/space components, symlink traversal, or protected `.git`, `.pi`, `.agents`, instructions, agent context, and ignore-policy scopes.
4. Select only one of the eight builder skills: frontend-builder, backend-builder, conversation-builder, pi-integration-builder, git-workspace-builder, persistence-recovery-builder, markdown-editor-builder, windows-release-engineer. Test-writer, domain/contracts, planning, reviewer/destroyer/tester/committer and acceptance remain in parent.
5. Resolve exact routes from `.pi/skill-models.json` `assignments`. Parent checks authenticated model availability; subprocess flags explicitly select provider/model/thinking. No silent fallback, local-route override, or parent model switching.
6. Optional `dependsOnCommits` entries must be integrated commit hashes ancestral to parent HEAD, not worker branches or unfinished dependencies.

The whole batch is prevalidated before worktree creation or billable subprocess launch. A dirty checkout containing the unrelated copied tool adapters will be rejected; the human must account for those files first. Do not broaden ignore rules merely to bypass this gate.

## Tool contract

`tasks` is an array of 1–2 assignments, each with `id`, `skill`, concrete `task`, literal `paths`, and optional `dependsOnCommits`. IDs are unique case-insensitive simple names. `timeoutMinutes` is an integer 1–30 (default 10). Tasks must describe implementation-ready approved scope; do not use broad directory ownership to conceal shared interfaces.

Each task receives a separate detached worktree and explicit Pi flags: JSON print mode, no session persistence, trusted committed project context, extensions/MCP/prompt-template discovery disabled, only the assigned skill loaded, explicit builtin tool allowlist, explicit provider/model/thinking, offline startup metadata behavior. Provider inference still uses the configured provider/network/auth; offline here is not offline inference.

Workers receive loaded repository backend rules but the parent owns GitHub updates. They must not recursively delegate, commit, switch branches, push, create PRs, mutate original/product repositories, run shared services, deploy, alter tests/policies, or publish a PRD. Only isolated checks within the assignment are appropriate.

Results include `returned` / `failed` / `cancelled`, worktree/base/log paths, bounded report, elapsed time, changed files, outside-scope files, and provider-reported usage when available. `returned` means a report is ready for inspection; it does not mean implemented, reviewed, committed, or accepted. A BLOCKED report may also be returned. Changed-path reporting preserves NUL-delimited filenames. Scope/commit/branch breaches become failed results, never auto-integrated. Mixed batches are an error result with all recoverable data retained.

## Integration and quality gates

The parent waits for the entire batch, inspects reports and diffs (including generated/untracked files), and rejects ownership breaches. No auto-copy/cherry-pick/merge/commit occurs. Integrate only reviewed owned changes without clobbering parent work; preserve original worker output. Then run the canonical parent build → destroy → review → commit → smoke gates. Worker checks supplement, not replace, mandatory automated integration/runtime evidence. Dispatch dependent tasks only after prerequisite work is integrated and committed. Issue comments remain the durable state record.

## Cancellation and diagnostics

Tool abort, `/sprint-pause`, session switch/fork/shutdown, or per-worker timeout stop child process trees and await process exit/log completion. No retry or background continuation is scheduled. Partial worktrees and logs remain under ignored `.pi/tmp/sprint-workers/<batch-id>/`; per-task result JSON sits beside the event log. Review stopped processes and files before retrying. Explicit cleanup/removal is a separate human-approved operation; the extension never removes worktrees.

JSONL decoding splits only on LF using UTF-8 decoding (Unicode separators inside JSON strings are not framing). Logs can contain prompts, tool outputs, provider errors, and credentials; treat them as private diagnostics, not safe GitHub report attachments. Provider failure text is excluded from model-facing failure summaries. Bounded stderr tail is retained as a diagnostic record. Usage is aggregated from authoritative completed assistant messages, not streaming snapshots. Cancellation may lack final provider usage; reported totals are only what the provider emitted.

## Display and limits

Live panel shows phase/activity/model/clock and report availability, never a gate verdict. Details/plain/powerline/hide/show controls are available; RPC uses plain snapshots, print/headless mode remains functional. Stale results cannot revive a panel after session changes. Incoming workers stop on session changes; a switched session should inspect old retained diagnostics explicitly, not assume it owns prior tasks. Terminal-only rendering uses width-aware truncation and strips controls from untrusted text. Real interactive appearance still needs a human walkthrough.

Subprocesses and worktrees isolate conversations and ordinary checkout writes, **not OS permissions**. Bash retains the user's filesystem/network/credential access, scope checks happen after execution, and malicious or accidental writes outside the worktree cannot be sandboxed/detected comprehensively. Use an external container/VM/dedicated user when an actual security boundary is required. An explicit tool allowlist and disabled extensions reduce exposure but do not sandbox arbitrary shell commands. Do not dispatch untrusted assignments.

## Verification

```bash
node --test .pi/tests/*.test.mjs
node verify/team-setup/check-resources.mjs
node verify/team-setup/test-validator.mjs
```

For registration smoke, explicitly load this extension with other extensions disabled and request read-only inspection; do not dispatch product work merely to check loading. Actual worker-launch smoke should use a disposable committed scratch clone with read-only assignments, never the product workspace. These are development-tool checks, not product Windows/Pi integration or acceptance.
