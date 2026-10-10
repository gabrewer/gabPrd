import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWorker } from '../lib/sprint-workers.ts';
import { createBatchLifecycle, registerBatchCancellation } from '../lib/worker-lifecycle.ts';

test('extension wires joined lifecycle and finishes the batch in its cleanup path', async () => {
  const source = await readFile(new URL('../extensions/sprint-workers.ts', import.meta.url), 'utf8');
  assert.match(source, /registerBatchCancellation\(pi, lifecycle\)/);
  assert.match(source, /const batch = lifecycle\.begin\(\)/);
  assert.match(source, /finally \{ batch\.finish\(\); \}/);
});

for (const event of ['session_shutdown', 'session_before_switch', 'session_before_fork']) {
  test(`${event} aborts and waits for batch diagnostic completion`, async () => {
    const handlers = new Map(), events = new EventEmitter();
    const lifecycle = createBatchLifecycle();
    registerBatchCancellation({ events, on(name, handler) { handlers.set(name, handler); } }, lifecycle);
    const batch = lifecycle.begin();
    let joined = false;
    const stopping = handlers.get(event)().then(() => { joined = true; });
    assert.equal(batch.controller.signal.aborted, true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(joined, false, 'shutdown must not outpace process/log/result completion');
    assert.equal(lifecycle.isRunning(), true);
    batch.finish();
    await stopping;
    assert.equal(joined, true);
    assert.equal(lifecycle.isRunning(), false);
  });
}
test('pause aborts immediately; explicit join and repeated shutdown are idempotent', async () => {
  const lifecycle = createBatchLifecycle(), events = new EventEmitter();
  registerBatchCancellation({ events, on() {} }, lifecycle);
  const batch = lifecycle.begin();
  assert.throws(() => lifecycle.begin(), /already running/);
  events.emit('gabprd:sprint:pause');
  assert.equal(batch.controller.signal.aborted, true);
  const one = lifecycle.stopAndWait(), two = lifecycle.stopAndWait();
  batch.finish(); batch.finish();
  await Promise.all([one, two]);
  await lifecycle.stopAndWait();
});
test('completion of an old batch cannot release or cancel a newer batch', async () => {
  const lifecycle = createBatchLifecycle();
  const first = lifecycle.begin(), waiting = lifecycle.stopAndWait();
  first.finish();
  const next = lifecycle.begin();
  first.finish();
  await waiting;
  assert.equal(lifecycle.isRunning(), true);
  assert.equal(next.controller.signal.aborted, false);
  next.finish();
});
test('shutdown joins a real child exit and final diagnostic persistence', async t => {
  const root = await mkdtemp(join(tmpdir(), 'gabprd-shutdown-test-'));
  const lifecycle = createBatchLifecycle(), handlers = new Map();
  registerBatchCancellation({ events: new EventEmitter(), on(name, handler) { handlers.set(name, handler); } }, lifecycle);
  await writeFile(join(root, 'child.cjs'), `const fs=require('fs');fs.writeFileSync('child.pid',String(process.pid));fs.writeFileSync('partial.txt','preserve');setInterval(()=>{},1000);`);
  const batch = lifecycle.begin();
  const operation = (async () => {
    try {
      const result = await runWorker({ command: process.execPath, args: [join(root, 'child.cjs')], cwd: root, prompt: 'smoke', log: join(root, 'events.jsonl'), signal: batch.controller.signal, timeoutMs: 5000 });
      await writeFile(join(root, 'result.json'), JSON.stringify(result));
      return result;
    } finally { batch.finish(); }
  })();
  t.after(async () => { await lifecycle.stopAndWait(); await operation; await rm(root, { recursive: true, force: true }); });
  let pid;
  for (let i = 0; i < 100; i++) {
    try { pid = Number(await readFile(join(root, 'child.pid'), 'utf8')); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 20)); }
  }
  assert.ok(pid, 'child must be running before shutdown');
  await handlers.get('session_shutdown')();
  assert.equal((await operation).status, 'cancelled');
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  assert.equal(JSON.parse(await readFile(join(root, 'result.json'), 'utf8')).status, 'cancelled');
  assert.equal(await readFile(join(root, 'partial.txt'), 'utf8'), 'preserve');
});

test('failed execution still joins when caller finishes from finally', async () => {
  const lifecycle = createBatchLifecycle();
  let captured;
  const operation = (async () => {
    const batch = lifecycle.begin(); captured = batch;
    try { await new Promise(resolve => batch.controller.signal.addEventListener('abort', resolve, { once: true })); throw new Error('expected failure'); }
    finally { batch.finish(); }
  })();
  const failure = assert.rejects(operation, /expected failure/);
  await lifecycle.stopAndWait();
  await failure;
  assert.equal(captured.controller.signal.aborted, true);
  assert.equal(lifecycle.isRunning(), false);
});
