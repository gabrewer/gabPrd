import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface BatchHandle {
  controller: AbortController;
  done: Promise<void>;
  finish(): void;
}
// Completion covers preparation, process termination, inspection and diagnostic persistence.
// It resolves on failure too: tool execution owns its error; shutdown owns waiting for cleanup.
export function createBatchLifecycle() {
  let active: BatchHandle | undefined;
  return {
    isRunning: () => active !== undefined,
    begin(): BatchHandle {
      if (active) throw new Error("A sprint worker batch is already running.");
      let resolveDone!: () => void;
      const done = new Promise<void>(resolve => { resolveDone = resolve; });
      let finished = false;
      const handle: BatchHandle = {
        controller: new AbortController(), done,
        finish() {
          if (finished) return;
          finished = true;
          if (active === handle) active = undefined;
          resolveDone();
        },
      };
      active = handle;
      return handle;
    },
    abort() { active?.controller.abort(); },
    async stopAndWait() {
      const captured = active;
      if (!captured) return;
      captured.controller.abort();
      await captured.done;
    },
  };
}
export function registerBatchCancellation(pi: Pick<ExtensionAPI, "events" | "on">, lifecycle: ReturnType<typeof createBatchLifecycle>) {
  pi.events.on("gabprd:sprint:pause", () => lifecycle.abort());
  pi.on("session_shutdown", () => lifecycle.stopAndWait());
  pi.on("session_before_switch", () => lifecycle.stopAndWait());
  pi.on("session_before_fork", () => lifecycle.stopAndWait());
}
