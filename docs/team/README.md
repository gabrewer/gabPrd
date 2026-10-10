# gabPrd Pi Team

## Operator entry points

- `/pm-agent [PRD or feature]`: refinement, product/architecture decisions, and an audited sprint for explicit human approval.
- `/team-lead <approved sprint issue>`: sequential specialized-role execution and canonical quality gates.
- `/pr-checkpoint [base]`: read-only branch-growth/review-boundary report.

Run `/reload` after installing resources, or start a new trusted Pi session from the repository root. Optional bounded builder delegation is implemented by `.pi/extensions/sprint-workers.ts`; see [sprint workers](sprint-workers.md) for scope, preflight, cancellation, and parent-owned integration. `/sprint-view` and `/sprint-pause` are display/cancellation utilities, not additional planning/execution front doors. The durable backend is resolved from automatically loaded AGENTS.md; workers never prompt for it again. GitHub bodies/comments are the execution record. Setup is tracked in https://github.com/gabrewer/gabPrd/issues/2. Do not use that setup issue as approval of app implementation.

## Resource and model map

All new resources use exact provider `openai-codex`, model `gpt-6.1-sol`, verified with `pi --list-models` at setup. Assignments are in `.pi/skill-models.json`. Each prompt uses high thinking.

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

There are 23 new worker skills, plus preserved brainstorm/inspire helpers. The generic backend-builder is specialized to local application command orchestration; it does not duplicate adapter ownership. The generic frontend-builder is the desktop-shell owner. api-developer is the typed contract designer, not an assumed HTTP builder.

## Handoffs and decision gates

Planning: product-designer + PM coordinate desktop architecture, Pi evidence, domain/contracts, accessibility, and optional component sharing. Human approves consequential product/stack choices and the resulting sprint. No predetermined Windows UI framework, storage technology, HTTP server, event sourcing, or editor package.

Execution: domain-modeler → api-developer → task test-writer → assigned builder → actual build gate → scoped destroyer → review-agent (maximum six attempts) → git-committer → independent tester/smoke → PM summary + acceptance-coordinator. Security/accessibility specialists contribute evidence when relevant. Canonical headings, severities, breadcrumbs, evidence and PR thresholds remain defined in instructions/TEAM-ORCHESTRATION.md, not a competing local workflow.

Contract changes return to domain/contract roles; test defects return to test-writer; architectural/security decisions escalate to the human. Before implementation begins, define exact task file ownership and shared interface handoffs. Role activation is risk/scope driven, not 23 ceremonial steps for every task.

## Model routing and isolation limits

No parent-session model-router extension is installed. `.pi/skill-models.json` documents assignments; Pi does not interpret it natively. The sprint worker extension reads builder assignments and explicitly passes provider/model/thinking flags to subprocesses, after checking availability. It never switches the parent model. Project settings establish GPT-6.1 Sol/high for new sessions, but CLI/resumed-session selection can override them. Verify the active model/level before each phase. Use `/model` and `/thinking` manually for interactive role changes, or an authorized isolated subprocess with explicit flags, for example:

```bash
pi --approve --no-extensions --no-session --model openai-codex/gpt-6.1-sol --thinking high --tools read,grep,find,ls --skill .agents/skills/review-agent/SKILL.md -p "Summarize review boundaries. Do not edit files."
```

Do not claim a medium assignment was applied if the session remained high; verify it or record a human-approved deviation. Missing models block routing rather than trigger a silent fallback. An automatic routing extension is a separate future task, not implied by this file.

Default execution is the active session adopting skills sequentially. This provides distinct instructions, not independent reasoning contexts or native subagents. The requested sprint-workers extension adds up to two independent builder subprocesses with detached worktrees, disjoint file ownership, explicit tool/model flags, and joined results. Use it only for approved, ready tasks whose tests/contracts/dependencies are already committed. Shared runtime, integration and quality gates remain in the parent. Worktrees/subprocesses are not an OS sandbox; bash still has user permissions and ownership breaches are detected after execution. Read-only tool allowlists omit bash. Never describe sequential skill adoption as parallel delegation or worker return as acceptance.

## Verification

`node verify/team-setup/check-resources.mjs` checks the installed resource map, paths, frontmatter, backend resolution and key guards; it requires Node but no application dependencies. `node verify/team-setup/test-validator.mjs` verifies a clean baseline and rejection of nine isolated mutations in temporary copies; it never mutates repository resources. These checks are targeted guards, not a complete semantic proof of the instructions.

Run read-only discovery and explicit worker smoke tests from the root, with trusted project assets and extensions disabled:

```bash
pi --approve --no-extensions --no-session --model openai-codex/gpt-6.1-sol --thinking high --tools read,grep,find,ls -p "List available project skills and prompt templates. Summarize planning/execution ownership and backend. Do not edit files."
pi --approve --no-extensions --no-session --model openai-codex/gpt-6.1-sol --thinking high --tools read,grep,find,ls --skill .agents/skills/review-agent/SKILL.md -p "Summarize review boundaries and backend resolution. Do not edit files."
```

These checks establish team-resource readiness, not app build, Pi integration, Windows usability, packaging, or acceptance. No app build/test commands exist until an approved bootstrap establishes them. Required runtime checks not performed must be NOT CHECKED.

## Safety and state

Temporary drafts belong in ignored `.pi/tmp/`. Never commit session/provider state, credentials, logs, or unrelated pre-existing assets. Never blanket-reset/clean failed tasks; preserve work and propose scoped recovery. Development PRs are allowed with authorization; the product's PRD publication flow opens no PR. All issues stay open for human acceptance/disposition. Tests and commits are implementation evidence, not acceptance.
