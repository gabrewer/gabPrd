/** Main-owned orchestration. DTOs never expose store records, executable paths or raw SDK errors. */
import path from 'node:path';
import {mkdirSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import type * as C from '../shared/prd-contracts';
import {PRD_LIMITS as L,PRD_ERROR_MESSAGES as M} from '../shared/prd-contracts';
import {parsePrdRequest,parsePrdEvent} from '../shared/prd-validation';
import {isTrustedCaller} from '../shared/bootstrap-validation';
import type {PrdServicePort,ProductCaller,PrdStorePort,PrdWorkspacePort,PrdDocumentsPort,PrdPiPort,ProductRoots,PortResult,StoreTransaction} from './prd-ports';
import {requireStore,StoreFault,storeFailure} from './prd-schema';
import {verifiedDirectory} from './prd-paths';
import {inspectPrdSession} from '../pi-utility/prd-history';
import {resolvePrdLocation} from './prd-location';
const id=<T extends string>()=>randomUUID() as T;
/** A listing/file label from the actual idea, never an extra writer-supplied title. */
function ideaLabel(idea:string,prdId:C.PrdId):string{
 const words=idea.normalize('NFC').replace(/[^\p{L}\p{N}_ -]+/gu,' ').replace(/\s+/gu,' ').trim();let label='';
 for(const character of words){if(Buffer.byteLength(label+character)>96)break;label+=character;}
 label=label.trim()||'PRD '+prdId.slice(0,8);
 return /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])$/i.test(label)?label+' PRD':label;
}
function take<T>(r:PortResult<T>):T{if(!r.ok)throw new StoreFault(r.error.code);return r.value;}
function fixed(code:C.PrdErrorCode,correlationId:C.RequestId|C.OperationId):C.PrdError{return {code,message:M[code],correlationId} as C.PrdError;}
export interface PrdServiceDependencies {readonly store:PrdStorePort;readonly roots:ProductRoots;readonly workspace:PrdWorkspacePort;readonly documents:PrdDocumentsPort}
export interface PrdServiceHost {
 readonly appPath:C.CanonicalPath;readonly agentDir:()=>Promise<C.CanonicalPath>;
 readonly pickRepository:()=>Promise<C.CanonicalPath|null>;readonly createPi:()=>PrdPiPort;
 readonly isLive:(caller:ProductCaller)=>boolean;
}
interface Actor {pi:PrdPiPort;correlation:C.PiCorrelation;session:C.SessionRecord|null;binding:C.SkillBinding|null;question:C.UiQuestion|null;answerPending:boolean;queue:Promise<void>;ready?:(()=>void)|undefined;failReady?:((error:StoreFault)=>void)|undefined;failure:C.PrdError|null;dispose:()=>void}
interface Subscription {caller:ProductCaller;prdId:C.PrdId}
interface Replay {digest:string;task:Promise<C.PrdResult>;bytes:number}
export class PrdService implements PrdServicePort {
 private readonly actors=new Map<C.PrdId,Actor>();private readonly lastOperation=new Map<C.PrdId,C.OperationId>();
 private readonly listeners=new Map<unknown,Set<(event:C.PrdEvent)=>void>>();private readonly subscriptions=new Map<C.SubscriptionId,Subscription>();
 private readonly replays=new Map<unknown,Map<string,Replay>>();private readonly leases=new Map<C.PrdId,string>();private readonly repositoryLeases=new Set<string>();
 private readonly background=new Set<Promise<void>>();private readonly closes=new Map<unknown,C.RequestId>();private closing=false;private pickerBusy=false;
 constructor(private readonly deps:PrdServiceDependencies|null,private readonly host:PrdServiceHost,interrupted:readonly C.OperationRecord[]=[]){for(const operation of interrupted)this.lastOperation.set(operation.prdId,operation.operationId);}
 private key(caller:ProductCaller){return caller.expected.mainFrame;}
 private authorize(caller:ProductCaller){requireStore(!caller.destroyed&&isTrustedCaller(caller.identity,caller.expected)&&this.host.isLive(caller),'UNAUTHORIZED_CALLER');}
 private read<T>(fn:(tx:StoreTransaction)=>T):T{requireStore(this.deps,'STORE_READ_ONLY');return take(this.deps.store.transaction(tx=>({ok:true,value:fn(tx)})));}
 private context(prdId:C.PrdId){return this.read(tx=>{const prd=tx.prd(prdId);requireStore(prd,'NOT_FOUND');const workspace=tx.workspace(prd.workspaceId);requireStore(workspace,'LINK_CHANGED');const repository=tx.repository(workspace.repositoryId);requireStore(repository,'LINK_CHANGED');return {prd,workspace,repository,document:prd.documentId?tx.document(prd.documentId):null,session:tx.session(prdId),conventions:tx.conventions(workspace.workspaceId)};});}
 private repositoryView(r:C.RepositoryRecord):C.RepositoryView{const name=path.basename(r.checkoutRoot);return {repositoryId:r.repositoryId,displayName:Buffer.byteLength(name)<=L.displayNameBytes?name:'Repository',verifiedDisplayPath:r.checkoutRoot};}
 private operationView(op:C.OperationRecord):C.OperationView{return {operationId:op.operationId,requestId:op.requestId,prdId:op.prdId,sessionId:op.sessionId,generationId:op.generationId,kind:op.kind,phase:op.phase,outcome:op.outcome,error:op.error} as C.OperationView;}
 private operation(prdId:C.PrdId):C.OperationRecord|null{return this.read(tx=>tx.latestOperation(prdId));}
 private snapshot(prdId:C.PrdId):C.PrdSnapshot{
  const {prd:p,workspace:w,repository:r,document:d,session:s,conventions}=this.context(prdId),op=this.operation(prdId),active=op&&op.phase!=='finished';
  const document:C.DocumentView=d?d.state==='available'?{state:'available',documentId:d.documentId,relativePath:d.relativePath,revision:d.revision.token,byteLength:d.revision.byteLength}:{state:d.state,documentId:d.documentId,relativePath:d.relativePath}:{state:'notRegistered'};
  const session:C.SessionView=s?{state:s.state,sessionId:s.sessionId,lastPersistedEntryId:s.lastPersistedEntryId}:{state:'notAllocated'};
  const convention=conventions.find(c=>c.conventionId===p.conventionId);
  return {prd:{prdId:p.prdId,workspaceId:w.workspaceId,repository:this.repositoryView(r),version:p.version,displayName:p.displayName,creationDate:p.creationDate,lifecycle:p.lifecycle,workspaceState:w.state,document,session,publication:'unavailable'},store:{state:'ready'},operation:op?this.operationView(op):null,pendingQuestion:this.actors.get(prdId)?.question??null,sequence:p.eventSequence,workspaceLocation:w.state==='worktreeCreated'||w.state==='ready'?{worktreePath:w.worktreePath,branchName:w.branchRef}:null,draftLocation:convention&&p.plannedRelativePath?{state:'resolved',convention:{conventionId:convention.conventionId,relativeFolder:convention.relativeFolder},relativePath:p.plannedRelativePath}:{state:'unresolved',choices:conventions.map(c=>({conventionId:c.conventionId,relativeFolder:c.relativeFolder}))},editorAccess:!d||d.state!=='available'?'recoveryReadOnly':active?'foregroundReadOnly':'editable',externalWriters:'unknown'};
 }
 private emit(prdId:C.PrdId,body:C.PrdEventBody){
  const p=this.read(tx=>{const old=tx.prd(prdId);requireStore(old&&old.eventSequence<Number.MAX_SAFE_INTEGER,'LIMIT_EXCEEDED');const next={...old,eventSequence:old.eventSequence+1 as C.EventSequence};tx.putPrd(next,old.version);return next;});
  const op=this.operation(prdId),actor=this.actors.get(prdId);
  if(body.type==='snapshot')body={type:'snapshot',snapshot:this.snapshot(prdId)};
  if(body.type==='documentChanged')body={...body,version:p.version};
  for(const [subscriptionId,subscription]of this.subscriptions){
   if(subscription.prdId!==prdId)continue;if(!this.host.isLive(subscription.caller)){this.subscriptions.delete(subscriptionId);continue;}
   const event=parsePrdEvent({contractVersion:1,subscriptionId,prdId,requestId:op?.requestId??null,sessionId:actor?.session?.sessionId??p.sessionId,operationId:op?.operationId??null,generationId:op?.generationId??null,sequence:p.eventSequence,version:p.version,...body});
   requireStore(event,'INTERNAL');for(const listener of this.listeners.get(this.key(subscription.caller))??[])try{listener(event);}catch{/* A renderer listener cannot change admission or persistence. */}
  }
 }
 private announce(prdId:C.PrdId){this.emit(prdId,{type:'snapshot',snapshot:this.snapshot(prdId)});}
 private lease(prdId:C.PrdId,repository:C.RepositoryRecord){const key=JSON.stringify(repository.commonGitIdentity);requireStore(!this.repositoryLeases.has(key)&&!this.leases.has(prdId),'BUSY');this.repositoryLeases.add(key);this.leases.set(prdId,key);}
 private release(prdId:C.PrdId){const key=this.leases.get(prdId);if(key)this.repositoryLeases.delete(key);this.leases.delete(prdId);}
 private schedule(work:()=>Promise<void>){const task=Promise.resolve().then(work);this.background.add(task);void task.finally(()=>this.background.delete(task)).catch(()=>{});}
 private admission(p:C.PrdRecord,request:C.PrdRequest,kind:C.OperationKind,revision:C.DocumentRevision|null):C.OperationRecord{
  const op:C.OperationRecord={operationId:id(),requestId:request.requestId,prdId:p.prdId,sessionId:p.sessionId,generationId:kind==='save'||kind==='reconcile'?null:id(),kind,phase:'starting',outcome:null,error:null,expectedVersion:p.version,expectedDocumentRevision:revision,lastSequence:0 as C.EventSequence,step:kind==='save'?'saveDocument':'allocateSession',stepState:'intent',recoveryDirectory:null};
  this.read(tx=>{requireStore(!tx.operationByRequest(request.requestId),'STALE_VERSION');const current=tx.prd(p.prdId);requireStore(current?.version===p.version,'STALE_VERSION');tx.putPrd({...current,version:id()},current.version);tx.putOperation(op);});this.lastOperation.set(p.prdId,op.operationId);return op;
 }
 private updateOperation(opId:C.OperationId,update:(old:Extract<C.OperationRecord,{outcome:null}>)=>C.OperationRecord){return this.read(tx=>{const old=tx.operation(opId);requireStore(old&&old.phase!=='finished','INTERRUPTED');const next=update(old),p=tx.prd(old.prdId);requireStore(p,'LINK_CHANGED');tx.putOperation(next);tx.putPrd({...p,version:id()},p.version);return next;});}
 private finish(prdId:C.PrdId,outcome:C.OperationOutcome,error?:C.PrdError){
  const op=this.operation(prdId);if(!op){this.release(prdId);return;}if(op.phase==='finished'){this.release(prdId);this.announce(prdId);return;}
  this.read(tx=>{const p=tx.prd(prdId),current=tx.operation(op.operationId);requireStore(p&&current&&current.phase!=='finished','LINK_CHANGED');
   const failed=outcome==='failed'||outcome==='interrupted';tx.putOperation({...current,phase:'finished',outcome,error:failed?error??fixed('INTERRUPTED',op.operationId):null,stepState:failed&&current.stepState==='intent'?'uncertain':failed?current.stepState:'effectVerified'} as C.OperationRecord);
   tx.putPrd({...p,version:id(),lifecycle:failed?outcome==='interrupted'?'interrupted':'failed':p.documentId?'draftAvailable':'brainstormActive'},p.version);
  });this.release(prdId);this.announce(prdId);
 }
 private async verify(prdId:C.PrdId){const ctx=this.context(prdId);take(await this.deps!.workspace.verify(ctx.repository,ctx.workspace));return this.context(prdId);}
 private reconcileSession(prdId:C.PrdId){
  const ctx=this.context(prdId);if(!ctx.session)return;const observed=inspectPrdSession(ctx.session);
  if(!observed.ok&&observed.error.code==='LIMIT_EXCEEDED')throw new StoreFault('LIMIT_EXCEEDED');
  const record=observed.ok?observed.value.record:{...ctx.session,state:observed.error.code==='SESSION_MISSING'?'missing':observed.error.code==='SESSION_CORRUPT'?'corrupt':'linkageMismatch'} as C.SessionRecord;
  if(JSON.stringify(record)!==JSON.stringify(ctx.session))this.read(tx=>{const p=tx.prd(prdId);requireStore(p,'LINK_CHANGED');tx.putSession(record);tx.putPrd({...p,version:id()},p.version);});
 }
 private async discover(prdId:C.PrdId){
  const ctx=await this.verify(prdId);
  if(ctx.document){take(await this.deps!.documents.reconcile(ctx.workspace,ctx.document));return;}
  const page=take(await this.deps!.documents.candidates(ctx.prd,ctx.workspace));
  if(page.coverage==='complete'&&page.items.length===1){const candidate=this.read(tx=>tx.candidates(prdId).find(c=>c.candidateId===page.items[0]!.candidateId));requireStore(candidate,'LINK_CHANGED');take(await this.deps!.documents.register(ctx.prd,ctx.workspace,candidate));}
 }
 private async handlePi(prdId:C.PrdId,actor:Actor,event:C.PiUtilityEvent){
  const op=this.operation(prdId);if(!op||op.phase==='finished'||op.operationId!==event.operationId||op.generationId!==event.generationId||op.requestId!==event.requestId)return;
  this.read(tx=>{const current=tx.operation(op.operationId);requireStore(current&&current.phase!=='finished'&&event.sequence>current.lastSequence,'INTERRUPTED');tx.putOperation({...current,lastSequence:event.sequence});});
  switch(event.type){
   case'pi.sessionAllocated':case'pi.reconciled':{
    const record=event.record,ctx=this.context(prdId);requireStore(record.prdId===prdId&&record.expectedCwd===ctx.workspace.worktreePath&&record.appSessionDir===path.join(this.deps!.roots.sessions,prdId),'LINK_CHANGED');
    this.read(tx=>{const p=tx.prd(prdId);requireStore(p&&(!p.sessionId||p.sessionId===record.sessionId),'LINK_CHANGED');tx.putSession(record);tx.putPrd({...p,sessionId:record.sessionId,version:id()},p.version);});actor.session=record;
    if(event.type==='pi.sessionAllocated')this.updateOperation(op.operationId,old=>({...old,sessionId:record.sessionId,step:'allocateSession',stepState:'effectVerified'}));
    this.announce(prdId);break;
   }
   case'pi.ready':this.read(tx=>tx.putSkill(prdId,event.binding));actor.binding=event.binding;actor.ready?.();break;
   case'pi.failure':{
    actor.failure=event.error;this.emit(prdId,{type:'error',error:event.error});
    if(actor.failReady)actor.failReady(new StoreFault(event.error.code));
    else this.schedule(async()=>{await actor.pi.shutdown();await actor.queue;const current=this.operation(prdId);if(current?.operationId===event.operationId&&current.phase!=='finished'){try{await this.discover(prdId);}catch{/* Preserve uncertain files; never claim rollback. */}this.finish(prdId,event.error.code==='INTERRUPTED'||event.error.code==='UTILITY_TIMEOUT'?'interrupted':'failed',event.error);}actor.dispose();if(this.actors.get(prdId)===actor)this.actors.delete(prdId);});
    break;
   }
   case'pi.projection':{
    const body=event.event;
    if(body.type==='uiQuestion'){actor.question=body.question;actor.answerPending=false;this.updateOperation(op.operationId,old=>({...old,phase:'awaitingUiResponse'}));}
    if(body.type==='uiQuestionDismissed'){actor.question=null;actor.answerPending=false;this.updateOperation(op.operationId,old=>({...old,phase:old.phase==='cancelling'?'cancelling':'running'}));}
    this.emit(prdId,body);if(body.type==='uiQuestion'||body.type==='uiQuestionDismissed')this.announce(prdId);break;
   }
   case'pi.settled':actor.question=null;this.updateOperation(op.operationId,old=>({...old,phase:'reconciling',step:'reconcile',stepState:'intent'}));this.announce(prdId);await this.discover(prdId);this.finish(prdId,event.outcome,actor.failure??undefined);break;
   case'pi.documentHint':break; // Full bounded filesystem verification, never tool prose, supplies authority.
   case'pi.closing':break;
  }
 }
 private async startActor(prdId:C.PrdId,mode:'create'|'open'|'resumeAllocated'):Promise<Actor>{
  requireStore(!this.closing,'INTERRUPTED');const ctx=await this.verify(prdId),op=this.operation(prdId);requireStore(op&&op.generationId,'LINK_CHANGED');
  const previous=this.actors.get(prdId);if(previous)return previous;
  const existingAgentDir=await this.host.agentDir();
  const directory=path.join(this.deps!.roots.sessions,prdId) as C.CanonicalPath;
  if(mode==='create'){this.updateOperation(op.operationId,old=>({...old,step:'allocateSession',stepState:'intent'}));verifiedDirectory(this.deps!.roots.sessions);mkdirSync(directory,{mode:0o700});}verifiedDirectory(directory);
  const config:C.PiLaunchConfig={packagedEntry:path.join(this.host.appPath,'.webpack/main/pi-utility.cjs') as C.CanonicalPath,packagedSdkRoot:path.join(this.host.appPath,'node_modules/@earendil-works/pi-coding-agent') as C.CanonicalPath,worktreeCwd:ctx.workspace.worktreePath,existingAgentDir,appSessionDir:directory,resourcePolicy:'normalWorktreeAndUser',capabilities:'normalConfigured'};
  requireStore(!this.closing,'INTERRUPTED');const correlation:C.PiCorrelation={requestId:op.requestId,prdId,operationId:op.operationId,generationId:op.generationId};
  const actor:Actor={pi:this.host.createPi(),correlation,session:ctx.session,binding:null,question:null,answerPending:false,queue:Promise.resolve(),failure:null,dispose:()=>{}};
  let readyResolve!:()=>void,readyReject!:(error:StoreFault)=>void;const ready=new Promise<void>((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});void ready.catch(()=>{});actor.ready=readyResolve;actor.failReady=readyReject;
  actor.dispose=actor.pi.onEvent(event=>{
   if(!(['requestId','prdId','operationId','generationId'] as const).every(key=>event[key]===actor.correlation[key]))return;
   const sessionId='record'in event?event.record.sessionId:event.sessionId;
   actor.queue=actor.queue.then(async()=>{try{await this.handlePi(prdId,actor,event);}finally{if(sessionId&&(['requestId','operationId','generationId'] as const).every(key=>event[key]===actor.correlation[key]))await actor.pi.send({contractVersion:1,...actor.correlation,type:'pi.ack',sessionId,throughSequence:event.sequence});}}).catch(error=>{const code=error instanceof StoreFault?error.code:'INTERNAL';actor.failure=fixed(code,actor.correlation.operationId);actor.failReady?.(new StoreFault(code));try{this.finish(prdId,'failed',actor.failure);}catch{/* Preserve existing state on teardown failure. */}});
  });this.actors.set(prdId,actor);
  const timer=setTimeout(()=>readyReject(new StoreFault('UTILITY_TIMEOUT')),L.startupTimeoutMs);
  try{
   take(await actor.pi.launch(config));const session:Extract<C.PiUtilityCommand,{type:'pi.start'}>['session']=mode==='create'?{mode:'create'}:(requireStore(ctx.session,'SESSION_MISSING'),{mode,record:mode==='open'?take(inspectPrdSession(ctx.session)).record:ctx.session});
   take(await actor.pi.send({contractVersion:1,...correlation,type:'pi.start',config,session}));await ready;await actor.queue;return actor;
  }catch(error){await actor.pi.shutdown();actor.dispose();this.actors.delete(prdId);throw error;}finally{clearTimeout(timer);actor.ready=undefined;actor.failReady=undefined;}
 }
 private async brainstorm(prdId:C.PrdId,mode:'create'|'resumeAllocated'='create'){
  const actor=await this.startActor(prdId,mode),ctx=this.context(prdId),op=this.operation(prdId),convention=ctx.conventions.find(c=>c.conventionId===ctx.prd.conventionId);
  requireStore(actor.binding&&actor.session&&op&&op.generationId&&ctx.prd.plannedRelativePath&&convention,'LINK_CHANGED');
  this.updateOperation(op.operationId,old=>({...old,phase:'running',step:'prompt',stepState:'intent'}));this.announce(prdId);
  take(await actor.pi.send({contractVersion:1,...actor.correlation,type:'pi.prompt',sessionId:actor.session.sessionId,input:{kind:'brainstorm',binding:actor.binding,idea:ctx.prd.initialIdea,convention:{conventionId:convention.conventionId,relativeFolder:convention.relativeFolder},relativePath:ctx.prd.plannedRelativePath,creationDate:ctx.prd.creationDate}}));
 }
 private async setup(prdId:C.PrdId,retry=false){
  try{
   requireStore(!this.closing,'INTERRUPTED');let ctx=this.context(prdId);const op=this.operation(prdId);requireStore(op,'LINK_CHANGED');
   take(await(retry?this.deps!.workspace.retry(ctx.repository,ctx.workspace,op):this.deps!.workspace.provision(ctx.repository,ctx.workspace,op)));
   requireStore(!this.closing,'INTERRUPTED');ctx=this.context(prdId);const conventions=take(await this.deps!.workspace.conventions(ctx.workspace));
   this.read(tx=>{const p=tx.prd(prdId);requireStore(p,'LINK_CHANGED');for(const convention of conventions)tx.putConvention({...convention,selected:false});tx.putPrd({...p,conventionId:null,plannedRelativePath:null,version:id()},p.version);});
   // Even one convention is shown explicitly, so its exact filename is visible before prompting.
   this.announce(prdId);
  }catch(error){this.finish(prdId,'failed',fixed(error instanceof StoreFault?error.code:'WORKSPACE_PARTIAL',this.operation(prdId)?.operationId??id<C.OperationId>()));}
 }
 private async execute(caller:ProductCaller,r:C.PrdRequest):Promise<unknown>{
  requireStore(this.deps,'STORE_READ_ONLY');const d=this.deps;
  if(r.command==='ListPrds')return take(d.store.list(r.cursor));
  if(r.command==='NativePickRepository'){requireStore(!this.pickerBusy,'BUSY');this.pickerBusy=true;try{const directory=await this.host.pickRepository();this.authorize(caller);if(directory===null)return {outcome:'cancelled'};const repository=take(await d.workspace.register(directory));return {outcome:'selected',repository:this.repositoryView(repository)};}finally{this.pickerBusy=false;}}
  if(r.command==='SetDefaultRepository'){
   if(r.repositoryId){const repo=this.read(tx=>tx.repository(r.repositoryId!));requireStore(repo,'NOT_FOUND');const verified=take(await d.workspace.register(repo.checkoutRoot));requireStore(verified.repositoryId===repo.repositoryId,'LINK_CHANGED');}
   return this.read(tx=>{const settings=tx.settings();requireStore(settings.version===r.expectedVersion,'STALE_VERSION');const repository=r.repositoryId?tx.repository(r.repositoryId):null;requireStore(!r.repositoryId||repository,'NOT_FOUND');const next={version:id<C.RecordVersion>(),repositoryId:r.repositoryId,lastRequestId:r.requestId};tx.putSettings(next,settings.version);return {version:next.version,repository:repository?this.repositoryView(repository):null};});
  }
  if(r.command==='CreatePrd'){
   const repository=this.read(tx=>tx.repository(r.repositoryId));requireStore(repository,'NOT_FOUND');const prdId=id<C.PrdId>(),workspaceId=id<C.WorkspaceId>(),operationId=id<C.OperationId>(),now=new Date(),date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-') as C.CreationDate;
   const displayName=ideaLabel(r.idea,prdId);take(resolvePrdLocation(displayName,date,{conventionId:id(),workspaceId,relativeFolder:'docs/design',source:'fallback',selected:false}));this.lease(prdId,repository);
   try{
    const workspace=take(await d.workspace.plan(repository,prdId,workspaceId,operationId,r.idea));this.authorize(caller);
    const prd:C.PrdRecord={prdId,workspaceId,displayName,creationDate:date,version:id(),lifecycle:'createPending',initialIdea:r.idea,conventionId:null,plannedRelativePath:null,eventSequence:0 as C.EventSequence,documentId:null,sessionId:null};
    const operation:C.OperationRecord={operationId,requestId:r.requestId,prdId,sessionId:null,generationId:id(),kind:'create',phase:'starting',outcome:null,error:null,expectedVersion:prd.version,expectedDocumentRevision:null,lastSequence:0 as C.EventSequence,step:'fetchBase',stepState:'intent',recoveryDirectory:null};
    this.read(tx=>{requireStore(!tx.operationByRequest(r.requestId),'STALE_VERSION');tx.putPrd(prd,null);tx.putWorkspace(workspace);tx.putOperation(operation);});this.lastOperation.set(prdId,operationId);const value={snapshot:this.snapshot(prdId),operation:this.operationView(operation)};this.schedule(()=>this.setup(prdId));return value;
   }catch(error){this.release(prdId);throw error;}
  }
  const ctx=this.context(r.prdId);
  if('expectedVersion'in r)requireStore(ctx.prd.version===r.expectedVersion,'STALE_VERSION');
  if(r.command==='OpenPrd'){
   const existing=this.subscriptions.get(r.subscriptionId);requireStore(existing||this.subscriptions.size<L.eventQueueItems,'LIMIT_EXCEEDED');requireStore(!existing||(existing.prdId===r.prdId&&this.key(existing.caller)===this.key(caller)),'INVALID_REQUEST');this.subscriptions.set(r.subscriptionId,{caller,prdId:r.prdId});
   if(ctx.workspace.state==='ready'){await this.verify(r.prdId);if(ctx.document)take(await d.documents.reconcile(ctx.workspace,ctx.document));}
   if(ctx.session&&ctx.session.state!=='allocated'&&!this.actors.has(r.prdId)){
    take(inspectPrdSession(ctx.session));const current=this.context(r.prdId);this.lease(r.prdId,current.repository);const op=this.admission(current.prd,r,'reopen',current.document?.revision.token??null);
    try{await this.startActor(r.prdId,'open');this.finish(r.prdId,'succeeded');}catch(error){this.finish(r.prdId,'failed',fixed(error instanceof StoreFault?error.code:'CONFIG_INCOMPATIBLE',op.operationId));throw error;}
   }
   return {subscriptionId:r.subscriptionId,snapshot:this.snapshot(r.prdId)};
  }
  if(r.command==='ReconcilePrd'){if(ctx.workspace.state==='ready'){await this.verify(r.prdId);if(ctx.document)take(await d.documents.reconcile(ctx.workspace,ctx.document));this.reconcileSession(r.prdId);}return this.snapshot(r.prdId);}
  if(r.command==='ReadHistory'){requireStore(ctx.session&&ctx.session.sessionId===r.sessionId,'LINK_CHANGED');await this.verify(r.prdId);return take(await(this.actors.get(r.prdId)?.pi??this.host.createPi()).history(ctx.session,r.cursor));}
  if(r.command==='ReadDocument'){requireStore(ctx.document&&ctx.document.documentId===r.documentId,'LINK_CHANGED');return take(await d.documents.read(ctx.workspace,ctx.document));}
  if(r.command==='ListDraftCandidates'){requireStore(r.cursor===null,'INVALID_REQUEST');return take(await d.documents.candidates(ctx.prd,ctx.workspace));}
  if(r.command==='SelectDraft'){
   if(r.selection==='convention'){
    requireStore(!ctx.document&&!ctx.session&&ctx.prd.conventionId===null&&ctx.prd.plannedRelativePath===null,'LINK_CHANGED');const convention=ctx.conventions.find(c=>c.conventionId===r.conventionId);requireStore(convention,'LINK_CHANGED');const relativePath=take(d.workspace.location(ctx.prd.displayName,ctx.prd.creationDate,convention));
    const existing=this.operation(r.prdId);requireStore(existing&&existing.phase!=='finished','INTERRUPTED');
    take(await d.documents.inventory({...ctx.prd,conventionId:convention.conventionId,plannedRelativePath:relativePath},ctx.workspace));
    const operation:C.OperationRecord={operationId:id(),requestId:r.requestId,prdId:r.prdId,sessionId:null,generationId:id(),kind:'brainstorm',phase:'starting',outcome:null,error:null,expectedVersion:r.expectedVersion,expectedDocumentRevision:null,lastSequence:0 as C.EventSequence,step:'allocateSession',stepState:'intent',recoveryDirectory:null};
    this.read(tx=>{const p=tx.prd(r.prdId),setup=tx.operation(existing.operationId);requireStore(p?.version===r.expectedVersion&&setup&&setup.phase!=='finished','STALE_VERSION');requireStore(!tx.operationByRequest(r.requestId),'STALE_VERSION');tx.putOperation({...setup,phase:'finished',outcome:'succeeded',error:null,stepState:'effectVerified'});for(const c of ctx.conventions)tx.putConvention({...c,selected:c.conventionId===r.conventionId});tx.putPrd({...p,version:id(),lifecycle:'brainstormActive',conventionId:r.conventionId,plannedRelativePath:relativePath},p.version);tx.putOperation(operation);});
    this.lastOperation.set(r.prdId,operation.operationId);const value={snapshot:this.snapshot(r.prdId),document:null,operation:this.operationView(operation)};
    this.schedule(async()=>{try{await this.brainstorm(r.prdId);}catch(error){this.finish(r.prdId,'failed',fixed(error instanceof StoreFault?error.code:'CONFIG_INCOMPATIBLE',operation.operationId));}});return value;
   }
   const candidate=this.read(tx=>tx.candidates(r.prdId).find(c=>c.candidateId===r.candidateId));requireStore(candidate&&candidate.revision===r.expectedDocumentRevision,'REVISION_CONFLICT');const document=take(await d.documents.register(ctx.prd,ctx.workspace,candidate)),body=take(await d.documents.read(ctx.workspace,document));this.announce(r.prdId);return {snapshot:this.snapshot(r.prdId),document:body,operation:null};
  }
  if(r.command==='SaveDocument'){
   requireStore(ctx.document?.documentId===r.documentId&&ctx.document.revision.token===r.expectedDocumentRevision,'REVISION_CONFLICT');await this.verify(r.prdId);this.lease(r.prdId,ctx.repository);
   let op:C.OperationRecord|undefined;try{op=this.admission(ctx.prd,r,'save',r.expectedDocumentRevision);const current=this.context(r.prdId),saved=take(await d.documents.save({prd:current.prd,workspace:current.workspace,document:current.document!,operation:op,text:r.text}));this.finish(r.prdId,'succeeded');return {snapshot:this.snapshot(r.prdId),document:saved.body};}catch(error){if(op)this.finish(r.prdId,'failed',fixed(error instanceof StoreFault?error.code:'INTERNAL',op.operationId));else this.release(r.prdId);throw error;}
  }
  if(r.command==='SendTurn'){
   requireStore(ctx.session?.sessionId===r.sessionId,'LINK_CHANGED');requireStore(ctx.session.state==='materialized','SESSION_MISSING');take(inspectPrdSession(ctx.session));await this.verify(r.prdId);
   if(ctx.document){requireStore(ctx.document.state==='available'&&ctx.document.revision.token===r.expectedDocumentRevision,'REVISION_CONFLICT');const body=take(await d.documents.read(ctx.workspace,ctx.document));requireStore(body.revision===r.expectedDocumentRevision,'REVISION_CONFLICT');}else requireStore(r.expectedDocumentRevision===null,'REVISION_CONFLICT');
   const current=this.context(r.prdId);requireStore(current.prd.version===r.expectedVersion,'STALE_VERSION');this.lease(r.prdId,ctx.repository);let op:C.OperationRecord|undefined;
   try{
    op=this.admission(current.prd,r,r.intent==='reviseDocument'?'piRevision':'send',r.expectedDocumentRevision);let actor=this.actors.get(r.prdId);if(!actor){requireStore(ctx.session.state==='materialized','SESSION_MISSING');actor=await this.startActor(r.prdId,'open');}
    requireStore(op.generationId&&actor.session,'LINK_CHANGED');actor.correlation={requestId:op.requestId,prdId:r.prdId,operationId:op.operationId,generationId:op.generationId};actor.failure=null;
    this.updateOperation(op.operationId,old=>({...old,phase:'running',step:'prompt',stepState:'intent'}));
    take(await actor.pi.send({contractVersion:1,...actor.correlation,type:'pi.prompt',sessionId:r.sessionId,input:{kind:'literalTurn',text:r.text}}));this.announce(r.prdId);return {snapshot:this.snapshot(r.prdId),operation:this.operationView(this.operation(r.prdId)!)};
   }catch(error){if(op)this.finish(r.prdId,'failed',fixed(error instanceof StoreFault?error.code:'INTERNAL',op.operationId));else this.release(r.prdId);throw error;}
  }
  if(r.command==='AnswerUiQuestion'){
   const actor=this.actors.get(r.prdId),op=this.operation(r.prdId);requireStore(actor&&op&&op.phase==='awaitingUiResponse'&&!actor.answerPending&&actor.question?.questionId===r.questionId&&actor.session?.sessionId===r.sessionId&&op.operationId===r.operationId&&op.generationId===r.generationId,'INVALID_REQUEST');const question=actor.question;requireStore(question.deadline===null||Date.now()<Date.parse(question.deadline),'INVALID_REQUEST');if(r.answer.kind!=='cancel'){requireStore(r.answer.kind===question.kind,'INVALID_REQUEST');if(r.answer.kind==='select'){const optionId=r.answer.optionId;requireStore(question.kind==='select'&&question.options.some(option=>option.optionId===optionId),'INVALID_REQUEST');}}actor.answerPending=true;try{take(await actor.pi.send({contractVersion:1,...actor.correlation,type:'pi.answer',sessionId:r.sessionId,questionId:r.questionId,answer:r.answer}));}catch(error){actor.answerPending=false;throw error;}return {outcome:r.answer.kind==='cancel'?'cancelRequested':'answered'};
  }
  if(r.command==='CancelOperation'){
   const op=this.read(tx=>tx.operation(r.operationId));requireStore(op?.prdId===r.prdId,'LINK_CHANGED');if(op.phase==='finished')return {outcome:'alreadyFinished',operation:this.operationView(op)};
   const actor=this.actors.get(r.prdId);if(actor){if(actor.question){const questionId=actor.question.questionId;actor.question=null;actor.answerPending=true;this.emit(r.prdId,{type:'uiQuestionDismissed',questionId,reason:'cancelled'});}this.updateOperation(op.operationId,old=>({...old,phase:'cancelling'}));this.announce(r.prdId);if(actor.session)take(await actor.pi.send({contractVersion:1,...actor.correlation,type:'pi.abort',sessionId:actor.session.sessionId}));else{actor.failReady?.(new StoreFault('INTERRUPTED'));await actor.pi.shutdown();actor.dispose();this.actors.delete(r.prdId);this.finish(r.prdId,'cancelled');}}else if(ctx.workspace.state==='ready')this.finish(r.prdId,'cancelled');else throw new StoreFault('BUSY');
   return {outcome:'cancelRequested',operation:this.operationView(this.operation(r.prdId)!)};
  }
  if(r.command==='RetryWorkspaceSetup'){
   const previous=this.operation(r.prdId);requireStore(previous&&previous.operationId===r.setupOperationId,'LINK_CHANGED');
   const allocatedStartup=previous.kind==='brainstorm'&&ctx.session?.state==='allocated'&&previous.step==='allocateSession'&&previous.stepState==='effectVerified';
   requireStore(previous.kind==='create'||previous.kind==='workspaceRetry'||allocatedStartup,'LINK_CHANGED');requireStore(previous.phase==='finished'&&(previous.outcome==='failed'||previous.outcome==='interrupted'||previous.outcome==='cancelled'),'BUSY');requireStore(!ctx.document&&(!ctx.session||ctx.session.state==='allocated'),'SESSION_MISSING');if(ctx.session)requireStore(previous.step==='allocateSession'&&previous.stepState==='effectVerified','SESSION_MISSING');this.lease(r.prdId,ctx.repository);
   try{const op=this.admission(ctx.prd,r,'workspaceRetry',null);const value={snapshot:this.snapshot(r.prdId),operation:this.operationView(op)};
    this.schedule(async()=>{try{if(ctx.workspace.state==='ready'&&ctx.session){requireStore(ctx.session.state==='allocated'&&previous.step==='allocateSession'&&previous.stepState==='effectVerified','SESSION_MISSING');await this.brainstorm(r.prdId,'resumeAllocated');}else await this.setup(r.prdId,true);}catch(error){this.finish(r.prdId,'failed',fixed(error instanceof StoreFault?error.code:'WORKSPACE_PARTIAL',op.operationId));}});return value;
   }catch(error){this.release(r.prdId);throw error;}
  }
  throw new StoreFault('INVALID_REQUEST');
 }
 async request<K extends C.CommandName>(caller:ProductCaller,input:C.PrdRequest<K>):Promise<C.PrdResult<K>>{
  const request=parsePrdRequest(input);if(!request)return {contractVersion:1,ok:false,command:null,requestId:null,error:fixed('INVALID_REQUEST',id<C.RequestId>())} as C.PrdResult<K>;
  try{this.authorize(caller);requireStore(!this.closing,'INTERRUPTED');}catch(error){return {contractVersion:1,ok:false,command:request.command,requestId:request.requestId,error:fixed(error instanceof StoreFault?error.code:'INTERNAL',request.requestId)} as C.PrdResult<K>;}
  const key=this.key(caller),cache=this.replays.get(key)??new Map<string,Replay>();this.replays.set(key,cache);const digest=createHash('sha256').update(JSON.stringify(request)).digest('hex'),existing=cache.get(request.requestId);
  if(existing){if(existing.digest===digest)return existing.task as Promise<C.PrdResult<K>>;return {contractVersion:1,ok:false,command:request.command,requestId:request.requestId,error:fixed('INVALID_REQUEST',request.requestId)} as C.PrdResult<K>;}
  if(cache.size>=L.replayRequests){const settled=[...cache].find(([,entry])=>entry.bytes>0);if(settled)cache.delete(settled[0]);else return {contractVersion:1,ok:false,command:request.command,requestId:request.requestId,error:fixed('BUSY',request.requestId)} as C.PrdResult<K>;}
  const task=Promise.resolve().then(async():Promise<C.PrdResult>=>{try{return {contractVersion:1,ok:true,command:request.command,requestId:request.requestId,value:await this.execute(caller,request)} as C.PrdResult;}catch(error){return {contractVersion:1,ok:false,command:request.command,requestId:request.requestId,error:fixed(error instanceof StoreFault?error.code:'INTERNAL',request.requestId)};}});
  const replay:Replay={digest,task,bytes:0};cache.set(request.requestId,replay);
  void task.then(result=>{replay.bytes=Buffer.byteLength(JSON.stringify(result));let bytes=[...cache.values()].reduce((sum,r)=>sum+r.bytes,0);while(cache.size>L.replayRequests||bytes>L.eventQueueBytes){const oldest=cache.keys().next().value;if(oldest===undefined)break;bytes-=cache.get(oldest)!.bytes;cache.delete(oldest);}});return task as Promise<C.PrdResult<K>>;
 }
 attach(caller:ProductCaller,listener:(event:C.PrdEvent)=>void):()=>void{this.authorize(caller);const key=this.key(caller),set=this.listeners.get(key)??new Set();set.add(listener);this.listeners.set(key,set);return ()=>{set.delete(listener);if(set.size===0){this.listeners.delete(key);this.replays.delete(key);for(const [id,sub]of this.subscriptions)if(this.key(sub.caller)===key)this.subscriptions.delete(id);}};}
 detach(caller:ProductCaller,request:C.DetachSubscriptionRequest){this.authorize(caller);const sub=this.subscriptions.get(request.subscriptionId);requireStore(!sub||this.key(sub.caller)===this.key(caller),'UNAUTHORIZED_CALLER');this.subscriptions.delete(request.subscriptionId);}
 beginClose(caller:ProductCaller):C.CloseRequest{this.authorize(caller);const closeId=id<C.RequestId>();this.closes.set(this.key(caller),closeId);return {contractVersion:1,closeId};}
 acknowledgeClose(caller:ProductCaller,response:C.CloseResponse):PortResult<void>{try{this.authorize(caller);requireStore(this.closes.get(this.key(caller))===response.closeId,'INVALID_REQUEST');this.closes.delete(this.key(caller));return {ok:true,value:undefined};}catch(error){return storeFailure(error instanceof StoreFault?error.code:'INTERNAL');}}
 async shutdown():Promise<PortResult<void>>{
  this.closing=true;let timer:ReturnType<typeof setTimeout>|undefined,expired=false;let phase='pending';const started=Date.now();
  try{
   await Promise.race([(async()=>{phase='admitted-work';await Promise.all([...this.background]);requireStore(!expired,'UTILITY_TIMEOUT');for(const [prdId,actor]of this.actors){phase='pi-exit';take(await actor.pi.shutdown());phase='event-drain';await actor.queue;requireStore(!expired,'UTILITY_TIMEOUT');actor.dispose();phase='workspace-check';await this.verify(prdId);phase='session-reconcile';this.reconcileSession(prdId);const ctx=this.context(prdId);phase='document-reconcile';if(ctx.document)take(await this.deps!.documents.reconcile(ctx.workspace,ctx.document));const op=this.operation(prdId);if(op&&op.phase!=='finished')this.finish(prdId,'interrupted',fixed('INTERRUPTED',op.operationId));}requireStore(!expired,'UTILITY_TIMEOUT');phase='store-close';await this.deps?.store.close();})(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new StoreFault('UTILITY_TIMEOUT'));},L.shutdownTimeoutMs);})]);
   this.listeners.clear();this.subscriptions.clear();return {ok:true,value:undefined};
  }catch(error){const code=error instanceof StoreFault?error.code:'INTERNAL';console.error('PRD shutdown failed',phase,code,Date.now()-started);return storeFailure(code);}finally{if(timer!==undefined)clearTimeout(timer);}
 }
}
