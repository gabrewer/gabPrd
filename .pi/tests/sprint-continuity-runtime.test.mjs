import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { git } from '../lib/sprint-workers.ts';
const host='C:/Users/gabre/.pi/agent/install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent';
const require=createRequire(join(host,'package.json'));
const SDK=await import(pathToFileURL(join(host,'dist/index.js')).href);
const { createAssistantMessageEventStream }=await import(pathToFileURL(join(host,'../pi-ai/dist/index.js')).href);

test('real Pi coordinator starts sprint, dispatches two concurrent isolated workers, continues and yields', {timeout:30000},async t=>{
  const root=await mkdtemp(join(tmpdir(),'gabprd-parallel-sprint-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'.pi/prompts'),{recursive:true});
  await mkdir(join(root,'.agents/skills/backend-builder'),{recursive:true});
  await writeFile(join(root,'.pi/prompts/team-lead.md'),await readFile(new URL('../prompts/team-lead.md',import.meta.url)));
  await writeFile(join(root,'.agents/skills/backend-builder/SKILL.md'),'---\nname: backend-builder\ndescription: Fixture only\n---\nFixture.');
  await writeFile(join(root,'.pi/skill-models.json'),JSON.stringify({assignments:{'backend-builder':{provider:'fixture',model:'coordinator',thinkingLevel:'medium'}}}));
  await writeFile(join(root,'.gitignore'),'.pi/tmp/\n');
  const child=join(root,'fixture-worker.cjs');
  await writeFile(child,`const fs=require('fs'),path=require('path');let prompt='';process.stdin.on('data',b=>prompt+=b);process.stdin.on('end',()=>{const id=/Task (left|right):/.exec(prompt)[1];const shared=process.env.GABPRD_TEST_BARRIER;fs.mkdirSync(shared,{recursive:true});fs.writeFileSync(path.join(shared,id),'ready');const timer=setInterval(()=>{if(fs.existsSync(path.join(shared,'left'))&&fs.existsSync(path.join(shared,'right'))){clearInterval(timer);fs.mkdirSync(id,{recursive:true});fs.writeFileSync(id+'/result.txt',id);console.log(JSON.stringify({type:'message_end',message:{role:'assistant',stopReason:'stop',content:[{type:'text',text:id+' returned'}]}}));}},10);});`);
  await git(root,'init','-b','feature/fixture');await git(root,'config','user.name','Fixture');await git(root,'config','user.email','fixture@example.invalid');
  await git(root,'add','.');await git(root,'commit','-m','fixture');
  const head=await git(root,'rev-parse','HEAD');
  const agentDir=join(root,'.pi/tmp/agent');await mkdir(agentDir,{recursive:true});
  const runtime=await SDK.ModelRuntime.create({authPath:join(agentDir,'auth.json'),modelsPath:null,refreshOnCreate:false,allowModelNetwork:false});
  let calls=0;const prompts=[];
  runtime.registerProvider('fixture',{baseUrl:'https://fixture.invalid',apiKey:'fixture-only',api:'fixture-stream',models:[{id:'coordinator',name:'Fixture coordinator',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:128000,maxTokens:1024}],
    streamSimple(model,context){
      const stream=createAssistantMessageEventStream(),n=calls++;prompts.push(context.messages);
      queueMicrotask(()=>{
        const tool=n===0?{type:'toolCall',id:'workers',name:'sprint_workers',arguments:{tasks:['left','right'].map(id=>({id,skill:'backend-builder',task:'Implement fixture '+id,paths:[id+'/result.txt']})),timeoutMinutes:1}}
          :n===2?{type:'toolCall',id:'yield',name:'sprint_yield',arguments:{reason:'finished'}}:null;
        const message={role:'assistant',api:model.api,provider:model.provider,model:model.id,timestamp:Date.now(),content:[],stopReason:'pending',usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}};
        stream.push({type:'start',partial:message});message.content=[tool??{type:'text',text:n===1?'Inspect returned results before the next phase.':'Ready for human verification.'}];
        if(tool){stream.push({type:'toolcall_start',contentIndex:0,partial:message});stream.push({type:'toolcall_end',contentIndex:0,toolCall:tool,partial:message});}
        else {stream.push({type:'text_start',contentIndex:0,partial:message});stream.push({type:'text_delta',contentIndex:0,delta:message.content[0].text,partial:message});stream.push({type:'text_end',contentIndex:0,content:message.content[0].text,partial:message});}
        message.stopReason=tool?'toolUse':'stop';stream.push({type:'done',reason:message.stopReason,message});stream.end();
      });return stream;
    }});
  const settings=SDK.SettingsManager.inMemory({compaction:{enabled:false},retry:{enabled:false,provider:{maxRetries:0}}});
  const loader=new SDK.DefaultResourceLoader({cwd:root,agentDir,settingsManager:settings,noExtensions:true,noSkills:true,noThemes:true,noContextFiles:true,noPromptTemplates:true,
    additionalExtensionPaths:[resolve('.pi/extensions/sprint-continuity-guard.ts'),resolve('.pi/extensions/sprint-workers.ts')],additionalPromptTemplatePaths:[join(root,'.pi/prompts/team-lead.md')]});
  await loader.reload({resolveProjectTrust:async()=>true});
  assert.deepEqual(loader.getExtensions().errors,[]);
  const {session}=await SDK.createAgentSession({cwd:root,agentDir,modelRuntime:runtime,model:runtime.getModel('fixture','coordinator'),thinkingLevel:'off',settingsManager:settings,resourceLoader:loader,sessionManager:SDK.SessionManager.inMemory(root),noTools:true});
  t.after(()=>session.dispose());
  const failures=[];session.subscribe(e=>{if(e.type==='extension_error')failures.push(e);});
  await session.bindExtensions({});
  const oldArg=process.argv[1],oldBarrier=process.env.GABPRD_TEST_BARRIER;
  process.argv[1]=child;process.env.GABPRD_TEST_BARRIER=join(root,'.pi/tmp/barrier');
  try {
    await session.prompt('/sprint 24');
    // sendUserMessage starts an async run; wait for actual settlement, not command disposition.
    for(let n=0;n<400 && (calls<4 || session.isStreaming);n++)await new Promise(r=>setTimeout(r,20));
    await session.waitForIdle();
  }finally{process.argv[1]=oldArg;if(oldBarrier===undefined)delete process.env.GABPRD_TEST_BARRIER;else process.env.GABPRD_TEST_BARRIER=oldBarrier;}
  assert.equal(calls,4,JSON.stringify({calls,messages:session.messages,failures}));assert.deepEqual(failures,[]);
  const user=prompts[0].find(m=>m.role==='user');assert.match(JSON.stringify(user),/Execute approved sprint `24`/);assert.doesNotMatch(JSON.stringify(user),/\$@|gabprd:sprint:input/);
  const result=session.messages.find(m=>m.role==='toolResult'&&m.toolName==='sprint_workers');assert.ok(result);assert.notEqual(result.isError,true,JSON.stringify(result));
  const results=JSON.parse(result.content.find(c=>c.type==='text').text);assert.deepEqual(results.map(r=>r.status),['returned','returned']);
  assert.notEqual(results[0].worktree,results[1].worktree);
  for(const [i,id] of ['left','right'].entries()){assert.equal(results[i].base,head);assert.equal(await readFile(join(results[i].worktree,id,'result.txt'),'utf8'),id);}
  assert.equal(await git(root,'status','--porcelain'),'','worker output stays isolated until coordinator inspection');
  assert.equal(await git(root,'rev-parse','HEAD'),head);
});
