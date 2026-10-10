import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { clean, createSprintPanel, freshPanel, renderPanel } from "../lib/sprint-panel.ts";

const result = { id: "api", status: "returned", worktree: "X:/worker", log: "X:/worker.jsonl", base: "abc", summary: "Checks passed", elapsedSeconds: 65 };
const state = { ...freshPanel(), sprint: "3593", phase: "Build", status: "running", workers: [{ id: "api", skill: "git-workspace-builder", model: "gpt-6.1-sol", status: "running", started: 0, activity: "Running tests" }] };

test("Powerline uses segmented colors with readable role, clock and activity", () => {
  const output = renderPanel(state, 65000).join("\n");
  assert.match(output, /\ue0b0/);
  assert.match(output, /\x1b\[48;5;/);
  assert.match(output, /1:05/);
  assert.match(output, /git-workspace-builder \/ gpt-6.1-sol/);
  assert.match(output, /Running tests/);
  assert.match(output, /\[Build\]/);
});

test("ASCII fallback contains neither ANSI nor Powerline glyphs", () => {
  const output = renderPanel(state, 1000, false).join("\n");
  assert.doesNotMatch(output, /[^\x20-\x7e\n]/);
  assert.match(output, /SPRINT #3593 \| BUILD \| RUNNING/);
});

test("completed worker clock freezes and details do not claim gate success", () => {
  const done = { ...state, workers: [{ ...state.workers[0], status: "returned", result }] };
  assert.match(renderPanel(done, 999000, false).join("\n"), /1:05/);
  assert.doesNotMatch(renderPanel(done, 999000, false).join("\n"), /Checks passed/);
  assert.match(renderPanel(done, 999000, false, true).join("\n"), /Checks passed/);
  assert.match(renderPanel(done, 999000, false).join("\n"), /RETURNED/);
});

test("worker terminal escape sequences cannot execute in display", () => {
  const value = clean("task\x1b[2J\x1b]0;malicious title\x07\nnext\x00");
  assert.equal(value, "task next");
});

function harness(mode = "tui") {
  const events = new EventEmitter(), handlers = new Map(), commands = new Map();
  let widget;
  const ctx = { hasUI: true, mode, cwd: "X:/repo", ui: {
    setWidget(_key, content) { widget = typeof content === "function" ? content({ requestRender() {} }, {}) : content; },
    notify() {},
  } };
  const pi = { events, on(name, fn) { handlers.set(name, fn); }, registerCommand(name, command) { commands.set(name, command); } };
  const panel = createSprintPanel(pi, (line, width) => clean(line).slice(0, width));
  handlers.get("session_start")({}, ctx);
  return { panel, ctx, events, handlers, commands, widget: () => widget };
}

test("live widget responds to pause, expands reports, clips width, and clears on shutdown", async () => {
  const h = harness();
  h.events.emit("gabprd:sprint:state", { sprint: "3593", status: "running" });
  h.panel.begin(h.ctx, [{ id: "api", skill: "git-workspace-builder", task: "Implement endpoint", paths: ["Services"] }]);
  h.panel.update({ id: "api", status: "running", model: "gpt-6.1-sol", activity: "Running tests" });
  assert.ok(h.widget().render(30).every(line => line.length <= 30));
  h.events.emit("gabprd:sprint:pause", { message: "User changed direction" });
  assert.match(h.widget().render(200).join("\n"), /STOPPING/);
  h.panel.finish([{ ...result, status: "cancelled" }]);
  assert.match(h.widget().render(200).join("\n"), /PAUSED/);
  await h.commands.get("sprint-view").handler("details", h.ctx);
  assert.match(h.widget().render(200).join("\n"), /Worktree: X:\/worker/);
  h.handlers.get("session_shutdown")();
  assert.equal(h.widget(), undefined);
});

test("RPC uses plain snapshots and a new session forgets old workers", () => {
  const h = harness("rpc");
  h.panel.begin(h.ctx, [{ id: "api", skill: "git-workspace-builder", task: "Task", paths: ["Services"] }]);
  assert.ok(Array.isArray(h.widget()));
  assert.doesNotMatch(h.widget().join("\n"), /\x1b|\ue0b0/);
  h.handlers.get("session_start")({}, h.ctx);
  assert.equal(h.widget(), undefined);
});

test("failed dispatch does not leave workers shown as running", () => {
  const h = harness("rpc");
  h.panel.begin(h.ctx, [{ id: "api", skill: "git-workspace-builder", task: "Task", paths: ["Services"] }]);
  h.panel.fail(new Error("Commit parent changes first"));
  assert.match(h.widget().join("\n"), /FAILED/);
  assert.doesNotMatch(h.widget().join("\n"), /RUNNING/);
});

test("late results cannot resurrect the previous session's panel", () => {
  const h = harness("rpc");
  const run = h.panel.begin(h.ctx, [{ id: "api", skill: "git-workspace-builder", task: "Task", paths: ["Services"] }]);
  h.handlers.get("session_start")({}, h.ctx);
  h.panel.finish([result], run);
  h.panel.fail(new Error("old failure"), run);
  assert.equal(h.widget(), undefined);
});

for (const mode of ["tui", "rpc"]) {
  const lines = h => mode === "tui" ? h.widget().render(240).join("\n") : h.widget().join("\n");
  const begin = h => h.panel.begin(h.ctx, [{ id: "api", skill: "git-workspace-builder", task: "Task", paths: ["Services"] }]);

  test(`${mode}: agent settlement during a sprint keeps the live panel visible`, () => {
    const h = harness(mode);
    begin(h);
    h.panel.finish([result]);
    assert.ok(h.widget(), "keep integration visible until the parent settles");
    assert.equal(h.handlers.has("agent_settled"), false, "turn settlement is not sprint completion");
    assert.ok(h.widget(), "continuity may queue another parent run after settlement");
    h.handlers.get("tool_result")({ toolName: "read", input: { path: ".agents/skills/review-agent/SKILL.md" } }, h.ctx);
    assert.match(lines(h), /\[Review\]/);
    h.handlers.get("session_shutdown")();
  });

  test(`${mode}: terminal sprint state hides panel and follow-up activity leaves it hidden`, async () => {
    const h = harness(mode);
    begin(h);
    h.panel.finish([result]);
    h.events.emit("gabprd:sprint:state", { sprint: "3686", status: "awaiting-uat" });
    assert.equal(h.widget(), undefined);
    h.handlers.get("tool_result")({ toolName: "read", input: { path: ".agents/skills/review-agent/SKILL.md" } }, h.ctx);
    assert.equal(h.widget(), undefined);
    await h.commands.get("sprint-view").handler("show", h.ctx);
    assert.match(lines(h), /AWAITING UAT/);
    await h.commands.get("sprint-view").handler("hide", h.ctx);
    h.events.emit("gabprd:sprint:state", { sprint: "3686", status: "running" });
    assert.equal(h.widget(), undefined, "manual hiding still has precedence over a sprint restart");
    await h.commands.get("sprint-view").handler("show", h.ctx);
    assert.match(lines(h), /RUNNING/);
    h.handlers.get("session_shutdown")();
  });

  test(`${mode}: a new batch or explicit resume reopens the terminally dismissed panel`, () => {
    const h = harness(mode);
    begin(h);
    h.panel.finish([result]);
    h.events.emit("gabprd:sprint:state", { status: "awaiting-uat" });
    assert.equal(h.widget(), undefined);
    h.events.emit("gabprd:sprint:state", { status: "running" });
    assert.match(lines(h), /RUNNING/);
    assert.ok(h.widget(), "turn settlement does not end an active sprint");
    begin(h);
    assert.match(lines(h), /\[Build\]/);
    h.handlers.get("session_shutdown")();
  });

  test(`${mode}: dispatch failure remains visible for inspection`, async () => {
    const h = harness(mode);
    begin(h);
    h.panel.fail(new Error("Dispatch failed"));
    assert.match(lines(h), /FAILED/);
    await h.commands.get("sprint-view").handler("show", h.ctx);
    assert.match(lines(h), /FAILED/);
    assert.match(lines(h), /Dispatch failed/);
    h.handlers.get("session_shutdown")();
  });

  test(`${mode}: a session change clears dismissed reports and allows a fresh panel`, async () => {
    const h = harness(mode);
    begin(h);
    h.panel.finish([result]);
    h.events.emit("gabprd:sprint:state", { status: "awaiting-uat" });
    h.handlers.get("session_start")({}, h.ctx);
    await h.commands.get("sprint-view").handler("show", h.ctx);
    assert.equal(h.widget(), undefined);
    begin(h);
    assert.ok(h.widget());
    assert.doesNotMatch(lines(h), /Report:|Worktree:/);
    h.handlers.get("session_shutdown")();
  });

  test(`${mode}: manual hide remains respected across new batches`, async () => {
    const h = harness(mode);
    begin(h);
    await h.commands.get("sprint-view").handler("hide", h.ctx);
    h.panel.finish([result]);
    begin(h);
    assert.equal(h.widget(), undefined);
    await h.commands.get("sprint-view").handler("show", h.ctx);
    assert.ok(h.widget());
    h.handlers.get("session_shutdown")();
  });
}

test("only successful reads of the actual role skill change the observed phase", () => {
  const h = harness("rpc");
  h.events.emit("gabprd:sprint:state", { sprint: "3593", status: "running" });
  const read = (path, isError = false) => h.handlers.get("tool_result")({ toolName: "read", input: { path }, isError }, h.ctx);
  read("Documentation/review-agent/SKILL.md");
  assert.match(h.widget().join("\n"), /\[Plan\]/);
  read(".agents/skills/review-agent/SKILL.md", true);
  assert.match(h.widget().join("\n"), /\[Plan\]/);
  read(".agents/skills/review-agent/SKILL.md");
  assert.match(h.widget().join("\n"), /\[Review\]/);
  assert.match(h.widget().join("\n"), /not a gate verdict/);
});
