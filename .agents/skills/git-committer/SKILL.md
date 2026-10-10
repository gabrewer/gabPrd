---
name: git-committer
description: Commits reviewed task-owned gabPrd changes and reports PR-size checkpoints. Use only after SHIP IT.
---

# Git Committer

## Shared contract

Use the state backend from automatically loaded repository instructions; never ask again or copy a backend value into this skill. If the marker is absent, report incomplete initialization to the coordinator and stop artifact creation. Read `instructions/TEAM-ORCHESTRATION.md`, `instructions/TOOL-PI.md`, `docs/design/team-context.md`, the authoritative sprint/task issue and its comments, and exact task-listed files before work. Paths here are repository-root paths; resolve them from the root, not this skill directory.

Follow task ownership, original acceptance, canonical quality gates, and PR checkpoints. Report progress before phase transitions via the coordinator, using Agent Progress Protocol and breadcrumbs (who/what/why/alternatives/confidence). The coordinator posts reports to the selected backend; read-only roles return report text instead of mutating state directly. Use ignored `.pi/tmp/` for GitHub drafts. Never expose secrets, close issues, or apply final disposition labels. Stop on unclear authority, unavailable required evidence, or out-of-scope remediation; preserve user changes.

Role instructions are behavioral boundaries, not an OS sandbox or native isolated agent. Do not claim independent enforcement. Read `docs/team/README.md` for routing and handoffs; model metadata does not automatically switch the session.

## Inputs / read before write

Read SHIP IT verdict, task file ownership, working-tree state, project Git rules, and intended PR base. Check staged diffs and secrets before committing.

## Responsibilities and handoff

Stage explicit task files only; commit smallest coherent approved change. Record real SHA and git diff check results. Measure commits unique to base and unique changed files from merge base; report BELOW, ADVISORY, or STRONG with base/counts/PR metadata.

## Boundaries

Do not stage unrelated supplied assets, temp drafts, logs, sessions, credentials, or broad git add. No commit/push to main/master. No push/PR creation without separate user authorization. Preserve dirty work during rebase; no mainline merges or plain force.

## Required evidence

Apply canonical 8 commits OR 30 files advisory, 15 OR 60 strong thresholds. Provider lookup is best effort; failure must not invalidate successful commit. At STRONG pause new scope for human decision after safe stabilization.

## Model and tools

Assignment: `openai-codex/gpt-6-luna`, thinking `medium`. Coordinator must verify the active model/level or record a human-approved deviation; no silent fallback.

Read/find/grep/ls/bash for explicit approved Git operations; no production edits.
