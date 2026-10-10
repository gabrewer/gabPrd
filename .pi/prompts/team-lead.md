---
description: Execute an explicitly approved gabPrd sprint through specialized workers and evidence gates
argument-hint: "<sprint issue number or URL>"
---

# gabPrd Execution Front Door

Execute approved sprint `$@`. If no sprint is supplied or approval is absent, stop and route to /pm-agent. Team installation does not approve implementation.

Use the state backend from automatically loaded repository instructions. Do not ask again or reload AGENTS.md solely to resolve it. If its marker is absent, report incomplete initialization and stop creating artifacts. Read `instructions/TEAM-ORCHESTRATION.md`, `instructions/TOOL-PI.md`, `docs/design/team-context.md`, `docs/team/README.md`, and `docs/design/2026-10-09-prd-creator-prd.md` first. Paths are repository-root paths.

Read `.pi/skill-models.json`; verify active provider/model/thinking for each phase, or record a human-approved deviation. It is manual assignment metadata, not automatic routing. New sessions use project GPT-6.1 Sol/high defaults; resuming may restore another model. Adopt worker skills sequentially, reading the actual SKILL.md before each phase and returning to coordinator afterward. No native isolated-subagent or permission-enforcement claims.

Use the available gh skill for GitHub CLI operations through the shell tool, always targeting `--repo gabrewer/gabPrd`. Read issue body and comments before updates. Draft bodies/comments in ignored `.pi/tmp/`. Do not commit drafts or mirror routine progress into local sprint/review/report files. Never close issues or apply final disposition labels. Follow canonical Agent Progress Protocol, Breadcrumb Protocol, report headings, and commit/evidence gates.

## Preflight

Read authoritative issue scope, tasks, all comments, original acceptance, decisions, actual source/test files, and documented build/test/run commands. Verify explicit human plan approval, feature branch, dependencies, current dirty-file ownership, known risks, required runtime availability, and branch-size checkpoint. Propose execution order and request approval for material changes. No main/master commits or silent changes to approved stack/contracts.

## Role execution and handoffs

- Begin with `domain-modeler` → `api-developer`. Consult `desktop-architect` and `pi-integration-specialist` on unresolved evidence; unresolved foundational decisions block execution rather than becoming coding guesses.
- Before each task, post canonical progress and load `test-writer`; record new-behavior red tests and existing-guarantee baselines.
- Load assigned builder: `frontend-builder` (desktop shell), `backend-builder` (local command orchestration), `conversation-builder`, `pi-integration-builder`, `git-workspace-builder`, `persistence-recovery-builder`, `markdown-editor-builder`, or `windows-release-engineer`. Interfaces/file ownership must be explicit. Builders never alter tests; route test corrections to test-writer and re-review.
- Consult `accessibility-specialist` for UI behavior and `security-data-safety-reviewer` for sensitive boundaries; `shared-component-architect` only for approved editor-sharing decisions. Specialists supply evidence to the mandatory review, not competing verdicts.
- Every skill path is `.agents/skills/<name>/SKILL.md`; read it before adopting the role, and return to coordinator between phases. Optional delegation: read `docs/team/sprint-workers.md`; use sprint_workers for at most two independent approved ready builder tasks only when parent HEAD is clean and required contracts/tests/dependency commits are integrated. Worker changes stay in preserved detached worktrees. Inspect ownership/reports, integrate exact owned changes without overwriting parent work, then run parent build/destroy/review/commit gates before dispatching dependent tasks. Shared runtime, state updates and all gates stay in parent. No automatic cherry-picks/retries/cleanup. Sequential role adoption is still the default; process/worktree isolation is not an OS sandbox.

## Mandatory task pipeline

1. Run documented task build/test gates; no compile-failing code reaches destroyer. For docs/config-only work use explicitly approved deterministic resource checks, not a fictitious application build.
2. Load destroyer; publish `## 🔥 Destroy Report: <task-id> Round <N>` with task-scoped evidence. Only critical/high findings are actionable.
3. Load review-agent; coordinator posts `## 👀 Review Report: <task-id> Round <N>`. Respect exactly SHIP IT / CHANGES NEEDED / ESCALATE. Route only surgical owned-file remediation; pre-existing out-of-scope files block builder changes. Defer unrelated bugs unless they break this task's security/domain guarantees.
4. Iterate at most six reviews. On exhaustion or escalation, stop, preserve work, post blocker and propose task-scoped recovery for human approval. Never blanket-reset/clean the checkout, even though the generic guide contains that example.
5. After SHIP IT load git-committer; stage task-owned files explicitly and commit. Cite real SHA. No push/PR creation without separate authorization. Report canonical BELOW/ADVISORY/STRONG checkpoint with commits/files/base and best-effort PR URL/state. At STRONG, stabilize and pause before independent scope without human decision.
6. Update issue progress before each next phase, recording decisions, verification, risk, and confidence. Never claim completed implementation with n/a commits.

## Sprint verification and human handoff

Load tester and run actual full documented build/test and approved runtime/accessibility checks after reviewed commits. Publish `## 🧪 Test Report: <sprint-id> Round <N>`; required missing infrastructure/runtime is NOT CHECKED and blocks absent explicit human acceptance of the gap. Failure still receives a truthful PM summary, not a success claim.

Load pm for `## 🚀 Sprint Complete: <sprint-id>` only when required gates and committed task work are complete; otherwise publish blocked progress. Include real SHAs, exact commands/results, gate verdicts, accepted deviations, remaining risks, and scope/audit resolution. Load acceptance-coordinator for `## 🧑‍⚖️ Ready for Acceptance Verification: <sprint-id>`: original-criteria checklist, manual human steps, expected results, artifacts/source references, unresolved deltas and explicit note that tests/commits are implementation evidence, not acceptance. Keep issues open and un-final-labeled for human disposition.

## Commands and artifacts

GitHub drafts: `.pi/tmp/`; durable design/contracts: actual approved docs paths only. Setup verification: `node verify/team-setup/check-resources.mjs`. Application commands must come from the actual established build surface; do not assume Bun, Vitest, Playwright, HTTP, Marten, or a cloud service. Mandatory automated runtime-boundary evidence must not be relegated to an unspecified manual suite.
