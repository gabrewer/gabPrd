# gabPrd Pi Team

## Operator entry points

- `/pm-agent [PRD or feature]`: refinement, product/architecture decisions, and an audited sprint for explicit human approval.
- `/team-lead <approved sprint issue>`: sequential specialized-role execution and canonical quality gates.
- `/pr-checkpoint [base]`: read-only branch-growth/review-boundary report.
- `/pull-request [issue-or-pr-number]`: development-only committed-feature-HEAD push, unique PR reuse/create/update, full contextual review posted as a comment, and actionable linked-sprint-issue comments. Optional input is one positive numeric identifier; no argument is valid and invents no issue link.

Explicit invocation, not installation, authorizes scoped feature push/PR create-update/comment-review/linked-issue comments; it does not authorize source fixes, commits, merging, or issue disposition.

The pull-request utility reads root `PULL_REQUEST_TEMPLATE.md`, validates repository/worktree/origin/head identity and authoritative issue-versus-PR type, preserves all dirty/staged files, and publishes only recorded committed HEAD. Closed/mismatched PRs, failed type lookup, ambiguous duplicates, divergence or stale review head stop rather than fall back or mutate another target. It retains compatible manual PR content and existing accurate titles, uses non-closing references and actual evidence, and reports push/PR/review/issue-comment outcomes separately, including partial successes and confirmed URLs/SHAs. Full review inspects committed head/base trees and in-context callers/consumers/contracts/tests/docs/intent; dirty-checkout checks are not PR-head evidence. Missing evidence is NOT CHECKED unless explicitly accepted by the human. Previously accepted unchanged BOOT manual gaps remain documented, not re-demanded or marked PASS.

This plain instruction template is not a native agent, runtime Git/GitHub enforcement, OS sandbox or automatic model router. Verify Sol/high manually before invocation. It introduces no worker, does not bypass canonical quality gates, and leaves `/pm-agent`, `/team-lead` and read-only `/pr-checkpoint` ownership intact. Installing, discovering or expanding it never invokes publication. Development PRs are distinct from the product's PRD publication flow, which still creates no PR.

Run `/reload` after installing resources, or start a new trusted Pi session from the repository root. Optional bounded builder delegation is implemented by `.pi/extensions/sprint-workers.ts`; see [sprint workers](sprint-workers.md) for scope, preflight, cancellation, and parent-owned integration. `/sprint-view` and `/sprint-pause` are display/cancellation utilities, not additional planning/execution front doors. The durable backend is resolved from automatically loaded AGENTS.md; workers never prompt for it again. GitHub bodies/comments are the execution record. Setup is tracked in https://github.com/gabrewer/gabPrd/issues/2. Do not use that setup issue as approval of app implementation.

## Resource and model map

All routes use exact provider `openai-codex`. Assignments are in `.pi/skill-models.json`: `pm-agent`, `pm`, and the preserved `brainstorm`/`inspire` helpers use **`gpt-6-astra` / high**; `git-committer` uses **`gpt-6-luna` / medium**; all other roles retain **`gpt-6.1-sol`** and their existing thinking levels. Each front-door prompt uses high thinking. The `pull-request` utility is `openai-codex/gpt-6.1-sol` / high; there are **4 prompt templates / 29 assignments**, with manual routing and no new worker. Exact Sol/Astra/Luna IDs were verified available with offline, extension-disabled `pi --list-models`; actual switching/effective thinking must still be verified, not inferred from metadata. The helper mappings do not change their original content or ownership.

| Skill | Thinking | Ownership |
|---|---|---|
| product-designer | high | Product Designer |
| pm | high | PM / Delivery Planner |
| desktop-architect | high | Desktop Architect |
| pi-integration-specialist | high | Pi Integration Specialist |
| domain-modeler | high | Domain Modeler |
| api-developer | high | Contract Designer / API Developer |
| accessibility-specialist | high | Accessibility Specialist |
| shared-component-architect | high | Shared-component Architect |
| frontend-builder | medium | Desktop Shell Builder / Frontend Builder |
| backend-builder | medium | Local Application Services Builder / Backend Builder |
| conversation-builder | medium | Conversation Builder |
| pi-integration-builder | medium | Pi Integration Builder |
| git-workspace-builder | medium | Git / Workspace Builder |
| persistence-recovery-builder | medium | Persistence / Recovery Builder |
| markdown-editor-builder | medium | Markdown Editor Builder |
| windows-release-engineer | medium | Windows Release Engineer |
| test-writer | high | Test Writer |
| security-data-safety-reviewer | high | Security / Data-safety Reviewer |
| destroyer | high | Destroyer |
| review-agent | high | Review Agent |
| tester | high | Runtime / Accessibility Verifier |
| git-committer | medium | Git Committer |
| acceptance-coordinator | high | Acceptance Coordinator |
| brainstorm | high | Preserved product-thinking helper (Astra) |
| inspire | high | Preserved ideation helper (Astra) |

There are 23 new worker skills, plus preserved brainstorm/inspire helpers. The generic backend-builder is specialized to local application command orchestration; it does not duplicate adapter ownership. The generic frontend-builder is the desktop-shell owner. api-developer is the typed contract designer, not an assumed HTTP builder.

## Handoffs and decision gates

Planning: product-designer + PM coordinate desktop architecture, Pi evidence, domain/contracts, accessibility, and optional component sharing. Human approves consequential product/stack choices and the resulting sprint. No predetermined Windows UI framework, storage technology, HTTP server, event sourcing, or editor package.

Execution: domain-modeler → api-developer → task test-writer → assigned builder → actual build gate → scoped destroyer → review-agent (maximum six attempts) → git-committer → independent tester/smoke → PM summary + acceptance-coordinator. Security/accessibility specialists contribute evidence when relevant. Canonical headings, severities, breadcrumbs, evidence and PR thresholds remain defined in instructions/TEAM-ORCHESTRATION.md, not a competing local workflow.

Contract changes return to domain/contract roles; test defects return to test-writer; architectural/security decisions escalate to the human. Before implementation begins, define exact task file ownership and shared interface handoffs. Role activation is risk/scope driven, not 23 ceremonial steps for every task.

## Electron-specific reference guidance

For the approved Electron stack, use `.agents/skills/desktop-architect/references/electron-development.md` through existing role ownership. It is a curated adaptation of the selected sickn33 Electron Development guide, pinned and attributed with its complete MIT notice in `.agents/skills/desktop-architect/references/LICENSE.electron-development`.

Desktop-architect reads the complete guide; api-developer, security-data-safety-reviewer, windows-release-engineer, pi-integration-builder and test-writer have targeted input links. Other UI/editor, Git/persistence, accessibility and verification owners consult applicable sections without changing ownership. It preserves Forge/Webpack/npm/Squirrel, fixes unsafe IPC/path guidance, and describes packaged Pi/SQLite/recovery/accessibility evidence rather than pretending examples prove it.

Reference only: no separately invokable Electron skill, new worker/model route, bundled scripts, package installation, automatic updater or app execution is approved by this addition. Existing builders remain medium and Pi capability discussion remains deferred. Official version-specific docs and approved product/task contracts take precedence; runtime gaps remain NOT CHECKED and blocking absent human acceptance.

## Model routing and isolation limits

Parent-session routing remains **manual** in the shared configuration. `.pi/skill-models.json` documents assignments; Pi does not interpret it natively. The supplied `skill-model-router.ts` is under compatibility review: it currently expects a flat map rather than the versioned `assignments` shape and does not resolve nested codemode read IDs at turn end. Its presence is not evidence of successful automatic routing. The sprint worker extension reads builder assignments and explicitly passes provider/model/thinking flags to subprocesses, after checking availability. It never switches the parent model. Project settings establish GPT-6.1 Sol/high for new sessions, but CLI/resumed-session selection can override them. Verify the active model/level before each phase. Use `/model` and `/thinking` manually for interactive role changes, or an authorized isolated subprocess with explicit flags, for example:

```bash
pi --approve --no-extensions --no-session --model openai-codex/gpt-6.1-sol --thinking high --tools read,grep,find,ls --skill .agents/skills/review-agent/SKILL.md -p "Summarize review boundaries. Do not edit files."
```

Do not claim a medium assignment was applied if the session remained high; verify it or record a human-approved deviation. Missing models block routing rather than trigger a silent fallback. Compatible, tested automatic-router integration remains a separate task, not implied by changing model assignments.

Default execution is the active session adopting skills sequentially. This provides distinct instructions, not independent reasoning contexts or native subagents. The requested sprint-workers extension adds up to two independent builder subprocesses with detached worktrees, disjoint file ownership, explicit tool/model flags, and joined results. Use it only for approved, ready tasks whose tests/contracts/dependencies are already committed. Shared runtime, integration and quality gates remain in the parent. Worktrees/subprocesses are not an OS sandbox; bash still has user permissions and ownership breaches are detected after execution. Read-only tool allowlists omit bash. Never describe sequential skill adoption as parallel delegation or worker return as acceptance.

## Verification

`node verify/team-setup/check-resources.mjs` checks the installed resource map, paths, frontmatter, backend resolution and key guards; it requires Node but no application dependencies. `node verify/team-setup/test-validator.mjs` verifies clean, newline-normalized MIT and restored baselines plus rejection of **39 isolated mutations** in owned temporary copies (21 preserved and 18 pull-request categories); it never mutates repository resources. These checks are targeted guards, not a complete semantic proof of the instructions or live Git/GitHub authorization/race/no-mutation evidence.

The approved operational probe `node .pi/tmp/pr-prompt-expansion-check.mjs` uses only the pinned installed Pi 1.1 loader/expander, an owned empty agent directory, `includeDefaults:false` and the explicit pull-request prompt. It checks discovery/frontmatter and no-argument/numeric/quoted/non-recursive untrusted-data substitution without submitting a prompt to an agent. It is an ignored handoff artifact, not a shipped dependency or native-agent smoke test; an unavailable pinned API is NOT CHECKED and escalated without fallback. Static checks and pure expansion never authorize or run the live PR workflow; that remains a separately qualified human invocation.

Run read-only discovery and explicit worker smoke tests from the root, with trusted project assets and extensions disabled:

```bash
pi --approve --no-extensions --no-session --model openai-codex/gpt-6.1-sol --thinking high --tools read,grep,find,ls -p "List available project skills and prompt templates. Summarize planning/execution ownership and backend. Do not edit files."
pi --approve --no-extensions --no-session --model openai-codex/gpt-6.1-sol --thinking high --tools read,grep,find,ls --skill .agents/skills/review-agent/SKILL.md -p "Summarize review boundaries and backend resolution. Do not edit files."
```

These checks establish team-resource readiness, not app build, Pi integration, Windows usability, packaging, or acceptance. BOOT-001 established the application build/test surface; inspect its committed manifests, contracts and documented evidence for relevant app checks rather than rely on historical greenfield inventory. This docs/config utility does not change app behavior or require rerunning unrelated desktop manual gates. Required runtime checks not performed must be NOT CHECKED, blocking unless the human explicitly accepts the specific gap.

## Safety and state

Temporary drafts belong in ignored `.pi/tmp/`. Never commit session/provider state, credentials, logs, or unrelated pre-existing assets. Never blanket-reset/clean failed tasks; preserve work and propose scoped recovery. Development PRs are allowed with authorization; the product's PRD publication flow opens no PR. All issues stay open for human acceptance/disposition. Tests and commits are implementation evidence, not acceptance.
