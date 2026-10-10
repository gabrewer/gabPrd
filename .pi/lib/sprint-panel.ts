import { resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Assignment, WorkerResult, WorkerUpdate } from "./sprint-workers.ts";

type Phase = "Plan" | "Build" | "Integrate" | "Destroyer" | "Review" | "Test";
export interface PanelWorker {
  id: string; skill: string; model: string; status: string; activity: string;
  started: number; ended?: number; result?: WorkerResult;
}
export interface PanelState {
  sprint?: string;
  phase: Phase;
  status: string;
  workers: PanelWorker[];
  note: string;
}
export const freshPanel = (): PanelState => ({ phase: "Plan", status: "idle", workers: [], note: "" });
const phases: Phase[] = ["Plan", "Build", "Integrate", "Destroyer", "Review", "Test"];
const labels: Record<string, string> = { queued: "WAITING", preparing: "PREPARING", running: "RUNNING", returned: "RETURNED", failed: "FAILED", cancelled: "CANCELLED", cancelling: "STOPPING" };
const reset = "\x1b[0m";

// Worker reports and issue/task names are untrusted terminal content.
export function clean(value: string): string {
  return value.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim();
}
export function duration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function segments(items: { text: string; color: number }[], powerline: boolean): string {
  if (!powerline) return items.map(i => clean(i.text)).join(" | ");
  return items.map((item, index) => {
    const next = items[index + 1];
    return `\x1b[48;5;${item.color}m\x1b[97m ${clean(item.text)} ${reset}` +
      `\x1b[38;5;${item.color}m${next ? `\x1b[48;5;${next.color}m` : ""}\ue0b0${reset}`;
  }).join("");
}
function color(status: string): number {
  return status === "failed" ? 124 : ["paused", "cancelled", "cancelling", "awaiting-uat", "returned"].includes(status) ? 130 : status === "running" ? 23 : 238;
}
export function renderPanel(state: PanelState, now: number, powerline = true, expanded = false): string[] {
  if (state.status === "idle" && !state.workers.length) return [];
  const lines = [segments([
    { text: state.sprint ? `SPRINT #${state.sprint}` : "SPRINT WORKERS", color: 25 },
    { text: state.phase.toUpperCase(), color: 24 },
    { text: state.status.replaceAll("-", " ").toUpperCase(), color: color(state.status) },
  ], powerline)];
  lines.push(phases.map(p => p === state.phase ? `[${p}]` : p).join(powerline ? " › " : " > "));
  for (const worker of state.workers) {
    const elapsed = worker.result?.elapsedSeconds ?? ((worker.ended ?? now) - worker.started) / 1000;
    lines.push(segments([
      { text: worker.id, color: 238 },
      { text: labels[worker.status] ?? worker.status, color: color(worker.status) },
      { text: duration(elapsed), color: 236 },
    ], powerline) + ` ${clean(worker.skill)} / ${clean(worker.model)}`);
    lines.push(`  ${clean(worker.activity)}`);
    if (expanded && worker.result) {
      lines.push(`  Report: ${clean(worker.result.summary).slice(0, 500)}`);
      lines.push(`  Worktree: ${clean(worker.result.worktree)}`);
      lines.push(`  Log: ${clean(worker.result.log)}`);
    }
  }
  if (state.note) lines.push(`  ${clean(state.note)}`);
  lines.push("/sprint-view details | plain | hide");
  return lines;
}

export function createSprintPanel(pi: ExtensionAPI, truncate: (text: string, width: number) => string) {
  let state = freshPanel();
  let ctx: ExtensionContext | undefined;
  let requestRender: (() => void) | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let powerline = true, expanded = false, visible = true;
  let dismissed = false;
  let generation = 0;
  const stopTimer = () => { if (timer) clearInterval(timer); timer = undefined; };
  const paint = () => {
    if (!ctx?.hasUI) return;
    const lines = renderPanel(state, Date.now(), powerline, expanded);
    if (!visible || dismissed || !lines.length) { ctx.ui.setWidget("gabprd-sprint", undefined); requestRender = undefined; return; }
    if (ctx.mode === "tui") {
      if (!requestRender) ctx.ui.setWidget("gabprd-sprint", (tui) => {
        requestRender = () => tui.requestRender();
        return { render: width => renderPanel(state, Date.now(), powerline, expanded).map(line => truncate(line, width)), invalidate() {} };
      });
      requestRender?.();
    } else {
      // RPC receives plain text snapshots; do not send terminal escape sequences.
      ctx.ui.setWidget("gabprd-sprint", renderPanel(state, Date.now(), false, expanded));
    }
  };
  const resetPanel = () => {
    generation++;
    stopTimer(); ctx?.ui.setWidget("gabprd-sprint", undefined);
    state = freshPanel(); dismissed = false; requestRender = undefined; ctx = undefined;
  };
  pi.on("session_start", (_event, context) => { resetPanel(); ctx = context; });
  pi.on("session_before_switch", resetPanel);
  pi.on("session_before_fork", resetPanel);
  pi.on("session_shutdown", resetPanel);
  pi.events.on("gabprd:sprint:state", data => {
    const event = data as { sprint?: string; status: string };
    if (event.sprint !== state.sprint) state = freshPanel();
    if (event.status === "running") dismissed = false;
    if (["awaiting-uat", "blocked"].includes(event.status)) dismissed = true;
    state.sprint = event.sprint; state.status = event.status; state.note = ""; paint();
  });
  pi.events.on("gabprd:sprint:pause", data => {
    const event = data as { message?: string };
    if (state.status === "idle") return;
    state.status = "paused"; state.note = event.message ?? "Paused by parent";
    for (const worker of state.workers) if (!worker.result) { worker.status = "cancelling"; worker.activity = "Stopping; partial work will be preserved"; }
    paint();
  });
  pi.on("tool_result", (event, context) => {
    if (dismissed || state.status !== "running" || event.isError || event.toolName !== "read" || typeof event.input.path !== "string") return;
    const path = resolve(context.cwd, event.input.path.replace(/^@/, "")).toLowerCase();
    const roles: Record<string, Phase> = { destroyer: "Destroyer", "review-agent": "Review", tester: "Test", "git-committer": "Integrate" };
    for (const [role, phase] of Object.entries(roles)) {
      if (path === resolve(context.cwd, ".agents", "skills", role, "SKILL.md").toLowerCase()) {
        state.phase = phase; state.note = `${role} skill loaded; this is activity, not a gate verdict.`; paint();
      }
    }
  });
  pi.registerCommand("sprint-view", {
    description: "Sprint display: details, plain, powerline, hide, show",
    handler: async (args, context) => {
      ctx = context;
      switch (args.trim()) {
        case "details": expanded = !expanded; break;
        case "plain": powerline = false; break;
        case "powerline": powerline = true; break;
        case "hide": visible = false; break;
        case "": case "show": visible = true; dismissed = false; break;
        default: context.ui.notify("Usage: /sprint-view [details|plain|powerline|hide|show]", "info"); return;
      }
      paint();
    },
  });
  return {
    begin(context: ExtensionContext, tasks: Assignment[]) {
      generation++;
      dismissed = false;
      ctx = context; state.phase = "Build"; state.status = "running"; state.note = "";
      state.workers = tasks.map(task => ({ id: task.id, skill: task.skill, model: "selecting model", status: "queued", activity: task.task, started: Date.now() }));
      paint(); stopTimer();
      if (context.hasUI && context.mode === "tui") { timer = setInterval(paint, 1000); timer.unref(); }
      return generation;
    },
    update(update?: WorkerUpdate, run = generation) {
      if (!update || run !== generation) return;
      const worker = state.workers.find(w => w.id === update.id);
      if (!worker) return;
      if (worker.status === "cancelling" && !update.result) return;
      worker.status = update.status;
      if (update.model) worker.model = update.model;
      if (update.result) { worker.result = update.result; worker.activity = update.result.status === "returned" ? "Report available; parent owns inspection and acceptance" : update.result.summary; }
      else if (update.activity) worker.activity = update.activity;
      paint();
    },
    finish(results: WorkerResult[], run = generation) {
      if (run !== generation) return;
      for (const result of results) this.update({ id: result.id, status: result.status, result }, run);
      if (state.status !== "paused") {
        state.phase = "Integrate";
        state.status = results.some(r => r.status !== "returned") ? "paused" : "running";
      }
      stopTimer(); paint();
    },
    fail(error: unknown, run = generation) {
      if (run !== generation) return;
      state.status = "failed"; state.note = error instanceof Error ? error.message : String(error);
      for (const worker of state.workers) if (!worker.result) { worker.status = "failed"; worker.ended = Date.now(); worker.activity = "Batch could not complete; inspect preserved work"; }
      stopTimer(); paint();
    },
  };
}
