/** One main-owned PRD/SDK association. Typed protocol only; normal configured Pi tools remain intact. */
import path from 'node:path';
import {realpathSync,readFileSync,lstatSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import type * as C from '../shared/prd-contracts';
import {PRD_LIMITS as L,PRD_ERROR_MESSAGES} from '../shared/prd-contracts';
import {parsePiCommand,parsePiEvent} from '../shared/prd-validation';
import type {PortResult} from '../main/prd-ports';
import {requireStore,StoreFault} from '../main/prd-schema';
import {canonicalStat,verifiedDirectory,validRelative,contained} from '../main/prd-paths';
import {loadPrdResources,readBoundSkill,verifyPackagedFile} from './prd-resources';
import type {PrdSdk,PrdResources} from './prd-resources';
import {createPrdDialogs} from './prd-dialogs';
import type {PrdDialogHost} from './prd-dialogs';
import {inspectPrdSession,boundedText,prdMessageKey,prdMessageId} from './prd-history';
import type {AgentSession,AgentSessionEvent,SessionManager} from '@earendil-works/pi-coding-agent';
export interface PrdSessionHost {readonly packagedEntry:C.CanonicalPath;readonly packagedSdkRoot:C.CanonicalPath}
export function readPiCorrelation(value:unknown):C.PiCorrelation|undefined{
 try{if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)return;const result:Record<string,string>={},descriptors=Object.getOwnPropertyDescriptors(value);for(const key of ['requestId','prdId','operationId','generationId']){const d=descriptors[key];if(!d||!('value'in d)||typeof d.value!=='string')return;result[key]=d.value;}return result as unknown as C.PiCorrelation;}catch{return;}
}
const ok=():PortResult<void>=>({ok:true,value:undefined});
type Body=C.PiUtilityEvent extends infer E?E extends C.PiUtilityEvent?Omit<E,'contractVersion'|'sequence'|keyof C.PiCorrelation>:never:never;
function take<T>(r:PortResult<T>):T{if(!r.ok)throw new StoreFault(r.error.code);return r.value;}
export class PrdSession {
 private sdk?:PrdSdk;private config?:C.PiLaunchConfig;private correlation?:C.PiCorrelation;private record?:C.SessionRecord;private manager?:SessionManager;private session?:AgentSession;private resources?:PrdResources;private dialogs?:PrdDialogHost;private sequence=0;private acknowledged=0;private queue=new Map<number,number>();private queueBytes=0;
 private sessionSnapshot:string|undefined;private submitted:{text:string;key:string|null;ordinal:number;persisted:boolean}|undefined;private starting=false;private closed=false;private closing?:Promise<void>;private turn:Promise<void>|undefined;private fatal:C.PrdErrorCode|undefined;private cancelled=false;private failureSent=false;private sawAgent=false;private assistantError=false;private readonly generations=new Set<string>();private readonly counts=new Map<string,number>();private liveAssistant?:{key:string;id:C.MessageId};
 constructor(readonly host:PrdSessionHost,readonly emit:(event:C.PiUtilityEvent)=>void){}
 private error(code:C.PrdErrorCode):C.PrdError{return {code,message:PRD_ERROR_MESSAGES[code],correlationId:this.correlation?.operationId??randomUUID() as C.OperationId} as C.PrdError;}
 private failure(code:C.PrdErrorCode):void{if(this.failureSent||!this.correlation)return;this.failureSent=true;this.post({type:'pi.failure',sessionId:this.record?.sessionId??null,error:this.error(code)},true);}
 private post(body:Body,reserved=false):void{
  requireStore(this.correlation,'INVALID_REQUEST');if(this.fatal&&!reserved)return;
  const sequence=this.sequence+1,value={contractVersion:1,...this.correlation,sequence,...body},parsed=parsePiEvent(value,this.correlation);requireStore(parsed,'CONFIG_INCOMPATIBLE');const bytes=Buffer.byteLength(JSON.stringify(parsed));
  if(!reserved&&(this.queue.size>=L.eventQueueItems||this.queueBytes+bytes>L.eventQueueBytes)){this.stop('LIMIT_EXCEEDED');throw new StoreFault('LIMIT_EXCEEDED');}
  this.sequence=sequence;if(!reserved){this.queue.set(sequence,bytes);this.queueBytes+=bytes;}this.emit(parsed);
 }
 private stop(code:C.PrdErrorCode):void{
  if(code==='INTERRUPTED')this.cancelled=true;else this.fatal??=code;
  queueMicrotask(()=>{void this.abortForeground().catch(()=>{this.fatal??='INTERRUPTED';});});
 }
 private association():void{
  requireStore(this.config&&this.record&&this.manager&&this.session,'LINK_CHANGED');verifiedDirectory(this.config.worktreeCwd);verifiedDirectory(this.config.appSessionDir);
  requireStore(process.cwd()===this.config.worktreeCwd&&this.session.sessionManager===this.manager&&this.manager.getSessionId()===this.record.sessionId&&this.manager.getCwd()===this.config.worktreeCwd&&this.manager.getSessionFile()===this.record.exactPath&&this.manager.getSessionDir()===this.config.appSessionDir,'LINK_CHANGED');
 }
 private async start(command:Extract<C.PiUtilityCommand,{type:'pi.start'}>):Promise<void>{
  requireStore(!this.config&&!this.starting&&!this.closed,'BUSY');this.starting=true;this.correlation={requestId:command.requestId,prdId:command.prdId,operationId:command.operationId,generationId:command.generationId};const config=command.config;
  requireStore(config.packagedEntry===this.host.packagedEntry&&config.packagedSdkRoot===this.host.packagedSdkRoot&&process.cwd()===config.worktreeCwd,'LINK_CHANGED');verifiedDirectory(config.worktreeCwd);verifiedDirectory(config.existingAgentDir);verifiedDirectory(config.appSessionDir);requireStore(path.basename(config.appSessionDir)===command.prdId,'LINK_CHANGED');
  // Fixed package identity before any executable SDK import; never resolve from the worktree/global CLI.
  const appRoot=path.resolve(config.packagedSdkRoot,'../../..');verifyPackagedFile(config.packagedEntry,appRoot);const manifest=path.join(config.packagedSdkRoot,'package.json');verifyPackagedFile(manifest,appRoot);requireStore(lstatSync(manifest).size<=64*1024,'CONFIG_INCOMPATIBLE');const metadata=JSON.parse(readFileSync(manifest,'utf8')) as Record<string,unknown>;requireStore(metadata.name==='@earendil-works/pi-coding-agent'&&metadata.version==='1.1.0','CONFIG_INCOMPATIBLE');const sdkEntry=path.join(config.packagedSdkRoot,'dist/index.js');verifyPackagedFile(sdkEntry,appRoot);const sdk=await import(/* webpackIgnore: true */pathToFileURL(sdkEntry).href) as PrdSdk;requireStore(sdk.VERSION==='1.1.0'&&realpathSync(sdk.getPackageDir())===config.packagedSdkRoot,'CONFIG_INCOMPATIBLE');this.config=config;this.sdk=sdk;
  if(command.session.mode==='create')this.manager=sdk.SessionManager.create(config.worktreeCwd,config.appSessionDir);
  else{
   const old=command.session.record;requireStore(old.prdId===command.prdId&&old.expectedCwd===config.worktreeCwd&&old.appSessionDir===config.appSessionDir,'LINK_CHANGED');
   if(command.session.mode==='resumeAllocated'){
    requireStore(old.state==='allocated'&&old.headerVersion===null&&old.lastPersistedEntryId===null,'LINK_CHANGED');const checked=take(inspectPrdSession(old));requireStore(checked.record.state==='allocated'&&checked.entries.length===0,'LINK_CHANGED');this.manager=sdk.SessionManager.create(config.worktreeCwd,config.appSessionDir,{id:old.sessionId});
   }else{const checked=take(inspectPrdSession(old));requireStore(checked.record.state==='materialized','SESSION_MISSING');this.record=checked.record;this.manager=sdk.SessionManager.open(old.exactPath,old.appSessionDir);}
  }
  const planned=this.manager.getSessionFile();requireStore(planned&&path.dirname(planned)===config.appSessionDir,'LINK_CHANGED');const sessionId=this.manager.getSessionId() as C.SessionId;
  if(command.session.mode!=='create')requireStore(sessionId===command.session.record.sessionId,'LINK_CHANGED');
  if(!this.record){this.record={prdId:command.prdId,sessionId,exactPath:planned as C.CanonicalPath,appSessionDir:config.appSessionDir,expectedCwd:config.worktreeCwd,state:'allocated',headerVersion:null,lastPersistedEntryId:null};this.post({type:'pi.sessionAllocated',record:this.record});}
  const checked=take(inspectPrdSession(this.record));this.sessionSnapshot=checked.snapshot;for(const entry of checked.entries)if(entry.type==='message'&&['user','assistant','custom'].includes(entry.message.role)){const key=prdMessageKey(entry.message);this.counts.set(key,(this.counts.get(key)??0)+1);}
  this.resources=take(await loadPrdResources(sdk,config));requireStore(!this.closed,'INTERRUPTED');this.dialogs=take(createPrdDialogs(event=>{requireStore(this.record,'LINK_CHANGED');this.post({type:'pi.projection',sessionId:this.record.sessionId,event:event as Extract<C.PiUtilityEvent,{type:'pi.projection'}>['event']});},code=>this.stop(code)));
  const created=await sdk.createAgentSession({cwd:config.worktreeCwd,agentDir:config.existingAgentDir,settingsManager:this.resources.settings,resourceLoader:this.resources.loader,sessionManager:this.manager});this.session=created.session;requireStore(!created.modelFallbackMessage,'CONFIG_INCOMPATIBLE');
  const provider=this.resources.settings.getDefaultProvider(),model=this.resources.settings.getDefaultModel();if(command.session.mode==='create'&&provider&&model)requireStore(this.session.model?.provider===provider&&this.session.model.id===model,'CONFIG_INCOMPATIBLE');this.session.subscribe(event=>this.event(event));
  const unsupported=async():Promise<never>=>{this.stop('CONFIG_INCOMPATIBLE');throw new StoreFault('CONFIG_INCOMPATIBLE');};
  await this.session.bindExtensions({mode:'rpc',uiContext:this.dialogs.ui,onError:()=>{if(!this.cancelled)this.stop('CONFIG_INCOMPATIBLE');},abortHandler:()=>this.stop('INTERRUPTED'),shutdownHandler:()=>{void this.close().catch(()=>{});},commandContextActions:{waitForIdle:()=>this.session!.waitForIdle(),newSession:unsupported,fork:unsupported,switchSession:unsupported,navigateTree:async(target,options)=>{const result=await this.session!.navigateTree(target,options);this.association();return result;},reload:async()=>{await this.session!.reload();this.association();}}});
  if(this.fatal)throw new StoreFault(this.fatal);if(this.cancelled)throw new StoreFault('INTERRUPTED');this.association();requireStore(!this.session.isStreaming&&!this.session.isBashRunning,'CONFIG_INCOMPATIBLE');this.reconcile();this.post({type:'pi.ready',sessionId,binding:this.resources.binding,capabilities:'normalConfigured'});
 }
 private event(event:AgentSessionEvent):void{
  try{
   if(this.closed||this.closing)return;this.association();requireStore(this.record,'LINK_CHANGED');const sessionId=this.record.sessionId;
   if(event.type==='agent_start')this.sawAgent=true;
   if(event.type==='message_end'&&event.message.role==='user')queueMicrotask(()=>{if(this.closed)return;try{this.persistSubmitted();}catch{this.stop('SESSION_CORRUPT');}});
   if(event.type==='message_start'&&['user','assistant','custom'].includes(event.message.role)){const key=prdMessageKey(event.message),ordinal=this.counts.get(key)??0;this.counts.set(key,ordinal+1);if(event.message.role==='user'&&this.submitted&&this.submitted.key===null){this.submitted.key=key;this.submitted.ordinal=ordinal;}if(event.message.role==='assistant')this.liveAssistant={key,id:prdMessageId(sessionId,key,ordinal)};}
   if(event.type==='message_update'&&event.assistantMessageEvent.type==='text_delta'){
    if(!this.liveAssistant){const key=prdMessageKey(event.message);this.liveAssistant={key,id:prdMessageId(sessionId,key,this.counts.get(key)??0)};}let chunk='',size=0;for(const character of event.assistantMessageEvent.delta){const n=Buffer.byteLength(character);if(size+n>L.deltaBytes){this.post({type:'pi.projection',sessionId,event:{type:'textDelta',messageId:this.liveAssistant.id,delta:chunk}});chunk='';size=0;}chunk+=character;size+=n;}if(chunk)this.post({type:'pi.projection',sessionId,event:{type:'textDelta',messageId:this.liveAssistant.id,delta:chunk}});
   }
   if(event.type==='message_end'&&event.message.role==='assistant'){
    this.assistantError=event.message.stopReason==='error'||event.message.stopReason==='aborted';if(!this.assistantError){requireStore(this.liveAssistant&&this.liveAssistant.key===prdMessageKey(event.message),'CONFIG_INCOMPATIBLE');const raw=event.message.content.filter(b=>b.type==='text').map(b=>b.text).join(''),bounded=boundedText(raw,L.historyTextBytes-2048);if(raw)this.post({type:'pi.projection',sessionId,event:{type:'textFinalized',messageId:this.liveAssistant.id,...bounded,durability:'unconfirmed'}});}
   }
   if(event.type==='tool_execution_start'&&(event.toolName==='write'||event.toolName==='edit')){
    const args=event.args as Record<string,unknown>,file=args?.path;if(typeof file==='string'){let relative=file;if(path.isAbsolute(file)){if(!this.config||!contained(this.config.worktreeCwd,file))return;relative=path.relative(this.config.worktreeCwd,file).split(path.sep).join('/');}if(validRelative(relative)&&/\.md$/i.test(relative)&&Buffer.byteLength(relative.split('/').at(-1)!)<=L.filenameBytes)this.post({type:'pi.documentHint',sessionId,relativePath:relative as C.RelativeMarkdownPath,source:'toolArgument'});}
   }
  }catch(error){this.stop(error instanceof StoreFault?error.code:'CONFIG_INCOMPATIBLE');}
 }
 private persistSubmitted():void{
  const submitted=this.submitted;if(!submitted?.key||submitted.persisted||!this.manager)return;this.association();
  const entry=this.manager.getEntries().filter(entry=>entry.type==='message'&&prdMessageKey(entry.message)===submitted.key)[submitted.ordinal];
  if(entry?.type==='message'&&entry.message.role==='user'){this.manager.appendCustomEntry('gabprd.writer-input.v1',{entryId:entry.id,text:submitted.text});submitted.persisted=true;}
 }
 private async abortForeground():Promise<void>{this.dialogs?.dismiss();if(!this.session)return;this.session.abortBash();await this.session.abort();await this.session.waitForIdle();while(this.session.isBashRunning)await new Promise(resolve=>setTimeout(resolve,20));}
 private reconcile():void{
  this.association();requireStore(this.record,'LINK_CHANGED');const observed=take(inspectPrdSession(this.record));if(observed.record.state==='materialized'&&observed.snapshot!==this.sessionSnapshot)requireStore(JSON.stringify(observed.entries.slice(1))===JSON.stringify(this.manager!.getEntries()),'LINK_CHANGED');this.record=observed.record;this.sessionSnapshot=observed.snapshot;this.post({type:'pi.reconciled',record:this.record,foregroundIdle:!this.session!.isStreaming&&!this.session!.isBashRunning,backgroundWriters:'unknown'},true);if(this.record.lastPersistedEntryId)this.post({type:'pi.projection',sessionId:this.record.sessionId,event:{type:'historyPersisted',lastPersistedEntryId:this.record.lastPersistedEntryId}},true);
 }
 private async runTurn(text:string):Promise<void>{
  let outcome:C.OperationOutcome='failed',disposition:'handled'|'queued'|'started'|undefined;
  try{await this.session!.prompt(text,{expandPromptTemplates:false,source:'interactive',preflightResult:d=>{disposition=d;if(this.fatal)throw new StoreFault(this.fatal);if(this.cancelled)throw new StoreFault('INTERRUPTED');}});await this.session!.waitForIdle();if(this.fatal)throw new StoreFault(this.fatal);if(this.cancelled)outcome='cancelled';else if(this.assistantError)throw new StoreFault('PROVIDER_UNAVAILABLE');else outcome=disposition==='handled'&&!this.sawAgent?'handledWithoutRun':'succeeded';}
  catch(error){if(this.cancelled&&!this.fatal)outcome='cancelled';else{const code=this.fatal??(error instanceof StoreFault?error.code:'PROVIDER_UNAVAILABLE');outcome=code==='LIMIT_EXCEEDED'||code==='INTERRUPTED'?'interrupted':'failed';this.failure(code);}await this.abortForeground();}
  try{this.persistSubmitted();this.submitted=undefined;this.reconcile();}catch(error){outcome='failed';this.failure(error instanceof StoreFault?error.code:'SESSION_CORRUPT');}
  this.dialogs?.dismiss();if(this.record)this.post({type:'pi.settled',sessionId:this.record.sessionId,outcome,foregroundIdle:true,backgroundWriters:'unknown'},true);
 }
 private async close():Promise<void>{
  if(this.closing)return this.closing;this.closing=(async()=>{if(this.turn)this.cancelled=true;await this.abortForeground();if(this.turn)await this.turn;if(this.session)try{this.reconcile();}catch(error){this.failure(error instanceof StoreFault?error.code:'SESSION_CORRUPT');}await this.session?.extensionRunner.emit({type:'session_shutdown',reason:'quit'});if(this.session)try{this.reconcile();}catch(error){this.failure(error instanceof StoreFault?error.code:'SESSION_CORRUPT');}this.session?.dispose();this.closed=true;if(this.correlation)this.post({type:'pi.closing',sessionId:this.record?.sessionId??null,abortAwaited:true},true);this.queue.clear();this.queueBytes=0;})();return this.closing;
 }
 async accept(value:unknown):Promise<PortResult<void>>{
  let admittedPrompt=false;
  try{
   const correlation=readPiCorrelation(value),command=correlation&&parsePiCommand(value,correlation);requireStore(command,'INVALID_REQUEST');
   if(command.type==='pi.start'){try{await this.start(command);return ok();}catch(error){const code=error instanceof StoreFault?error.code:'CONFIG_INCOMPATIBLE';this.failure(code);return {ok:false,error:this.error(code)};}finally{this.starting=false;}}
   requireStore(this.correlation&&command.prdId===this.correlation.prdId,'LINK_CHANGED');requireStore(!this.closed||command.type==='pi.close'||command.type==='pi.ack','INTERRUPTED');requireStore(command.sessionId===this.record?.sessionId||command.type==='pi.close'&&command.sessionId===null||command.type==='pi.ack'&&this.closed&&!this.record&&command.sessionId===null,'LINK_CHANGED');
   if(command.type==='pi.prompt'){
    requireStore(!this.turn&&!this.starting&&!this.closing,'BUSY');requireStore(this.session&&this.resources&&this.record,'LINK_CHANGED');requireStore(!this.generations.has(command.generationId),'INVALID_REQUEST');this.association();this.correlation=correlation;this.fatal=undefined;this.cancelled=false;this.failureSent=false;admittedPrompt=true;const observed=take(inspectPrdSession(this.record));if(observed.record.state==='materialized'&&observed.snapshot!==this.sessionSnapshot)requireStore(JSON.stringify(observed.entries.slice(1))===JSON.stringify(this.manager!.getEntries()),'LINK_CHANGED');this.record=observed.record;this.sessionSnapshot=observed.snapshot;let text:string;
    if(command.input.kind==='brainstorm'){const bound=this.resources.binding;let winningPath:string;try{winningPath=realpathSync(this.resources.loader.getSkills().skills.find(s=>s.name==='brainstorm')!.filePath);}catch{throw new StoreFault('SKILL_UNAVAILABLE');}requireStore(JSON.stringify(command.input.binding)===JSON.stringify(bound)&&winningPath===bound.sourcePath,'SKILL_UNAVAILABLE');const content=take(readBoundSkill(bound));requireStore(this.sdk&&!/[<>"\r\n]/.test(bound.sourcePath+bound.baseDir),'CONFIG_INCOMPATIBLE');const body=this.sdk.stripFrontmatter(content).trim();text=`<skill name="brainstorm" location="${bound.sourcePath}">\nReferences are relative to ${bound.baseDir}.\n\n${body}\n</skill>\n\n${command.input.idea}\n\nCreate the Markdown draft at this exact repository-relative path: ${JSON.stringify(command.input.relativePath)}. Creation date: ${command.input.creationDate}. Respect the selected folder convention: ${JSON.stringify(command.input.convention.relativeFolder)}. Ask the writer rather than guessing decisions.`;}
    else text=command.input.text;
    this.correlation=correlation;this.fatal=undefined;this.cancelled=false;this.failureSent=false;this.sawAgent=false;this.assistantError=false;this.generations.add(command.generationId);if(this.generations.size>L.replayRequests)this.generations.delete(this.generations.values().next().value!);this.submitted={text:command.input.kind==='brainstorm'?command.input.idea:command.input.text,key:null,ordinal:0,persisted:false};const task=this.runTurn(text);this.turn=task;void task.finally(()=>{if(this.turn===task)this.turn=undefined;}).catch(()=>this.failure('INTERNAL'));return ok();
   }
   requireStore(['requestId','operationId','generationId'].every(key=>command[key as keyof C.PiCorrelation]===this.correlation![key as keyof C.PiCorrelation]),'INVALID_REQUEST');
   if(command.type==='pi.ack'){requireStore(command.throughSequence>=this.acknowledged&&command.throughSequence<=this.sequence,'INVALID_REQUEST');this.acknowledged=command.throughSequence;for(const [sequence,bytes]of this.queue)if(sequence<=command.throughSequence){this.queue.delete(sequence);this.queueBytes-=bytes;}return ok();}
   if(command.type==='pi.answer'){requireStore(this.dialogs,'INVALID_REQUEST');return this.dialogs.answer(command.questionId,command.answer);}
   if(command.type==='pi.abort'){this.cancelled=true;await this.abortForeground();if(this.turn)await this.turn;return ok();}
   if(command.type==='pi.reconcile'){requireStore(!this.turn,'BUSY');this.reconcile();return ok();}
   if(command.type==='pi.close'){await this.close();return ok();}
   throw new StoreFault('INVALID_REQUEST');
  }catch(error){const code=error instanceof StoreFault?error.code:'CONFIG_INCOMPATIBLE';if(admittedPrompt&&!this.turn){this.failure(code);if(this.record)this.post({type:'pi.settled',sessionId:this.record.sessionId,outcome:'failed',foregroundIdle:true,backgroundWriters:'unknown'},true);}return {ok:false,error:this.error(code)};}
 }
}
