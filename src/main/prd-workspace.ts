/** Main-owned Git setup only. No app commit/push/publication, reset, overlays or cleanup. */
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {constants,openSync,readSync,closeSync,fstatSync,readFileSync,mkdirSync,realpathSync} from 'node:fs';
import type * as C from '../shared/prd-contracts';
import {PRD_ERROR_MESSAGES} from '../shared/prd-contracts';
import type {PrdWorkspacePort,PrdStorePort,ProductRoots,PortResult,WorkspaceStepResult,StoreTransaction} from './prd-ports';
import {TABLES,encode,StoreFault,requireStore,storeFailure} from './prd-schema';
import type {Table} from './prd-schema';
import {PrdPaths,canonicalStat,verifiedDirectory,sameIdentity,identityOf,contained} from './prd-paths';
import {resolvePrdLocation,discoverPrdConventions,stablePrdId,pathExists,verifyFutureDirectory} from './prd-location';
const activeRepositories=new Set<string>();
/** Keep configured authentication, but never inherit authority over another repository. */
function gitEnvironment():NodeJS.ProcessEnv{
 const context=/^(?:GIT_(?:DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|NAMESPACE|PREFIX|INTERNAL_SUPER_PREFIX|IMPLICIT_WORK_TREE|GRAFT_FILE|SHALLOW_FILE|REPLACE_REF_BASE|CONFIG|CONFIG_PARAMETERS|CONFIG_COUNT)|GIT_CONFIG_(?:KEY|VALUE)_\d+)$/i;
 return {...Object.fromEntries(Object.entries(process.env).filter(([key])=>!context.test(key))),GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never',GIT_NO_REPLACE_OBJECTS:'1'};
}
const hash=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
const token=<T extends string>()=>randomUUID() as T;
const success=<T>(value:T):PortResult<T>=>({ok:true,value});
function take<T>(result:PortResult<T>):T{if(!result.ok)throw new StoreFault(result.error.code);return result.value;}
function equal(table:Table,a:unknown,b:unknown){requireStore(a&&b&&JSON.stringify(encode(table,a))===JSON.stringify(encode(table,b)),'STALE_VERSION');}
function fixedFailure<T>(error:unknown):PortResult<T>{return storeFailure(error instanceof StoreFault?error.code:'WORKSPACE_PARTIAL');}
function gitPath(raw:string):C.CanonicalPath{
 const file=raw.replaceAll('/',path.sep);requireStore(path.isAbsolute(file)&&path.resolve(file)===file,'LINK_CHANGED');canonicalStat(file);return file as C.CanonicalPath;
}
function fileHash(file:string):string{
 if(!pathExists(file))return hash(Buffer.alloc(0));const before=canonicalStat(file);requireStore(before.isFile(),'PATH_INVALID');const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW),digest=createHash('sha256'),buffer=Buffer.alloc(64*1024);
 try{requireStore(sameIdentity(identityOf(before),identityOf(fstatSync(fd,{bigint:true}))),'LINK_CHANGED');let position=0;while(BigInt(position)<before.size){const count=readSync(fd,buffer,0,Number(before.size-BigInt(position)>65536n?65536n:before.size-BigInt(position)),position);requireStore(count>0,'LINK_CHANGED');digest.update(buffer.subarray(0,count));position+=count;}const after=canonicalStat(file);requireStore(before.size===after.size&&before.mtimeNs===after.mtimeNs&&sameIdentity(identityOf(before),identityOf(after)),'LINK_CHANGED');return digest.digest('hex');}finally{closeSync(fd);}
}
interface OriginalSnapshot {head:C.GitSha;branch:string|null;index:string;tracked:string;status:string}
interface RegistryEntry {worktree:string;branch:string|null;head:string|null}
export class PrdWorkspace implements PrdWorkspacePort {
 private readonly paths=new PrdPaths();
 constructor(private readonly store:PrdStorePort,private readonly roots:ProductRoots){}
 private git(cwd:string,args:readonly string[],code:C.PrdErrorCode='LINK_CHANGED',hooks?:string):Promise<string>{
  return new Promise((resolve,reject)=>{
   const config=['-c','core.fsmonitor=false','-c','gc.auto=0','-c','maintenance.auto=false'];if(hooks)config.push('-c','core.hooksPath='+hooks);
   execFile('git',[...config,'-C',cwd,...args],{shell:false,windowsHide:true,timeout:60000,maxBuffer:2*1024*1024,encoding:'utf8',env:gitEnvironment()},(error,stdout)=>{if(error)reject(new StoreFault(code));else resolve(stdout.trimEnd());});
  });
 }
 private read<T>(work:(tx:StoreTransaction)=>T):T{return take(this.store.transaction(tx=>success(work(tx))));}
 private async repositoryFacts(checkout:C.CanonicalPath):Promise<Omit<C.RepositoryRecord,'repositoryId'>>{
  const checkoutIdentity=verifiedDirectory(checkout);requireStore(checkout!==this.roots.marker.canonicalRoot&&!contained(checkout,this.roots.marker.canonicalRoot)&&!contained(this.roots.marker.canonicalRoot,checkout),'PATH_INVALID');
  requireStore(await this.git(checkout,['rev-parse','--is-bare-repository'])==='false','PATH_INVALID');const top=gitPath(await this.git(checkout,['rev-parse','--show-toplevel']));requireStore(top===checkout,'PATH_INVALID');const commonGitDir=gitPath(await this.git(checkout,['rev-parse','--path-format=absolute','--git-common-dir'])),commonGitIdentity=verifiedDirectory(commonGitDir),origin=await this.git(checkout,['remote','get-url','origin']);requireStore(origin.length>0,'BASE_UNAVAILABLE');const head=await this.git(checkout,['rev-parse','--verify','HEAD^{commit}']);requireStore(/^[a-f0-9]{40}$/.test(head),'CONFIG_INCOMPATIBLE');requireStore(sameIdentity(checkoutIdentity,verifiedDirectory(checkout)),'LINK_CHANGED');
  return {checkoutRoot:checkout,commonGitDir,checkoutIdentity,commonGitIdentity,originFingerprint:hash(origin) as C.RepositoryRecord['originFingerprint']};
 }
 private async verifyRepository(repository:C.RepositoryRecord):Promise<void>{encode(TABLES.repositories,repository);const current=await this.repositoryFacts(repository.checkoutRoot);equal(TABLES.repositories,{...current,repositoryId:repository.repositoryId},repository);}
 async register(checkout:C.CanonicalPath):Promise<PortResult<C.RepositoryRecord>>{
  try{
   const facts=await this.repositoryFacts(checkout);const remote=await this.git(checkout,['ls-remote','--exit-code','--heads','origin','refs/heads/main'],'BASE_UNAVAILABLE');requireStore(/^[a-f0-9]{40}\s+refs\/heads\/main$/.test(remote),'BASE_UNAVAILABLE');
   const repository:C.RepositoryRecord={repositoryId:stablePrdId<C.RepositoryId>('repository',facts.checkoutRoot,facts.commonGitDir,JSON.stringify(facts.checkoutIdentity),JSON.stringify(facts.commonGitIdentity),facts.originFingerprint),...facts};await this.verifyRepository(repository);
   take(this.store.transaction(tx=>{const existing=tx.repository(repository.repositoryId);if(existing)equal(TABLES.repositories,existing,repository);else tx.putRepository(repository);return success(true);}));return success(repository);
  }catch(error){return fixedFailure(error);}
 }
 private async original(repository:C.RepositoryRecord):Promise<OriginalSnapshot>{
  const cwd=repository.checkoutRoot,head=await this.git(cwd,['rev-parse','--verify','HEAD^{commit}']),branch=await this.git(cwd,['rev-parse','--symbolic-full-name','HEAD']),indexRaw=await this.git(cwd,['rev-parse','--path-format=absolute','--git-path','index']);requireStore(/^[a-f0-9]{40}$/.test(head),'LINK_CHANGED');const indexPath=indexRaw.replaceAll('/',path.sep);requireStore(path.isAbsolute(indexPath)&&path.resolve(indexPath)===indexPath,'LINK_CHANGED');
  return {head:head as C.GitSha,branch:branch==='HEAD'?null:branch,index:fileHash(indexPath),tracked:hash(await this.git(cwd,['diff','--binary','--no-ext-diff','--no-textconv','HEAD','--'])),status:hash(await this.git(cwd,['status','--porcelain=v1','--untracked-files=all']))};
 }
 private async preserve(repository:C.RepositoryRecord,before:OriginalSnapshot){requireStore(JSON.stringify(await this.original(repository))===JSON.stringify(before),'LINK_CHANGED');await this.verifyRepository(repository);}
 private load(repository:C.RepositoryRecord,workspace:C.WorkspaceRecord,operation?:C.OperationRecord){
  encode(TABLES.repositories,repository);encode(TABLES.workspaces,workspace);if(operation)encode(TABLES.operations,operation);
  this.read(tx=>{equal(TABLES.repositories,tx.repository(repository.repositoryId),repository);equal(TABLES.workspaces,tx.workspace(workspace.workspaceId),workspace);requireStore(repository.repositoryId===workspace.repositoryId,'LINK_CHANGED');if(operation){equal(TABLES.operations,tx.operation(operation.operationId),operation);const p=tx.prd(operation.prdId);requireStore(p&&p.workspaceId===workspace.workspaceId,'LINK_CHANGED');}});
  requireStore(workspace.worktreePath===path.join(this.roots.workspaces,workspace.workspaceId),'PATH_INVALID');verifiedDirectory(this.roots.workspaces);
 }
 private async ref(repository:C.RepositoryRecord,branch:string):Promise<string|null>{try{return await this.git(repository.checkoutRoot,['rev-parse','--verify','--quiet','refs/heads/'+branch]);}catch{return null;}}
 private async registry(repository:C.RepositoryRecord):Promise<RegistryEntry[]>{
  const data=await this.git(repository.checkoutRoot,['worktree','list','--porcelain','-z']),entries:RegistryEntry[]=[];let current:RegistryEntry|undefined;
  for(const field of data.split('\0')){if(field.startsWith('worktree ')){if(current)entries.push(current);current={worktree:field.slice(9).replaceAll('/',path.sep),branch:null,head:null};}else if(current&&field.startsWith('branch '))current.branch=field.slice(7);else if(current&&field.startsWith('HEAD '))current.head=field.slice(5);}
  if(current)entries.push(current);return entries;
 }
 private async inspectWorkspace(repository:C.RepositoryRecord,workspace:C.WorkspaceRecord,exactBase=false):Promise<void>{
  await this.verifyRepository(repository);take(await this.paths.verifyLinks(repository,workspace));requireStore(workspace.baseSha&&workspace.gitDir,'LINK_CHANGED');
  const cwd=workspace.worktreePath;requireStore(gitPath(await this.git(cwd,['rev-parse','--show-toplevel']))===cwd&&gitPath(await this.git(cwd,['rev-parse','--path-format=absolute','--git-dir']))===workspace.gitDir&&gitPath(await this.git(cwd,['rev-parse','--path-format=absolute','--git-common-dir']))===repository.commonGitDir,'LINK_CHANGED');
  const branch='refs/heads/'+workspace.branchRef,head=await this.git(cwd,['rev-parse','--verify','HEAD^{commit}']);requireStore(await this.git(cwd,['symbolic-ref','--quiet','HEAD'])===branch,'LINK_CHANGED');const registered=(await this.registry(repository)).filter(r=>r.worktree===cwd||r.branch===branch);requireStore(registered.length===1&&registered[0]!.worktree===cwd&&registered[0]!.branch===branch&&registered[0]!.head===head,'LINK_CHANGED');
  if(exactBase)requireStore(head===workspace.baseSha,'LINK_CHANGED');else await this.git(cwd,['merge-base','--is-ancestor',workspace.baseSha,'HEAD']);
 }
 async verify(repository:C.RepositoryRecord,workspace:C.WorkspaceRecord):Promise<PortResult<C.WorkspaceRecord>>{try{this.load(repository,workspace);requireStore(workspace.state==='ready','WORKSPACE_PARTIAL');await this.inspectWorkspace(repository,workspace);return success(workspace);}catch(error){return fixedFailure(error);}}
 private persist(previous:C.WorkspaceRecord,old:C.OperationRecord,next:C.WorkspaceRecord,operation:C.OperationRecord):void{
  take(this.store.transaction(tx=>{equal(TABLES.workspaces,tx.workspace(previous.workspaceId),previous);equal(TABLES.operations,tx.operation(old.operationId),old);const p=tx.prd(old.prdId);requireStore(p,'LINK_CHANGED');tx.putWorkspace(next);tx.putOperation(operation);tx.putPrd({...p,version:token()},p.version);return success(true);}));
 }
 private fail(operation:C.OperationRecord,code:C.PrdErrorCode){
  this.store.transaction(tx=>{const current=tx.operation(operation.operationId),p=tx.prd(operation.prdId);if(!current||!p||current.phase==='finished')return success(false);tx.putOperation({...current,phase:'finished',outcome:'failed',error:{code,message:PRD_ERROR_MESSAGES[code],correlationId:current.operationId} as C.PrdError,stepState:'uncertain'});tx.putPrd({...p,version:token(),lifecycle:'failed'},p.version);return success(true);});
 }
 private async run(repository:C.RepositoryRecord,input:C.WorkspaceRecord,intent:C.OperationRecord,retry:boolean):Promise<PortResult<WorkspaceStepResult>>{
  let key:string|undefined,gateHeld=false,claimed=false;let workspace=input,operation=intent;
  try{
   this.load(repository,workspace,operation);requireStore(operation.phase==='starting'&&operation.kind===(retry?'workspaceRetry':'create'),'BUSY');requireStore(retry||workspace.creationOperationId===operation.operationId,'LINK_CHANGED');
   key=JSON.stringify(repository.commonGitIdentity);requireStore(!activeRepositories.has(key),'BUSY');activeRepositories.add(key);gateHeld=true;
   await this.verifyRepository(repository);const before=await this.original(repository);
   if(!retry)requireStore(workspace.state==='planned'&&before.head===workspace.originalHeadSha&&before.branch===workspace.originalBranchRef&&before.index===workspace.originalIndexHash&&before.tracked===workspace.originalTrackedChangesHash,'STALE_VERSION');
   requireStore(['planned','baseFetched','branchCreated','worktreeCreated','ready'].includes(workspace.state),'WORKSPACE_PARTIAL');
   const branch=await this.ref(repository,workspace.branchRef),registry=await this.registry(repository),associated=registry.filter(r=>r.branch==='refs/heads/'+workspace.branchRef||r.worktree===workspace.worktreePath);
   if(['planned','baseFetched'].includes(workspace.state)){requireStore(branch===null&&!pathExists(workspace.worktreePath)&&associated.length===0,'WORKSPACE_PARTIAL');}
   if(workspace.state==='branchCreated'){requireStore(branch===workspace.baseSha&&!pathExists(workspace.worktreePath)&&associated.length===0,'WORKSPACE_PARTIAL');}
   if(workspace.state==='worktreeCreated'||workspace.state==='ready')await this.inspectWorkspace(repository,workspace,workspace.state!=='ready');
   const old=operation;operation={...operation,phase:'running'};this.persist(workspace,old,workspace,operation);claimed=true;
   // App-owned Git commands suppress hooks in a newly reserved empty directory; no user config edit.
   const recovery=path.join(this.roots.recovery,operation.operationId),hooks=path.join(recovery,'empty-git-hooks');const reserved:C.OperationRecord={...operation,recoveryDirectory:recovery as C.CanonicalPath};this.persist(workspace,operation,workspace,reserved);operation=reserved;verifiedDirectory(this.roots.recovery);requireStore(!pathExists(recovery),'WORKSPACE_PARTIAL');mkdirSync(recovery,{mode:0o700});verifiedDirectory(recovery);mkdirSync(hooks,{mode:0o700});verifiedDirectory(hooks);
   const record=(next:C.WorkspaceRecord,step:C.ExternalStep,state:C.OperationRecord['stepState'])=>{const update:C.OperationRecord={...operation,step,stepState:state,recoveryDirectory:recovery as C.CanonicalPath};this.persist(workspace,operation,next,update);workspace=next;operation=update;};
   if(workspace.state==='planned'){
    record(workspace,'fetchBase','intent');await this.git(repository.checkoutRoot,['fetch','--no-tags','--no-write-fetch-head','origin','+refs/heads/main:refs/remotes/origin/main'],'BASE_UNAVAILABLE',hooks);
    const base=await this.git(repository.checkoutRoot,['rev-parse','--verify','refs/remotes/origin/main^{commit}'],'BASE_UNAVAILABLE');requireStore(/^[a-f0-9]{40}$/.test(base),'BASE_UNAVAILABLE');await this.preserve(repository,before);record({...workspace,baseSha:base as C.GitSha,state:'baseFetched'},'fetchBase','effectVerified');
   }
   if(workspace.state==='baseFetched'){
    requireStore(await this.ref(repository,workspace.branchRef)===null&&!pathExists(workspace.worktreePath),'WORKSPACE_PARTIAL');record(workspace,'createBranch','intent');await this.git(repository.checkoutRoot,['branch','--no-track','--',workspace.branchRef,workspace.baseSha!],'WORKSPACE_PARTIAL',hooks);requireStore(await this.ref(repository,workspace.branchRef)===workspace.baseSha,'WORKSPACE_PARTIAL');await this.preserve(repository,before);record({...workspace,state:'branchCreated'},'createBranch','effectVerified');
   }
   if(workspace.state==='branchCreated'){
    requireStore(!pathExists(workspace.worktreePath)&&await this.ref(repository,workspace.branchRef)===workspace.baseSha,'WORKSPACE_PARTIAL');record(workspace,'createWorktree','intent');await this.git(repository.checkoutRoot,['worktree','add','--no-guess-remote','--',workspace.worktreePath,workspace.branchRef],'WORKSPACE_PARTIAL',hooks);
    const gitDir=gitPath(await this.git(workspace.worktreePath,['rev-parse','--path-format=absolute','--git-dir']));const observed:C.WorkspaceRecord={...workspace,state:'worktreeCreated',gitDir,worktreeIdentity:verifiedDirectory(workspace.worktreePath),gitDirIdentity:verifiedDirectory(gitDir)};await this.inspectWorkspace(repository,observed,true);await this.preserve(repository,before);record(observed,'createWorktree','effectVerified');
   }
   await this.inspectWorkspace(repository,workspace,workspace.state!=='ready');await this.preserve(repository,before);record({...workspace,state:'ready'},'createWorktree','effectVerified');return success({workspace,operation});
  }catch(error){const result=fixedFailure<WorkspaceStepResult>(error);if(claimed&&!result.ok)this.fail(operation,result.error.code);return result;}finally{if(gateHeld&&key)activeRepositories.delete(key);}
 }
 provision(repository:C.RepositoryRecord,workspace:C.WorkspaceRecord,operation:C.OperationRecord){return this.run(repository,workspace,operation,false);}
 retry(repository:C.RepositoryRecord,workspace:C.WorkspaceRecord,operation:C.OperationRecord){return this.run(repository,workspace,operation,true);}
 async conventions(workspace:C.WorkspaceRecord):Promise<PortResult<readonly C.ConventionRecord[]>>{
  try{const repository=this.read(tx=>tx.repository(workspace.repositoryId));requireStore(repository,'LINK_CHANGED');take(await this.verify(repository,workspace));return await discoverPrdConventions(workspace);}catch(error){return fixedFailure(error);}
 }
 location(title:string,date:C.CreationDate,convention:C.ConventionRecord):PortResult<C.RelativeMarkdownPath>{
  try{const relative=take(resolvePrdLocation(title,date,convention)),workspace=this.read(tx=>tx.workspace(convention.workspaceId));requireStore(workspace&&workspace.state==='ready'&&workspace.worktreeIdentity&&sameIdentity(workspace.worktreeIdentity,verifiedDirectory(workspace.worktreePath)),'LINK_CHANGED');verifyFutureDirectory(workspace.worktreePath,convention.relativeFolder);requireStore(!pathExists(path.join(workspace.worktreePath,...relative.split('/'))),'PATH_INVALID');return success(relative);}catch(error){return fixedFailure(error);}
 }
}
