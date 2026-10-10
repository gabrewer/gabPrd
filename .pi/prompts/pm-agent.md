---
description: Refine gabPrd product decisions and prepare an audited sprint for human approval
argument-hint: "[PRD path or feature]"
---

# gabPrd Planning Front Door

Plan/refine `${@:-docs/design/2026-10-09-prd-creator-prd.md}`. This is planning, not permission to execute.

Use the state backend from automatically loaded repository instructions. Do not ask again or reload AGENTS.md solely to resolve it. If its marker is absent, report incomplete initialization and stop creating artifacts. Read `instructions/TEAM-ORCHESTRATION.md`, `instructions/TOOL-PI.md`, `docs/design/team-context.md`, `docs/team/README.md`, and `docs/design/2026-10-09-prd-creator-prd.md` first. Paths are repository-root paths.

Read `.pi/skill-models.json`; verify active provider/model/thinking for each phase, or record a human-approved deviation. It is manual assignment metadata, not automatic routing. The PM front door and pm skill are assigned `openai-codex/gpt-6-astra` with high thinking; verify that route rather than treating the startup default as PM activation. New sessions use project GPT-6.1 Sol/high defaults; resuming may restore another model. Adopt worker skills sequentially, reading the actual SKILL.md before each phase and returning to coordinator afterward. No native isolated-subagent or permission-enforcement claims.

Use the available gh skill for GitHub CLI operations through the shell tool, always targeting `--repo gabrewer/gabPrd`. Read issue body and comments before updates. Draft bodies/comments in ignored `.pi/tmp/`. Do not commit drafts or mirror routine progress into local sprint/review/report files. Never close issues or apply final disposition labels. Follow canonical Agent Progress Protocol, Breadcrumb Protocol, report headings, and commit/evidence gates.

## Planning sequence

1. Inventory real code, manifests, tests, documented commands, agent assets, issue labels/milestones and current branch/PR. Record absent build surfaces honestly. Read source/tests named by the proposed scope before writing tasks; do not invent paths or commands.
2. Load `.agents/skills/product-designer/SKILL.md` and `.agents/skills/pm/SKILL.md`. Use existing brainstorm/inspire only as product-thinking helpers. Consult `desktop-architect`, `pi-integration-specialist`, `domain-modeler`, `api-developer`, `accessibility-specialist`, and `shared-component-architect` as relevant, each at `.agents/skills/<name>/SKILL.md`.
3. Resolve consequential PRD questions with official integration evidence and human decisions before implementation-ready tasking. Refine the same PRD; do not turn unanswered architecture choices into pretend-ready implementation tasks. Approved, bounded feasibility probes may precede decisions. Sharing an editor with gabCode is optional future work, not existing code.
4. Require full Contract Impact Check before tasks. Full-stack here means desktop UI plus local service/filesystem/Git/Pi/persistence boundaries, not an invented cloud backend. Allow UI-only only when explicitly UI polish/prototype/docs. Require typed contracts, write-side resource-link validation, safe errors, and automated integration testing for runtime boundaries. No structured state tunneling through free text. For parity/migration only, add source-delta audit with exact references and approved deviations.
5. Plan an explicit first build/test-surface bootstrap after architecture approval. Subsequent implementation-ready tasks use actual established paths/commands; do not create downstream verification scripts before commands exist. Every task includes type, owner, dependencies, files to read/change, acceptance, exact verification, skills, commit hint, and PR slice.
6. Measure branch growth using existing PR base or mainline. Plan earlier review boundaries for contracts/security and canonical advisory (8 commits OR 30 files) / strong (15 OR 60) checkpoints. Do not add independent scope at STRONG without a human decision.
7. Create/update the authoritative sprint epic and linked task issues using canonical structure and actual appropriate labels, never final labels. Default child task issues; use one embedded-checklist control issue only if explicitly chosen for that sprint. Copy the persisted backend marker into the epic as a record, not a new choice. Use task-issues.json only when issue IDs exist and mapping is useful. No issue sprawl for mandatory quality phases.
8. Read the proposed plan back to the human: scope, decisions, dependency order, verification gaps and review boundaries. Record explicit approval; leave unresolved plans planning/blocked. Never start implementation from team setup approval.

## Quality/evidence contract to include in every plan

Use canonical Destroy Report, Review Report, Test Report, Sprint Complete, and Ready for Acceptance Verification headings. Define domain → contract → tests → build → build gate → destroy → review → commit → final smoke/testing → PM summary/acceptance phases. The review loop caps at six; failures preserve user changes. SHIP IT is required before commit. Completed work cites actual SHAs and exact results; missing required evidence is NOT CHECKED and blocks unless human-approved. Tests and commits are not acceptance; human verifies original criteria and controls issue disposition.

## Verification during planning

Setup-resource integrity: `node verify/team-setup/check-resources.mjs`. Product build/test/runtime commands: inspect and document the actual approved bootstrap outputs; none are assumed today. Do not label this resource check application verification.
