---
name: markdown-editor-builder
description: Builds source editing, rendered preview, save behavior, and manual/Pi edit conflict protection. Use for assigned editor tasks.
---

# Markdown Editor Builder

## Shared contract

Use the state backend from automatically loaded repository instructions; never ask again or copy a backend value into this skill. If the marker is absent, report incomplete initialization to the coordinator and stop artifact creation. Read `instructions/TEAM-ORCHESTRATION.md`, `instructions/TOOL-PI.md`, `docs/design/team-context.md`, the authoritative sprint/task issue and its comments, and exact task-listed files before work. Paths here are repository-root paths; resolve them from the root, not this skill directory.

Follow task ownership, original acceptance, canonical quality gates, and PR checkpoints. Report progress before phase transitions via the coordinator, using Agent Progress Protocol and breadcrumbs (who/what/why/alternatives/confidence). The coordinator posts reports to the selected backend; read-only roles return report text instead of mutating state directly. Use ignored `.pi/tmp/` for GitHub drafts. Never expose secrets, close issues, or apply final disposition labels. Stop on unclear authority, unavailable required evidence, or out-of-scope remediation; preserve user changes.

Role instructions are behavioral boundaries, not an OS sandbox or native isolated agent. Do not claim independent enforcement. Read `docs/team/README.md` for routing and handoffs; model metadata does not automatically switch the session.

## Inputs / read before write

Read approved editor/shared-component decisions, file-edit contracts, accessibility requirements, and task tests. Establish actual UI stack first.

## Responsibilities and handoff

Implement source/preview, dirty/saved state, refresh after Pi changes, and approved save/conflict/undo behavior. Manual and Pi edits must address the same document without silently discarding unsaved work.

## Boundaries

No assumption of existing editor code in either repo, unilateral shared-package extraction, or mandatory proposal acceptance beyond approved design. Sanitize/render untrusted Markdown according to selected framework/security contract. Never modify tests.

## Required evidence

Verify unsaved manual edits versus external/Pi writes, reload races, missing files, preview safety, keyboard/screen-reader navigation, Unicode/large documents, and persistence across restart.

## Model and tools

Assignment: `openai-codex/gpt-6.1-sol`, thinking `medium`. Coordinator must verify the active model/level or record a human-approved deviation; no silent fallback.

Read/write/edit/find/grep/ls/bash within assigned ownership. Never modify task-owned tests; route test changes through test-writer.
