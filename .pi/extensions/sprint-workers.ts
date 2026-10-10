import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import { dispatch, validateAssignments, validateRoute, addUsage, emptyUsage, type WorkerResult } from "../lib/sprint-workers.ts";
import { clean, createSprintPanel, duration } from "../lib/sprint-panel.ts";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createBatchLifecycle, registerBatchCancellation } from "../lib/worker-lifecycle.ts";

export default function (pi: ExtensionAPI) {
  if (process.env.GABPRD_SPRINT_WORKER === "1") return;
  const panel = createSprintPanel(pi, truncateToWidth);
  const lifecycle = createBatchLifecycle();
  registerBatchCancellation(pi, lifecycle);
  pi.registerCommand("sprint-pause", {
    description: "Stop the active worker batch; preserve partial worktrees and logs",
    handler: async (_args, ctx) => {
      const wasRunning = lifecycle.isRunning();
      pi.events.emit("gabprd:sprint:pause", { message: "Paused by user; inspect partial work before continuing" });
      if (ctx.hasUI) ctx.ui.notify(wasRunning ? "Stopping workers; partial work will be preserved." : "No worker batch is running.", "info");
      await lifecycle.stopAndWait();
    },
  });
  pi.registerTool({
    name: "sprint_workers", label: "Sprint workers", executionMode: "sequential", exposure: "model-only",
    description: "Run one or two independent, approved, ready gabPrd builder assignments concurrently in detached worktrees from clean committed HEAD. Explicit skill-model routes are verified; scopes must be disjoint. Waits for all workers to stop/return. Parent owns inspection, integration, issue updates, commits, shared runtime and quality gates. Cancellation preserves partial work. Subprocess/worktree isolation is not an OS sandbox; no automatic integration or retry.",
    parameters: Type.Object({
      tasks: Type.Array(Type.Object({
        id: Type.String(), skill: Type.String(), task: Type.String(), paths: Type.Array(Type.String(), { minItems: 1, maxItems: 64 }),
        dependsOnCommits: Type.Optional(Type.Array(Type.String())),
      }), { minItems: 1, maxItems: 2 }),
      timeoutMinutes: Type.Optional(Type.Integer({ minimum: 1, maximum: 30, default: 10 })),
    }),
    renderCall(args, theme) {
      return new Text(theme.fg("accent", theme.bold(`SPRINT WORKERS  ${(args.tasks ?? []).map(task => clean(task.id)).join(" + ")}`)), 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme) {
      const results = (result.details as { results?: WorkerResult[] } | undefined)?.results;
      if (!results) return new Text(theme.fg(isPartial ? "muted" : "warning", clean(result.content.filter(c => c.type === "text").map(c => c.text).join(" "))), 0, 0);
      const lines = results.map(r => {
        const heading = theme.fg(r.status === "returned" ? "accent" : "warning", `${clean(r.id)}  ${r.status === "returned" ? "Returned for inspection" : r.status}  ${duration(r.elapsedSeconds)}`);
        return expanded ? `${heading}\n${r.summary.split("\n").map(clean).join("\n")}\nWorktree: ${clean(r.worktree)}\nLog: ${clean(r.log)}` : heading;
      });
      if (!expanded) lines.push(theme.fg("dim", "Expand for reports and preserved worktree paths; return is not gate approval."));
      return new Text(lines.join("\n"), 0, 0);
    },
    async execute(_id, params, signal, onUpdate, ctx) {
      const batch = lifecycle.begin();
      const controller = batch.controller;
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      let panelRun: number | undefined;
      try {
        validateAssignments(params.tasks);
        const config = JSON.parse(await readFile(resolve(ctx.cwd, ".pi", "skill-models.json"), "utf8"));
        const available = await ctx.modelRegistry.getAvailable();
        for (const task of params.tasks) {
          const route = validateRoute(config.assignments?.[task.skill], task.skill);
          if (!available.some(model => model.provider === route.provider && model.id === route.model)) {
            throw new Error(`Assigned model is unavailable for ${task.skill}; configure authentication/model availability. No fallback applied.`);
          }
        }
        panelRun = panel.begin(ctx, params.tasks);
        pi.events.emit("gabprd:sprint:workers", { running: true });
        const results = await dispatch(ctx.cwd, params.tasks, controller.signal, params.timeoutMinutes ?? 10, (message, update) => {
          panel.update(update, panelRun);
          onUpdate?.({ content: [{ type: "text", text: clean(message) }], details: {} });
        });
        panel.finish(results, panelRun);
        const usage = emptyUsage(); results.forEach(result => addUsage(usage, result.usage));
        const text = JSON.stringify(results, null, 2);
        return {
          content: [{ type: "text", text: text.length <= 48000 ? text : `${text.slice(0, 48000)}\n[Truncated; full per-worker reports are retained beside the diagnostic logs.]` }],
          details: { results }, usage, isError: results.some(result => result.status !== "returned"),
        };
      } catch (error) {
        if (panelRun !== undefined) panel.fail(error, panelRun);
        throw error;
      } finally {
        signal?.removeEventListener("abort", abort);
        try { pi.events.emit("gabprd:sprint:workers", { running: false }); }
        finally { batch.finish(); }
      }
    },
  });
}
