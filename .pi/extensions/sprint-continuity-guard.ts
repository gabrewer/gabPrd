import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type Owner = { session: string; generation: number; token: string };
const ownerType = "gabprd:sprint:owner";
const envelopePrefix = "gabprd:sprint:input:";
const normalize = (path: string) => resolve(path).replace(/\\/g, "/").toLowerCase();
function sprintNumber(args: string): string | undefined {
  if (/[\x00-\x1f\x7f]/.test(args)) return;
  const value = args.trim().match(/^#?([1-9]\d*)$/)?.[1];
  return value && Number.isSafeInteger(Number(value)) ? value : undefined;
}

export default function (pi: ExtensionAPI) {
  if (process.env.GABPRD_SPRINT_WORKER === "1") return;
  let activeSprint: string | undefined;
  let continuationQueued: string | undefined;
  let continuationPaused = false;
  let automaticRunHadToolExecution = false;
  let consecutiveNoToolAutomaticRuns = 0;
  let workersRunning = false;
  let epoch = 0, continuations = 0, started = 0;
  let accepted: Owner | undefined, owned: Owner | undefined;
  let lastContext: ExtensionContext | undefined;
  let detachAbort = () => {};
  let emittingPause = false;
  const boundaries = new WeakSet<object>();
  const status = (ctx: ExtensionContext) => ctx.ui.setStatus("sprint-continuity",
    activeSprint ? `Sprint #${activeSprint}${continuationPaused ? " paused" : ""}` : undefined);
  function invalidate() {
    epoch++;
    continuationQueued = undefined;
    accepted = owned = undefined;
    detachAbort();
    detachAbort = () => {};
  }
  function pauseForHumanIntervention(ctx?: ExtensionContext, emit = true) {
    invalidate();
    continuationPaused = true;
    if (ctx) status(ctx);
    if (emit) {
      emittingPause = true;
      try { pi.events.emit("gabprd:sprint:pause", { sprint: activeSprint }); }
      finally { emittingPause = false; }
    }
  }
  const matches = (a: Owner | undefined, b: Owner | undefined) => !!a && !!b &&
    a.session === b.session && a.generation === b.generation && a.token === b.token;
  function branchOwns(ctx: ExtensionContext, owner: Owner) {
    return owner.session === ctx.sessionManager.getSessionId() && owner.generation === epoch &&
      ctx.sessionManager.getBranch().some(entry => entry.type === "custom" &&
        entry.customType === ownerType && matches(entry.data as Owner, owner));
  }
  function queueContinuation(ctx: ExtensionContext) {
    const owner: Owner = { session: ctx.sessionManager.getSessionId(), generation: epoch, token: randomUUID() };
    pi.appendEntry(ownerType, owner);
    continuationQueued = `${envelopePrefix}${owner.token}`;
    accepted = undefined;
    pi.sendUserMessage(continuationQueued, { expandPromptTemplates: true });
  }
  pi.events.on("gabprd:sprint:workers", event => {
    workersRunning = (event as { running: boolean }).running;
  });
  pi.events.on("gabprd:sprint:pause", () => {
    if (!emittingPause) pauseForHumanIntervention(lastContext, false);
  });
  // Capture cleanup before cancellation: pause only aborts, it does not join workers.
  async function stop(ctx: ExtensionContext, forget: boolean) {
    const abortOwned = !!owned;
    let release = () => {};
    const joined = workersRunning ? new Promise<boolean>(done => {
      const off = pi.events.on("gabprd:sprint:workers", event => {
        if (!(event as { running: boolean }).running) done(true);
      });
      const timer = setTimeout(() => done(false), 30000);
      release = () => { clearTimeout(timer); off(); };
    }) : Promise.resolve(true);
    pauseForHumanIntervention(ctx);
    if (forget) { activeSprint = undefined; status(ctx); }
    if (abortOwned) ctx.abort();
    const complete = await joined;
    release();
    if (!complete) ctx.ui.notify("Sprint workers are still stopping.", "info");
  }
  const reset = async (_event: unknown, ctx: ExtensionContext) => { await stop(ctx, true); };
  pi.on("session_start", (_event, ctx) => {
    invalidate(); activeSprint = undefined; continuationPaused = false; lastContext = ctx;
    ctx.ui.setStatus("gabprd-sprint", undefined); status(ctx);
  });
  pi.on("session_before_switch", reset);
  pi.on("session_before_fork", reset);
  pi.on("session_before_tree", reset);
  pi.on("session_tree", reset);
  pi.on("session_shutdown", reset);
  async function start(args: string, ctx: ExtensionContext, resume: boolean) {
    lastContext = ctx;
    const sprint = resume && args === "" ? activeSprint : sprintNumber(args);
    if (!sprint) { ctx.ui.notify("Use /sprint N or /sprint-resume [N].", "info"); return; }
    if (workersRunning || !ctx.isIdle() || ctx.hasPendingMessages()) { ctx.ui.notify("Wait for the current work to stop.", "info"); return; }
    const commands = pi.getCommands().filter(command => command.name === "team-lead");
    if (commands.length !== 1 || commands[0].source !== "prompt" ||
      !commands[0].sourceInfo?.path || normalize(commands[0].sourceInfo.path) !==
      normalize(resolve(ctx.cwd, ".pi/prompts/team-lead.md"))) {
      ctx.ui.notify("The project team-lead prompt is unavailable or ambiguous.", "info"); return;
    }
    invalidate(); activeSprint = sprint; continuationPaused = false;
    consecutiveNoToolAutomaticRuns = continuations = 0; started = Date.now();
    status(ctx);
    try { queueContinuation(ctx); }
    catch { pauseForHumanIntervention(ctx); ctx.ui.notify("Sprint could not start.", "info"); }
  }
  pi.registerCommand("sprint", { description: "Start an explicitly approved sprint", handler: (args, ctx) => start(args, ctx, false) });
  pi.registerCommand("sprint-resume", { description: "Resume a paused sprint", handler: (args, ctx) => start(args, ctx, true) });
  pi.registerCommand("sprint-stop", {
    description: "Stop sprint continuity and wait for worker cleanup",
    handler: async (args, ctx) => {
      if (args !== "") { ctx.ui.notify("Use /sprint-stop.", "info"); return; }
      await stop(ctx, true);
    },
  });
  pi.registerTool({
    name: "sprint_yield", label: "Pause sprint", exposure: "model-only",
    description: "Pause continuity for human input or finished work; does not certify completion or acceptance.",
    parameters: Type.Object({ reason: Type.Union([Type.Literal("human-input"), Type.Literal("finished")]) }),
    async execute(_id, _args, _signal, _update, ctx) {
      pauseForHumanIntervention(ctx);
      return { content: [{ type: "text", text: "Sprint paused. No approval or acceptance granted." }], details: undefined };
    },
  });
  pi.on("input", (event, ctx) => {
    lastContext = ctx;
    if (event.source === "extension" && event.text.startsWith(envelopePrefix)) {
      if (event.text !== continuationQueued || continuationPaused || !activeSprint || workersRunning) return { action: "handled" };
      const owner: Owner = { session: ctx.sessionManager.getSessionId(), generation: epoch,
        token: event.text.slice(envelopePrefix.length) };
      continuationQueued = undefined;
      if (!branchOwns(ctx, owner)) return { action: "handled" };
      accepted = owner;
      return { action: "transform", text: `/team-lead ${activeSprint}` };
    }
    if (activeSprint) pauseForHumanIntervention(ctx);
    else invalidate();
    return { action: "continue" };
  });
  const reminder = () => `Continue sprint #${activeSprint} through the existing team-lead approval and evidence gates. Use sprint_workers for up to two independent approved ready builder tasks when eligible. Inspect returned results and integrate only through existing gates; never automatically integrate. Tool activity is not quality-gate evidence. If human input is needed or work is finished, use sprint_yield; this grants no acceptance.`;
  pi.on("before_agent_start", (event, ctx) => {
    if (event.messageType !== "user" || !accepted || continuationPaused || !branchOwns(ctx, accepted)) return;
    owned = accepted; accepted = undefined;
    automaticRunHadToolExecution = false;
    detachAbort();
    const abort = () => pauseForHumanIntervention(ctx);
    ctx.signal?.addEventListener("abort", abort, { once: true });
    detachAbort = () => ctx.signal?.removeEventListener("abort", abort);
    if (ctx.signal?.aborted) { abort(); return; }
    return { message: { customType: "gabprd:sprint:reminder", content: reminder(), display: false } };
  });
  pi.on("tool_execution_start", (event) => {
    if (event.toolName === "sprint_workers") workersRunning = true;
    if (owned) automaticRunHadToolExecution = true;
  });
  pi.on("tool_execution_end", (event, ctx) => {
    if (owned) automaticRunHadToolExecution = true;
    if (owned && event.isError) pauseForHumanIntervention(ctx);
  });
  pi.on("tool_result", (event, ctx) => {
    if (owned && event.isError) pauseForHumanIntervention(ctx);
  });
  pi.on("message_end", (event, ctx) => {
    if (owned && event.message.role === "assistant" && ["error", "aborted", "length"].includes(event.message.stopReason)) pauseForHumanIntervention(ctx);
  });
  pi.on("ui_prompt_start", (_event, ctx) => { if (activeSprint && !continuationPaused) pauseForHumanIntervention(ctx); });
  pi.on("model_select", (_event, ctx) => { if (activeSprint && !continuationPaused) pauseForHumanIntervention(ctx); });
  pi.on("thinking_level_select", (_event, ctx) => { if (activeSprint && !continuationPaused) pauseForHumanIntervention(ctx); });
  pi.on("agent_before_settle", (event, ctx) => {
    if (boundaries.has(event)) return;
    boundaries.add(event);
    if (!owned || !activeSprint || continuationPaused || workersRunning || !branchOwns(ctx, owned)) return;
    if (event.outcome !== "completed") { pauseForHumanIntervention(ctx); return; }
    const preview = event.context;
    if (!preview || typeof preview.canContinue !== "boolean" || !Array.isArray(preview.contextEntries) || !Array.isArray(preview.contextMessages) ||
      !Array.isArray(preview.llmMessages) || !Array.isArray(preview.pendingMessages) ||
      preview.pendingMessages.length || ctx.hasPendingMessages()) { pauseForHumanIntervention(ctx); return; }
    consecutiveNoToolAutomaticRuns = automaticRunHadToolExecution ? 0 : consecutiveNoToolAutomaticRuns + 1;
    if (consecutiveNoToolAutomaticRuns >= 2 || continuations >= 12 || Date.now() - started >= 30 * 60000) {
      pauseForHumanIntervention(ctx); return;
    }
    continuations++;
    automaticRunHadToolExecution = false;
    owned = { ...owned, token: randomUUID() };
    return { continue: true, entries: [
      { type: "custom" as const, customType: ownerType, data: owned },
      { type: "custom_message" as const, customType: "gabprd:sprint:continuation", content: reminder(), display: false },
    ] };
  });
}
