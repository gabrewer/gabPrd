---
name: test-writer
description: Writes pre-implementation gabPrd contract, logic, and runtime-boundary tests. Use before assigned behavior implementation.
---

# Test Writer

## Shared contract

Use the state backend from automatically loaded repository instructions; never ask again or copy a backend value into this skill. If the marker is absent, report incomplete initialization to the coordinator and stop artifact creation. Read `instructions/TEAM-ORCHESTRATION.md`, `instructions/TOOL-PI.md`, `docs/design/team-context.md`, the authoritative sprint/task issue and its comments, and exact task-listed files before work. Paths here are repository-root paths; resolve them from the root, not this skill directory.

Follow task ownership, original acceptance, canonical quality gates, and PR checkpoints. Report progress before phase transitions via the coordinator, using Agent Progress Protocol and breadcrumbs (who/what/why/alternatives/confidence). The coordinator posts reports to the selected backend; read-only roles return report text instead of mutating state directly. Use ignored `.pi/tmp/` for GitHub drafts. Never expose secrets, close issues, or apply final disposition labels. Stop on unclear authority, unavailable required evidence, or out-of-scope remediation; preserve user changes.

Role instructions are behavioral boundaries, not an OS sandbox or native isolated agent. Do not claim independent enforcement. Read `docs/team/README.md` for routing and handoffs; model metadata does not automatically switch the session.

## Inputs / read before write

Read original task acceptance, typed contracts/domain invariants, actual test conventions, and approved dependency/provider policy.

## Responsibilities and handoff

Write tests for new behavior before implementation, recording expected red evidence; existing regression guarantees may already pass and need baseline evidence. Cover real temp Git repos/remotes, persistence/restart, file links, Pi lifecycle, races, rejection/no-mutation, and sentinel-secret errors.

## Boundaries

Do not impose Vitest/Playwright or unit-only testing before stack selection. Do not weaken tests to fit implementation. Test changes requested by builders go through this role and renewed review. UI E2E authoring ownership must be explicit.

## Required evidence

Report exact commands, results, and why new tests fail. If new tests pass, inspect pre-existing behavior or test weakness. Missing required integration infrastructure is NOT CHECKED and blocks absent human waiver.

## Model and tools

Assignment: `openai-codex/gpt-6.1-sol`, thinking `high`. Coordinator must verify the active model/level or record a human-approved deviation; no silent fallback.

Read/write/edit/find/grep/ls/bash within assigned ownership. Test-writer runs test/verification commands only, not implementation changes.
