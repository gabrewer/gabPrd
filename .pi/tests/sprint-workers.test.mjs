import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm, mkdir, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateAssignments, validateRoute, runWorker, git, dispatch } from "../lib/sprint-workers.ts";

const task = (id, paths) => ({ id, paths, skill: "git-workspace-builder", task: "Implement the approved local adapter." });
test("parallel ownership and dependency input validation", () => {
  assert.doesNotThrow(() => validateAssignments([task("a", ["Services/A"]), task("b", ["Clients/B"])]));
  assert.throws(() => validateAssignments([task("a", ["Services/A"]), task("b", ["services/a/File.cs"])]), /overlap/);
  for (const path of ["../outside", "X:/outside", ".", "Services/*"]) assert.throws(() => validateAssignments([task("a", [path])]), /literal/);
  assert.throws(() => validateAssignments([{ ...task("a", ["Services/A"]), skill: "team-lead" }]), /builder/);
  assert.throws(() => validateAssignments([task("a", ["A"]), task("A", ["B"])]), /unique/);
});

async function fixture(t, source) {
  const cwd = await mkdtemp(join(tmpdir(), "gabprd-workers-test-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const script = join(cwd, "worker.cjs");
  await writeFile(script, source);
  return { cwd, command: process.execPath, args: [script], prompt: "assignment", log: join(cwd, "events.jsonl"), signal: new AbortController().signal, timeoutMs: 5000 };
}

test("two subprocess workers run concurrently and preserve final reports", async t => {
  const options = await fixture(t, `const fs=require('fs'); fs.writeFileSync(process.argv[2], 'ready'); const timer=setInterval(()=>{if(fs.existsSync(process.argv[3])){clearInterval(timer); console.log(JSON.stringify({type:'message_end',message:{role:'assistant',stopReason:'stop',content:[{type:'text',text:'implemented'}]}}));}},20);`);
  const a = join(options.cwd, "a.ready"), b = join(options.cwd, "b.ready");
  const results = await Promise.all([
    runWorker({ ...options, args: [...options.args, a, b], log: join(options.cwd, "a.jsonl") }),
    runWorker({ ...options, args: [...options.args, b, a], log: join(options.cwd, "b.jsonl") }),
  ]);
  assert.deepEqual(results.map(r => r.status), ["returned", "returned"]);
  assert.equal(results[0].summary, "implemented");
});

test("zero process exit with a model error is still failure", async t => {
  const options = await fixture(t, `console.log(JSON.stringify({type:'message_end',message:{role:'assistant',stopReason:'error',errorMessage:'auth failed',content:[]}}));`);
  const result = await runWorker(options);
  assert.equal(result.status, "failed"); assert.match(result.summary, /failure|failed/);
});

test("abort stops a running worker and preserves partial files", async t => {
  const options = await fixture(t, `const fs=require('fs'); const child=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); fs.writeFileSync('child.pid',String(child.pid)); fs.writeFileSync('partial.txt','keep'); setInterval(()=>{},1000);`);
  const controller = new AbortController();
  const resultPromise = runWorker({ ...options, signal: controller.signal, onProgress() {} });
  for (let i = 0; i < 100; i++) {
    try { await readFile(join(options.cwd, "partial.txt")); break; } catch { await new Promise(r => setTimeout(r, 20)); }
  }
  controller.abort();
  assert.equal((await resultPromise).status, "cancelled");
  assert.equal(await readFile(join(options.cwd, "partial.txt"), "utf8"), "keep");
  const childPid = Number(await readFile(join(options.cwd, "child.pid"), "utf8"));
  assert.throws(() => process.kill(childPid, 0), { code: "ESRCH" });
});

test("cancellation during a partial JSONL record remains cancelled and preserves log", async t => {
  const options = await fixture(t, `process.stdout.write('{"type":"message_'); setInterval(()=>{},1000);`);
  const result = await runWorker({ ...options, timeoutMs: 200 });
  assert.equal(result.status, "cancelled");
  assert.match(await readFile(options.log, "utf8"), /message_/);
});

test("a time limit returns control without retrying", async t => {
  const options = await fixture(t, "setInterval(()=>{},1000);");
  const result = await runWorker({ ...options, timeoutMs: 150 });
  assert.equal(result.status, "cancelled"); assert.match(result.summary, /time limit/);
});

test("dirty parent is rejected before any worker is launched", async t => {
  const options = await fixture(t, "");
  await git(options.cwd, "init");
  await assert.rejects(dispatch(options.cwd, [task("a", ["Services/A"])], options.signal, 10), /parent changes/);
});

test("dispatch isolates changes, checks dependencies and retains recoverable worktrees", async t => {
  const options = await fixture(t, `const fs=require('fs'); const name=process.argv[process.argv.indexOf('--model')+1]; fs.mkdirSync(name,{recursive:true}); fs.writeFileSync(name+'/result.txt','implemented'); console.log(JSON.stringify({type:'message_end',message:{role:'assistant',stopReason:'stop',content:[{type:'text',text:'done'}]}}));`);
  await git(options.cwd, "init");
  await git(options.cwd, "config", "user.name", "Test");
  await git(options.cwd, "config", "user.email", "test@example.invalid");
  await mkdir(join(options.cwd, ".pi"));
  const mappings = {};
  for (const [skill, model] of [["git-workspace-builder", "Services"], ["markdown-editor-builder", "Clients"]]) {
    await mkdir(join(options.cwd, ".agents", "skills", skill), { recursive: true });
    await writeFile(join(options.cwd, ".agents", "skills", skill, "SKILL.md"), "# Test skill");
    mappings[skill] = { provider: "fixture", model, thinkingLevel: "low" };
  }
  await writeFile(join(options.cwd, ".pi", "skill-models.json"), JSON.stringify({ schemaVersion: 1, routing: "manual", assignments: mappings }));
  await writeFile(join(options.cwd, ".gitignore"), ".pi/tmp/\n");
  await git(options.cwd, "add", "."); await git(options.cwd, "commit", "-m", "fixture");
  const base = await git(options.cwd, "rev-parse", "HEAD");
  const invocation = args => {
    assert.ok(args.includes("--no-extensions"));
    assert.ok(args.includes("--no-prompt-templates"));
    return { command: process.execPath, args: [...options.args, ...args] };
  };
  const tasks = [task("a", ["Services"]), { ...task("b", ["Clients"]), skill: "markdown-editor-builder", dependsOnCommits: [base] }];
  const results = await dispatch(options.cwd, tasks, options.signal, 1, undefined, invocation);
  assert.deepEqual(results.map(r => r.status), ["returned", "returned"]);
  assert.deepEqual(results.map(r => r.changedPaths), [["Services/result.txt"], ["Clients/result.txt"]]);
  assert.equal(await git(options.cwd, "status", "--porcelain"), "");
  for (const result of results) assert.equal(await git(result.worktree, "rev-parse", "HEAD"), base);
  await assert.rejects(dispatch(options.cwd, [{ ...task("c", ["Services"]), dependsOnCommits: ["1234567"] }], options.signal, 1, undefined, invocation));
  const outOfScope = await dispatch(options.cwd, [task("c", ["Other"])], options.signal, 1, undefined, invocation);
  assert.equal(outOfScope[0].status, "failed");
  assert.deepEqual(outOfScope[0].outsideScope, ["Services/result.txt"]);
  // Exercise the documented parent-owned integration path on fixture commits only.
  await git(results[0].worktree, "add", "Services/result.txt");
  await git(results[0].worktree, "commit", "-m", "accepted task");
  const accepted = await git(results[0].worktree, "rev-parse", "HEAD");
  await git(options.cwd, "cherry-pick", accepted);
  assert.equal(await readFile(join(options.cwd, "Services", "result.txt"), "utf8"), "implemented");
});


test("only project builders are dispatchable, policy scopes and overlapping paths are rejected", () => {
  for (const skill of ["api-developer", "pm", "review-agent", "git-committer", "test-writer", "unknown-builder"]) {
    assert.throws(() => validateAssignments([{ ...task("a", ["src/A"]), skill }]), /builder/);
  }
  for (const path of [".git/config", ".pi/extensions", ".agents/skills", "AGENTS.md", "instructions", "folder/trailing.", "folder/trailing ", "folder/NUL", "folder/./child", "folder//child"]) {
    assert.throws(() => validateAssignments([task("a", [path])]), /literal|protected/);
  }
  assert.throws(() => validateAssignments([{ ...task("a", ["src", "src/A"]) }]), /overlap/);
});

test("strict LF JSON framing preserves Unicode separators and split UTF-8", async t => {
  const options = await fixture(t, `const s=JSON.stringify({type:'message_end',message:{role:'assistant',stopReason:'stop',content:[{type:'text',text:'café\\u2028next\\u2029end'}]}})+'\\n'; const b=Buffer.from(s); for(let i=0;i<b.length;i++) process.stdout.write(b.subarray(i,i+1));`);
  const result = await runWorker(options);
  assert.equal(result.status, "returned");
  assert.equal(result.summary, "café\u2028next\u2029end");
  assert.match(await readFile(options.log, "utf8"), /message_end/);
});

test("launch and log errors return recoverable failures without unhandled exceptions", async t => {
  const options = await fixture(t, "");
  assert.equal((await runWorker({ ...options, command: join(options.cwd, "missing.exe") })).status, "failed");
  assert.equal((await runWorker({ ...options, log: join(options.cwd, "absent", "log.jsonl") })).status, "failed");
});

test("provider/diagnostic failure details stay out of model-facing results", async t => {
  const options = await fixture(t, `console.error('SENTINEL_PROVIDER_SECRET'); console.log(JSON.stringify({type:'message_end',message:{role:'assistant',stopReason:'error',errorMessage:'SENTINEL_PROVIDER_SECRET',content:[{type:'text',text:'SENTINEL_PROVIDER_SECRET'}]}}));`);
  const result = await runWorker(options);
  assert.equal(result.status, "failed");
  assert.doesNotMatch(result.summary, /SENTINEL_PROVIDER_SECRET/);
  assert.match(await readFile(options.log, "utf8"), /SENTINEL_PROVIDER_SECRET/);
});

test("pre-abort launches nothing; callback errors do not orphan a child", async t => {
  const options = await fixture(t, `console.log(JSON.stringify({type:'tool_execution_start',toolName:'read'})); setInterval(()=>{},1000);`);
  const stopped = new AbortController(); stopped.abort();
  assert.equal((await runWorker({ ...options, signal: stopped.signal })).status, "cancelled");
  const result = await runWorker({ ...options, onProgress() { throw new Error("observer failed"); } });
  assert.equal(result.status, "failed");
  assert.match(result.summary, /observer/);
});

async function repoFixture(t, source) {
  const options = await fixture(t, source);
  await git(options.cwd, "init");
  await git(options.cwd, "config", "user.name", "Test");
  await git(options.cwd, "config", "user.email", "test@example.invalid");
  const assignments = {};
  for (const [skill, model] of [["git-workspace-builder", "Services"], ["markdown-editor-builder", "Clients"]]) {
    await mkdir(join(options.cwd, ".agents", "skills", skill), { recursive: true });
    await writeFile(join(options.cwd, ".agents", "skills", skill, "SKILL.md"), "# Test skill");
    assignments[skill] = { provider: "fixture", model, thinkingLevel: "medium" };
  }
  await mkdir(join(options.cwd, ".pi"));
  await writeFile(join(options.cwd, ".pi", "skill-models.json"), JSON.stringify({ schemaVersion: 1, routing: "manual", assignments }));
  await writeFile(join(options.cwd, ".gitignore"), ".pi/tmp/\n");
  await git(options.cwd, "add", "."); await git(options.cwd, "commit", "-m", "fixture");
  return { ...options, invocation: args => ({ command: process.execPath, args: [...options.args, ...args] }) };
}
test("exact route validation rejects missing or malformed thinking assignments", () => {
  for (const value of [undefined, {}, { provider: "p", model: "m" }, { provider: "p", model: "m", thinkingLevel: "invented" }]) {
    assert.throws(() => validateRoute(value, "backend-builder"), /assignment/);
  }
});
test("entire batch preflight prevents launching the first worker when the second route is missing", async t => {
  const options = await repoFixture(t, "");
  const config = JSON.parse(await readFile(join(options.cwd, ".pi", "skill-models.json"), "utf8"));
  delete config.assignments["markdown-editor-builder"];
  await writeFile(join(options.cwd, ".pi", "skill-models.json"), JSON.stringify(config));
  await git(options.cwd, "add", ".pi/skill-models.json"); await git(options.cwd, "commit", "-m", "bad route");
  let launched = false;
  await assert.rejects(dispatch(options.cwd, [task("a", ["Services"]), { ...task("b", ["Clients"]), skill: "markdown-editor-builder" }], options.signal, 1, undefined, () => { launched = true; return options; }), /assignment/);
  assert.equal(launched, false);
  await assert.rejects(access(join(options.cwd, ".pi", "tmp")));
});
test("unauthorized worker commits are detected and worktree/history remain for inspection", async t => {
  const options = await repoFixture(t, `const fs=require('fs'),cp=require('child_process'); fs.mkdirSync('Services'); fs.writeFileSync('Services/result.txt','keep'); cp.execFileSync('git',['add','Services']); cp.execFileSync('git',['commit','-m','unauthorized']); console.log(JSON.stringify({type:'message_end',message:{role:'assistant',stopReason:'stop',content:[{type:'text',text:'report'}]}}));`);
  const result = (await dispatch(options.cwd, [task("a", ["Services"])], options.signal, 1, undefined, options.invocation))[0];
  assert.equal(result.status, "failed");
  assert.match(result.summary, /contract violated/);
  assert.notEqual(await git(result.worktree, "rev-parse", "HEAD"), result.base);
  assert.equal(await readFile(join(result.worktree, "Services/result.txt"), "utf8"), "keep");
  assert.equal(await git(options.cwd, "status", "--porcelain"), "");
});
test("failed progress observer does not return before a sibling finishes", async t => {
  const options = await repoFixture(t, `const fs=require('fs'); const model=process.argv[process.argv.indexOf('--model')+1]; fs.mkdirSync(model); setTimeout(()=>{fs.writeFileSync(model+'/result.txt','keep');console.log(JSON.stringify({type:'message_end',message:{role:'assistant',stopReason:'stop',content:[{type:'text',text:'report'}]}}));},150);`);
  const results = await dispatch(options.cwd, [task("a", ["Services"]), { ...task("b", ["Clients"]), skill: "markdown-editor-builder" }], options.signal, 1,
    (_message, update) => { if (update.id === "a") throw new Error("observer"); }, options.invocation);
  assert.deepEqual(results.map(r => r.status), ["failed", "returned"]);
  assert.equal(await readFile(join(results[1].worktree, "Clients/result.txt"), "utf8"), "keep");
});
test("usage aggregates authoritative assistant messages, not streaming snapshots", async t => {
  const options = await fixture(t, `const usage={input:10,output:5,cacheRead:2,cacheWrite:1,totalTokens:18,cost:{input:1,output:2,cacheRead:0,cacheWrite:0,total:3}}; console.log(JSON.stringify({type:'message_update',usage})); for(let i=0;i<2;i++) console.log(JSON.stringify({type:'message_end',message:{role:'assistant',stopReason:'stop',content:[{type:'text',text:'report'}],usage}}));`);
  const result = await runWorker(options);
  assert.equal(result.usage.input, 20);
  assert.equal(result.usage.totalTokens, 36);
  assert.equal(result.usage.cost.total, 6);
});
