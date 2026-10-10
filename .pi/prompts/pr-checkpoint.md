---
description: Inspect branch growth and recommend a review boundary without changing files or GitHub state
argument-hint: "[base ref]"
---

# gabPrd PR Checkpoint

Use the state backend from automatically loaded repository instructions without asking again; if absent, report incomplete setup to the coordinator. This utility is read-only and returns a report; the coordinator may record it in the configured backend. It does not own planning or execution.

Read `instructions/TEAM-ORCHESTRATION.md` Pull Request Size Checkpoint and `docs/team/README.md`. Assignment: `openai-codex/gpt-6.1-sol`, high thinking, as recorded in `.pi/skill-models.json`; no automatic switching. Inspect current branch/status, Git history and hosting metadata (load gh skill before CLI use, target gabrewer/gabPrd). Never edit files, fetch/rebase, stage/commit/push, create a PR, or mutate issue state.

Optional supplied base: `$@`. Use existing PR baseRefName first; otherwise an explicitly supplied intended PR base; otherwise origin/main or actual origin/master mainline. If unavailable, report NOT CHECKED rather than invent counts. Count commits with `git rev-list --count <base>..HEAD` and unique changed files with `git diff --name-only <merge-base> HEAD`, using `git merge-base <base> HEAD`. Report uncommitted scope separately; it is not included in committed counts.

Return base, branch, counts, PR URL/state when available, and BELOW / ADVISORY / STRONG. ADVISORY: 8 commits OR 30 files; finish safe coherent batch then recommend opening/reviewing a PR. STRONG: 15 OR 60; stabilize minimal change and require human decision before independent scope. Generated files still count. Metadata failure is a reported limitation, not a failed successful commit. Do not propose review while known required gates are failing. A checkpoint never grants push/PR permission.
