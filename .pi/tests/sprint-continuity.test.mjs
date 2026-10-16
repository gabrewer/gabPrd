import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createBatchLifecycle, registerBatchCancellation } from '../lib/worker-lifecycle.ts';
// Use the actual installed extension loader dependencies, not application packages.
const require = createRequire('C:/Users/gabre/.pi/agent/install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent/package.json');
const { createJiti } = require('jiti');
const jiti = createJiti(import.meta.url, { moduleCache:false, alias:{ typebox:require.resolve('typebox') } });
const { default: guard } = await jiti.import(fileURLToPath(new URL('../extensions/sprint-continuity-guard.ts',import.meta.url)));
function setup() {
  const handlers=new Map(),commands=new Map(),tools=new Map(),sent=[],entries=[];
  const emitter=new EventEmitter();
  const events={emit:(...args)=>emitter.emit(...args),on:(name,handler)=>{
    emitter.on(name,handler);return ()=>emitter.off(name,handler);
  }};
  const statuses=new Map([['gabprd-sprint','Sprint stopped — SHUTDOWN']]);
  let aborts=0;
  const ctx={cwd:process.cwd(),hasUI:false,isIdle:()=>true,hasPendingMessages:()=>false,abort:()=>aborts++,
    ui:{notify(){},setStatus:(key,value)=>statuses.set(key,value)},sessionManager:{getSessionId:()=> 'fixture-session',getBranch:()=>entries,getLeafId:()=>entries.at(-1)?.id,getEntry:id=>entries.find(e=>e.id===id)}};
  const pi={events,on:(n,h)=>handlers.set(n,h),registerCommand:(n,c)=>commands.set(n,c),registerTool:t=>tools.set(t.name,t),
    exec:async()=>({code:0,stdout:'["sprint-active"]'}),
    appendEntry:(customType,data)=>entries.push({type:'custom',customType,data,id:String(entries.length)}),
    sendUserMessage:(...args)=>sent.push(args),getCommands:()=>[{name:'team-lead',source:'prompt',sourceInfo:{path:fileURLToPath(new URL('../prompts/team-lead.md',import.meta.url))}}]};
  guard(pi);
  const emit=(name,event={})=>handlers.get(name)?.(event,ctx);
  const run=async()=>{await commands.get('sprint').handler('24',ctx);const text=sent.at(-1)?.[0];assert.equal(typeof text,'string');
    const input=await emit('input',{source:'extension',text});assert.deepEqual(input,{action:'transform',text:'/team-lead 24'});
    await emit('before_agent_start',{messageType:'user',prompt:'Expanded team-lead 24'});return text;};
  const boundary=async(event={type:'agent_before_settle',outcome:'completed',context:{canContinue:false,contextEntries:[...entries],contextMessages:[],llmMessages:[],pendingMessages:[]}})=>{
    const r=await emit('agent_before_settle',event);for(const e of r?.entries??[])entries.push({...e,id:String(entries.length)});return r;};
  return {commands,tools,sent,entries,events,statuses,emit,run,boundary,ctx,get aborts(){return aborts;}};
}
test('loading is inert and commands reject invalid or extra arguments',async()=>{
  const h=setup();assert.equal(h.sent.length,0);assert.deepEqual([...h.commands.keys()],['sprint','sprint-resume','sprint-stop']);
  for(const arg of ['0','-1','24 extra','24\n','https://github.com/gabrewer/gabPrd/issues/24'])await h.commands.get('sprint').handler(arg,h.ctx);
  assert.equal(h.sent.length,0);
});
test('reload clears the retired status and hides the stopped guard',async()=>{
  const h=setup();await h.emit('session_start');
  assert.equal(h.statuses.get('gabprd-sprint'),undefined);
  assert.equal(h.statuses.get('sprint-continuity'),undefined);
});
test('explicit start uses native numeric team-lead expansion, not prose activation',async()=>{
  const h=setup();await h.emit('input',{source:'interactive',text:'continue sprint #24'});assert.equal(h.sent.length,0);
  await h.run();assert.equal(h.sent[0][1].expandPromptTemplates,true);
});
test('completed owned boundary supplies runnable drafts once, not notification-only settlement',async()=>{
  // Pi excludes custom owner records from projected model context; they remain on the session branch.
  const h=setup();await h.run();const event={type:'agent_before_settle',outcome:'completed',context:{canContinue:false,contextEntries:[],contextMessages:[],llmMessages:[],pendingMessages:[]}};
  const r=await h.boundary(event);assert.equal(r?.continue,true);assert.ok(r.entries.some(e=>e.type==='custom_message'&&e.content.length));
  assert.equal((await h.boundary(event))?.continue,undefined);assert.equal(h.sent.length,1);
});
test('human interruption answers normally, discards stale input, and requires explicit resume',async()=>{
  const h=setup(),old=await h.run();assert.deepEqual(await h.emit('input',{source:'rpc',text:'Explain this'}),{action:'continue'});
  assert.equal((await h.boundary())?.continue,undefined);await h.commands.get('sprint-resume').handler('',h.ctx);
  assert.equal(h.sent.length,2);assert.deepEqual(await h.emit('input',{source:'extension',text:old}),{action:'handled'});
});
test('errors and session changes cannot restart automatically',async()=>{
  const h=setup();await h.run();await h.emit('message_end',{message:{role:'assistant',stopReason:'error'}});
  assert.equal((await h.boundary())?.continue,undefined);await h.emit('session_before_switch');
  await h.commands.get('sprint-resume').handler('',h.ctx);assert.equal(h.sent.length,1);
});
test('model can yield for human input or completion without claiming acceptance',async()=>{
  const h=setup();await h.run();const tool=h.tools.get('sprint_yield');assert.ok(tool);
  await tool.execute('fixture',{reason:'human-input'},undefined,undefined,h.ctx);
  assert.equal((await h.boundary())?.continue,undefined);
});
test('two no-tool boundaries pause rather than loop indefinitely',async()=>{
  const h=setup();await h.run();assert.equal((await h.boundary())?.continue,true);
  assert.equal((await h.boundary())?.continue,undefined);
});
test('stop invalidates immediately and waits for captured worker cleanup',async()=>{
  const h=setup();await h.run();
  const lifecycle=createBatchLifecycle();registerBatchCancellation({events:h.events,on(){}},lifecycle);
  const batch=lifecycle.begin();h.events.emit('gabprd:sprint:workers',{running:true});
  let stopped=false;const stop=h.commands.get('sprint-stop').handler('',h.ctx).then(()=>stopped=true);
  assert.equal(batch.controller.signal.aborted,true);
  assert.equal((await h.boundary())?.continue,undefined);await Promise.resolve();assert.equal(stopped,false);
  batch.finish();h.events.emit('gabprd:sprint:workers',{running:false});
  await stop;assert.equal(stopped,true);assert.ok(h.aborts>0);
});
