import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {BootstrapRun} from '../../src/main/bootstrap-state';
import {SDK_VERSION,SQLITE_DRIVER_VERSION} from '../../src/shared/bootstrap-contracts';
const sqlite={status:'passed',driverVersion:SQLITE_DRIVER_VERSION,reopenVerified:true} as const;
function setup(){const id=randomUUID();return {id,run:new BootstrapRun(id),reply:{contractVersion:1,type:'bootstrap.result',runId:id,ok:true,sdkVersion:SDK_VERSION,assetsVerified:true}};}
test('only both actual checks make a run ready, either completion order',()=>{
  for(const reverse of [false,true]){const {run,reply}=setup();assert.equal(run.snapshot().state,'starting');
    if(reverse)run.acceptUtility(reply);else run.completeSqlite(sqlite);
    assert.equal(run.snapshot().state,'starting');
    if(reverse)run.completeSqlite(sqlite);else run.acceptUtility(reply);
    assert.equal(run.snapshot().state,'ready');assert.equal(run.acceptUtility(reply),false);assert.equal(run.completeSqlite(sqlite),false);
  }
});
test('timeout/exit/failure are absorbing for late, duplicate or wrong-run replies',()=>{
  for(const code of ['UTILITY_TIMEOUT','UTILITY_EXITED','INTERNAL'] as const){const {run,reply}=setup();run.completeSqlite(sqlite);assert.equal(run.failUtility(code),true);assert.equal(run.snapshot().state,'failed');assert.equal(run.acceptUtility(reply),false);assert.equal(run.failUtility(code),false);assert.equal(run.snapshot().state,'failed');}
  const {run,reply}=setup();assert.equal(run.acceptUtility({...reply,runId:randomUUID()}),false);assert.equal(run.snapshot().state,'starting');
});
test('stopping rejects all completions; snapshots cannot mutate internal state',()=>{
  const {run,reply}=setup();const snapshot=run.snapshot();try{Reflect.set(snapshot,'state','ready');Reflect.set(snapshot.sqlite,'status','passed');}catch{}
  assert.equal(run.snapshot().state,'starting');assert.equal(run.snapshot().sqlite.status,'pending');
  run.stop();assert.equal(run.snapshot().state,'stopping');assert.equal(run.acceptUtility(reply),false);assert.equal(run.completeSqlite(sqlite),false);assert.equal(run.failUtility('UTILITY_EXITED'),false);
});
test('unexpected owned child exit after import success invalidates ready state',()=>{const {run,reply}=setup();run.completeSqlite(sqlite);run.acceptUtility(reply);assert.equal(run.snapshot().state,'ready');assert.equal(run.failUtility('UTILITY_EXITED'),true);assert.equal(run.snapshot().state,'failed');});
