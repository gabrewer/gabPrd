import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, lstat } from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";

const exec = promisify(execFile);
export const BUILDER_SKILLS = ["frontend-builder", "backend-builder", "conversation-builder", "pi-integration-builder",
  "git-workspace-builder", "persistence-recovery-builder", "markdown-editor-builder", "windows-release-engineer"] as const;
export interface Assignment { id: string; skill: string; task: string; paths: string[]; dependsOnCommits?: string[]; }
export interface ModelRoute { provider: string; model: string; thinkingLevel: string; }
export interface WorkerUsage {
  input: number; output: number; cacheRead: number; cacheWrite: number; totalTokens: number;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
}
export interface WorkerResult {
  id: string; status: "returned" | "failed" | "cancelled"; worktree: string; base: string; log: string;
  summary: string; elapsedSeconds: number; changedPaths?: string[]; outsideScope?: string[]; usage?: WorkerUsage;
}
export interface WorkerUpdate {
  id: string; status: "preparing" | "running" | WorkerResult["status"]; model?: string; activity?: string; result?: WorkerResult;
}
export const emptyUsage = (): WorkerUsage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } });
export function addUsage(total: WorkerUsage, value?: Partial<WorkerUsage>) {
  if (!value) return;
  for (const key of ["input", "output", "cacheRead", "cacheWrite", "totalTokens"] as const) {
    if (typeof value[key] === "number" && Number.isFinite(value[key]) && value[key]! >= 0) total[key] += value[key]!;
  }
  for (const key of ["input", "output", "cacheRead", "cacheWrite", "total"] as const) {
    if (typeof value.cost?.[key] === "number" && Number.isFinite(value.cost[key]) && value.cost[key] >= 0) total.cost[key] += value.cost[key];
  }
}
export async function git(cwd: string, ...args: string[]): Promise<string> {
  const output = (await exec("git", ["-C", cwd, ...args], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 })).stdout;
  // Preserve NUL-delimited filenames, including leading/trailing whitespace.
  return args.includes("-z") ? output : output.trim();
}
const gitText = async (cwd: string, ...args: string[]) => (await git(cwd, ...args)).trim();
const protectedPaths = [".git", ".pi", ".agents", "instructions", "AGENTS.md", "AGENTS.override.md", "CLAUDE.md", ".gitignore"];
export function normalizedScope(path: string): string {
  const value = path.replaceAll("\\", "/").replace(/\/$/, "");
  if (!value || isAbsolute(value) || value.includes(":") || /[*?\[\]\x00-\x1f\x7f]/.test(value) ||
    value.split("/").some(p => !p || p === "." || p === ".." || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) {
    throw new Error(`Use a literal repository-relative file or directory: ${path}`);
  }
  if (protectedPaths.some(p => owns(value, p) || owns(p, value))) throw new Error(`Worker scope targets protected policy/runtime paths: ${path}`);
  return value;
}
export function owns(path: string, scope: string): boolean {
  path = path.replaceAll("\\", "/").toLowerCase(); scope = scope.toLowerCase();
  return path === scope || path.startsWith(`${scope}/`);
}
export function validateAssignments(tasks: Assignment[]): void {
  if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > 2) throw new Error("Dispatch one or two ready tasks per batch.");
  const ids = new Set<string>();
  for (const task of tasks) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/.test(task.id) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(task.id) || ids.has(task.id.toLowerCase())) throw new Error("Task IDs must be unique simple non-reserved names.");
    ids.add(task.id.toLowerCase());
    if (!(BUILDER_SKILLS as readonly string[]).includes(task.skill)) throw new Error("Dispatch project builder skills only; the parent owns planning and quality gates.");
    if (typeof task.task !== "string" || !task.task.trim() || task.task.length > 32000) throw new Error("Specify a concrete assignment of at most 32000 characters.");
    if (!Array.isArray(task.paths) || !task.paths.length || task.paths.length > 64) throw new Error("Each task needs 1–64 owned files or directories.");
    const paths = task.paths.map(normalizedScope);
    if (paths.some((a, i) => paths.slice(i + 1).some(b => owns(a, b) || owns(b, a)))) throw new Error("Owned paths overlap within an assignment.");
    if (task.dependsOnCommits?.some(c => !/^[a-f0-9]{7,40}$/i.test(c))) throw new Error("Dependencies must be integrated commit hashes.");
  }
  if (tasks.length === 2 && tasks[0].paths.some(a => tasks[1].paths.some(b => owns(normalizedScope(a), normalizedScope(b)) || owns(normalizedScope(b), normalizedScope(a))))) {
    throw new Error("Parallel assignments overlap. Split ownership or run sequentially.");
  }
}
export function validateRoute(value: unknown, skill: string): ModelRoute {
  const route = value as ModelRoute | undefined;
  if (!route || typeof route.provider !== "string" || !route.provider.trim() || typeof route.model !== "string" || !route.model.trim() ||
    !["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(route.thinkingLevel)) throw new Error(`No valid exact model/thinking assignment for ${skill}.`);
  return route;
}
export function piInvocation(args: string[]) {
  const script = process.argv[1];
  if (script && !script.startsWith("/$bunfs/") && existsSync(script)) return { command: process.execPath, args: [script, ...args] };
  if (!/^(node|bun)(\.exe)?$/i.test(process.execPath.split(/[\\/]/).pop()!)) return { command: process.execPath, args };
  throw new Error("Cannot locate the running Pi CLI. Start this extension inside Pi.");
}

// Wait for process exit and log close. Cancellation preserves worktrees/files/logs, never retries.
export async function runWorker(options: {
  command: string; args: string[]; cwd: string; prompt: string; log: string;
  signal: AbortSignal; timeoutMs: number; onProgress?: (message: string) => void;
}): Promise<{ status: WorkerResult["status"]; summary: string; usage?: WorkerUsage }> {
  if (options.signal.aborted) return { status: "cancelled", summary: "Cancelled before launch." };
  const log = createWriteStream(options.log);
  try { await new Promise<void>((ok, fail) => { log.once("open", () => { log.off("error", fail); ok(); }); log.once("error", fail); }); }
  catch { log.destroy(); return { status: "failed", summary: "Cannot open worker diagnostic log; no process launched." }; }
  if (options.signal.aborted) {
    await new Promise<void>(done => { log.once("close", done); log.end(); });
    return { status: "cancelled", summary: "Cancelled before launch." };
  }
  return new Promise(resolveResult => {
    const child = spawn(options.command, options.args, { cwd: options.cwd, windowsHide: true, shell: false,
      detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, GABPRD_SPRINT_WORKER: "1" } });
    const usage = emptyUsage(), decoder = new StringDecoder("utf8");
    let cancelled = false, timedOut = false, failed = false, finished = false, final = "", reason = "", error = "", stderr = "", pending = "";
    const stop = () => {
      if (finished || cancelled) return;
      cancelled = true;
      if (!child.pid) return;
      if (process.platform === "win32") {
        execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }, failure => { if (failure && !finished) child.kill(); });
      } else { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } }
    };
    const fail = (message: string) => { failed = true; error = message; stop(); };
    const handleLine = (line: string) => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line.endsWith("\r") ? line.slice(0, -1) : line);
        if (event.type === "message_end" && event.message?.role === "assistant") {
          reason = event.message.stopReason ?? "";
          final = (Array.isArray(event.message.content) ? event.message.content : []).filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n").slice(-16000);
          // Provider errors stay in private raw logs, never public failure summaries.
          addUsage(usage, event.message.usage);
        }
        if (event.type === "agent_settled" && event.aborted) reason = "aborted";
        if (event.type === "tool_execution_start") {
          const name = ["read", "bash", "write", "edit", "grep", "find", "ls"].includes(event.toolName) ? event.toolName : "worker tool";
          try { options.onProgress?.(`Running ${name}`); } catch { fail("Progress observer failed; worker stopped for inspection."); }
        }
      } catch { fail("Invalid worker JSONL; inspect diagnostic log."); }
    };
    child.stdout.on("data", data => {
      if (!log.write(data)) { child.stdout.pause(); log.once("drain", () => child.stdout.resume()); }
      pending += decoder.write(data);
      let index: number;
      while ((index = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, index); pending = pending.slice(index + 1);
        if (line.length > 8 * 1024 * 1024) fail("Worker JSONL record exceeded limit; inspect diagnostic log.");
        else handleLine(line);
      }
      if (pending.length > 8 * 1024 * 1024) { pending = ""; fail("Worker JSONL record exceeded limit; inspect diagnostic log."); }
    });
    child.stderr.on("data", data => { stderr = (stderr + data.toString()).slice(-4000); });
    child.stdout.on("error", () => fail("Worker output stream failed; inspect diagnostic log."));
    child.stderr.on("error", () => fail("Worker diagnostic stream failed."));
    log.on("error", () => fail("Worker diagnostic log failed; partial work preserved."));
    child.stdin.on("error", () => { /* Early exit is reported by close. */ });
    child.on("error", () => { failed = true; error = "Worker process could not launch; verify Pi executable."; });
    const timer = setTimeout(() => { timedOut = true; stop(); }, options.timeoutMs);
    options.signal.addEventListener("abort", stop, { once: true });
    child.on("close", code => {
      finished = true; clearTimeout(timer); options.signal.removeEventListener("abort", stop);
      pending += decoder.end();
      if (stderr && !log.destroyed) log.write(`\n${JSON.stringify({ type: "worker_stderr", text: stderr })}\n`);
      if (pending.trim() && !cancelled) { failed = true; error = "Incomplete JSONL record at process exit; inspect diagnostic log."; }
      const processFailed = code !== 0 || reason !== "stop" || !final;
      const result = () => resolveResult({
        status: failed ? "failed" : cancelled ? "cancelled" : processFailed ? "failed" : "returned",
        summary: failed ? error : timedOut ? "Worker reached its time limit; inspect partial work before retrying." : cancelled ? "Cancelled; partial work preserved." : processFailed ? "Worker reported a model/process failure or no final report; inspect private diagnostic log." : final, usage,
      });
      if (log.closed || log.destroyed) result();
      else { log.once("close", result); log.end(); }
    });
    child.stdin.end(options.prompt);
    if (options.signal.aborted) stop();
  });
}

async function noSymlinkScope(root: string, scope: string) {
  let path = root;
  for (const part of scope.split("/")) {
    path = resolve(path, part);
    try { if ((await lstat(path)).isSymbolicLink()) throw new Error(`Owned scope traverses a symlink: ${scope}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") break; throw error; }
  }
}
export async function dispatch(cwd: string, tasks: Assignment[], signal: AbortSignal, timeoutMinutes: number,
  onProgress?: (message: string, update?: WorkerUpdate) => void, invocationFor = piInvocation): Promise<WorkerResult[]> {
  validateAssignments(tasks);
  if (!Number.isInteger(timeoutMinutes) || timeoutMinutes < 1 || timeoutMinutes > 30) throw new Error("Worker timeout must be 1–30 minutes.");
  if (await gitText(cwd, "status", "--porcelain")) throw new Error("Commit or otherwise account for parent changes before dispatch; workers start from HEAD.");
  const repo = await gitText(cwd, "rev-parse", "--show-toplevel");
  if (resolve(cwd).toLowerCase() !== resolve(repo).toLowerCase()) throw new Error("Dispatch from the repository root.");
  const base = await gitText(cwd, "rev-parse", "HEAD");
  const config = JSON.parse(await readFile(resolve(repo, ".pi", "skill-models.json"), "utf8"));
  const planned = [];
  // Entire batch validated before any worktree or billable process.
  for (const task of tasks) {
    const skillPath = `.agents/skills/${task.skill}/SKILL.md`;
    await git(repo, "cat-file", "-e", `${base}:${skillPath}`);
    const model = validateRoute(config.assignments?.[task.skill], task.skill);
    for (const commit of task.dependsOnCommits ?? []) await git(repo, "merge-base", "--is-ancestor", commit, base);
    for (const path of task.paths) await noSymlinkScope(repo, normalizedScope(path));
    planned.push({ task, model });
  }
  const root = resolve(repo, ".pi", "tmp", "sprint-workers", randomUUID());
  // Parent must ignore diagnostic/worktree area; do not silently edit ignore policy.
  await git(repo, "check-ignore", "--quiet", ".pi/tmp/sprint-workers/probe");
  const invocations = planned.map(({ task, model }) => {
    const worktree = resolve(root, task.id);
    const args = ["--mode", "json", "--print", "--no-session", "--approve", "--offline", "--no-mcp", "--no-extensions", "--no-prompt-templates", "--no-skills",
      "--tools", "read,bash,write,edit,grep,find,ls", "--skill", resolve(worktree, ".agents", "skills", task.skill, "SKILL.md"),
      "--provider", model.provider, "--model", model.model, "--thinking", model.thinkingLevel];
    return invocationFor(args);
  });
  await mkdir(root, { recursive: true });
  // Await every task even when observer/log failures occur; never return with siblings still running.
  return Promise.all(planned.map(async ({ task, model }, index) => {
    const started = Date.now(), worktree = resolve(root, task.id), log = resolve(root, `${task.id}.jsonl`);
    let result: WorkerResult = { id: task.id, status: "cancelled", worktree, base, log, summary: "Cancelled before worktree creation.", elapsedSeconds: 0 };
    const progress = (message: string, update: WorkerUpdate) => { onProgress?.(message, update); };
    try {
      if (!signal.aborted) {
        progress(`${task.id}: preparing worktree`, { id: task.id, status: "preparing", model: `${model.provider}/${model.model} (${model.thinkingLevel})` });
        await git(repo, "worktree", "add", "--detach", worktree, base);
        for (const path of task.paths) await noSymlinkScope(worktree, normalizedScope(path));
        const prompt = `You are a bounded gabPrd builder, not the coordinator. Use the state backend from automatically loaded repository instructions; do not choose again. Read .agents/skills/${task.skill}/SKILL.md.\nTask ${task.id}: ${task.task}\nOwned paths: ${task.paths.map(normalizedScope).join(", ")}. Stay within these paths. Treat dependencies/scope conflicts as BLOCKED. Never modify tests or project instructions.\nThe parent owns issue updates, integration, commits, pushes, PRs, shared runtime, and all quality gates. Do not commit, switch branches, update issues, invoke other agents, open PRs, or run mainline sync. Leave changes uncommitted in this detached worktree. Do not invoke sprint_workers recursively.\nDo not start shared services, configure Git/Pi credentials, mutate original/product repositories, publish a PRD, deploy, or run tests against production. Use isolated temporary fixtures for Git/Pi checks only when explicitly assigned. No auto-approval of questions, destructive cleanup, or worktree removal.\nStop when implemented, blocked, or a decision is required. Return exact changed files, isolated checks/results, required parent runtime checks, and risks. Your return is not completion, review approval, or human acceptance.`;
        progress(`${task.id}: running`, { id: task.id, status: "running", activity: "Working on bounded assignment" });
        result = { ...result, ...await runWorker({ ...invocations[index], cwd: worktree, prompt, log, signal, timeoutMs: timeoutMinutes * 60000,
          onProgress: message => progress(`${task.id}: ${message}`, { id: task.id, status: "running", activity: message }) }) };
        const tracked = await git(worktree, "diff", "--name-only", "--no-renames", "-z", base);
        const untracked = await git(worktree, "ls-files", "--others", "--exclude-standard", "-z");
        result.changedPaths = [...new Set(`${tracked}\0${untracked}`.split("\0").filter(Boolean))];
        result.outsideScope = result.changedPaths.filter(path => !task.paths.some(scope => owns(path, normalizedScope(scope))));
        const branch = (await exec("git", ["-C", worktree, "symbolic-ref", "--quiet", "HEAD"], { windowsHide: true }).catch(() => ({ stdout: "" }))).stdout;
        if (result.outsideScope.length || await gitText(worktree, "rev-parse", "HEAD") !== base || branch) {
          result.status = "failed"; result.summary += "\nOwnership/no-commit/detached-worktree contract violated. Inspect before integration.";
        }
      }
    } catch (error) {
      result.status = signal.aborted ? "cancelled" : "failed";
      // Raw subprocess errors can include output or credentials; local diagnostics remain for inspection.
      result.summary = "Worker preparation or inspection failed; partial work preserved. Verify repository, scope and process state before retrying.";
    }
    result.elapsedSeconds = Math.round((Date.now() - started) / 1000);
    try { progress(`${task.id}: ${result.status} (${result.elapsedSeconds}s)`, { id: task.id, status: result.status, result }); }
    catch { result.status = "failed"; result.summary += "\nProgress observer failed; inspect preserved work."; }
    try { await writeFile(resolve(root, `${task.id}.result.json`), JSON.stringify(result, null, 2)); }
    catch { result.status = "failed"; result.summary += "\nCould not persist diagnostic result; retain returned report and worktree."; }
    return result;
  }));
}
