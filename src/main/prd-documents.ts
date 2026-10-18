/** Verified Markdown and application-controlled saves. No global filesystem CAS is claimed. */
import path from 'node:path';
import {opendirSync,openSync,closeSync,writeFileSync,fsyncSync,renameSync,existsSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import type * as C from '../shared/prd-contracts';
import {PRD_LIMITS as L} from '../shared/prd-contracts';
import type {PrdDocumentsPort,PrdStorePort,PrdWorkspacePort,ProductRoots,PortResult,VerifiedPath,DocumentSaveInput} from './prd-ports';
import {canonicalStat,verifiedDirectory,identityOf,sameIdentity,validRelative,contained} from './prd-paths';
import {requireStore,StoreFault,storeFailure} from './prd-schema';
import {PrdSaveRecovery,readRecoveryBytes} from './prd-save-recovery';
import {resolvePrdLocation} from './prd-location';
const uuid=<T extends string>()=>randomUUID() as T;
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const identityKey=(identity:C.FilesystemIdentity)=>JSON.stringify([identity.device,identity.fileId,identity.birthtimeNs]);
function take<T>(result:PortResult<T>):T{if(!result.ok)throw new StoreFault(result.error.code);return result.value;}
function equal(a:C.DiskRevisionRecord,b:C.DiskRevisionRecord){return sameIdentity(a.identity,b.identity)&&a.sha256===b.sha256&&a.byteLength===b.byteLength&&a.mtimeNs===b.mtimeNs;}
interface Observed {bytes:Buffer;revision:C.DiskRevisionRecord;text:string}
function generatedLabel(text:string,fallback:string):string{
 let fence:string|undefined;for(const line of text.split(/\r?\n/).slice(0,128)){
  const marker=line.match(/^ {0,3}(`{3,}|~{3,})/);if(marker){if(!fence)fence=marker[1]![0];else if(fence===marker[1]![0])fence=undefined;continue;}
  if(fence)continue;const match=line.match(/^ {0,3}#\s+(.+?)\s*#*\s*$/);if(match){const label=match[1]!.trim();if(label&&!label.includes('\0')&&Buffer.byteLength(label)<=L.displayNameBytes)return label;break;}
 }return fallback;
}
export interface DocumentSaveHooks {readonly beforeReplace?:()=>Promise<void>|void;readonly afterReplace?:()=>Promise<void>|void}
export class PrdDocuments implements PrdDocumentsPort {
 private readonly busy=new Set<C.PrdId>();
 private readonly observations=new Map<C.PrdId,{key:string;task:Promise<PortResult<{document:C.DocumentRecord;body:C.DocumentBody|null}>>}>();
 private readonly inventories=new Map<C.PrdId,{paths:Set<string>;identities:Set<string>;complete:boolean}>();
 private readonly fingerprints=new Map<string,C.DiskRevisionRecord>();
 private readonly recoveries:PrdSaveRecovery;
 constructor(private readonly store:PrdStorePort,private readonly roots:ProductRoots,private readonly workspaces:PrdWorkspacePort,private readonly hooks:DocumentSaveHooks={}){this.recoveries=new PrdSaveRecovery(store,roots);}
 private async run<T>(prdId:C.PrdId,work:()=>Promise<T>):Promise<PortResult<T>>{
  if(this.busy.has(prdId))return storeFailure('BUSY');this.busy.add(prdId);
  try{return {ok:true,value:await work()};}catch(error){return storeFailure(error instanceof StoreFault?error.code:'PATH_INVALID');}finally{this.busy.delete(prdId);}
 }
 private async verify(workspace:C.WorkspaceRecord,prdId:C.PrdId,expected?:C.PrdRecord){
  const linked=take(this.store.transaction(tx=>{
   const prd=tx.prd(prdId),saved=tx.workspace(workspace.workspaceId),repository=tx.repository(workspace.repositoryId);
   requireStore(prd&&saved&&repository&&prd.workspaceId===saved.workspaceId&&saved.repositoryId===repository.repositoryId&&Object.keys(saved).length===Object.keys(workspace).length&&Object.entries(saved).every(([key,value])=>{const supplied=workspace[key as keyof C.WorkspaceRecord];return value===null||typeof value!=='object'?value===supplied:typeof supplied==='object'&&supplied!==null&&sameIdentity(value as C.FilesystemIdentity,supplied as C.FilesystemIdentity);}),'LINK_CHANGED');
   if(expected)requireStore(prd.version===expected.version,'STALE_VERSION');
   requireStore(saved.state==='ready'&&saved.worktreePath===path.join(this.roots.workspaces,saved.workspaceId),'LINK_CHANGED');
   return {ok:true,value:{prd,repository,conventions:tx.conventions(saved.workspaceId)}};
  }));
  take(await this.workspaces.verify(linked.repository,workspace));verifiedDirectory(workspace.worktreePath);return linked;
 }
 private file(workspace:C.WorkspaceRecord,relative:string):C.CanonicalPath{
  requireStore(validRelative(relative)&&/\.md$/i.test(relative),'PATH_INVALID');const file=path.join(workspace.worktreePath,...relative.split('/'));
  requireStore(contained(workspace.worktreePath,file),'PATH_INVALID');return file as C.CanonicalPath;
 }
 private observe(file:C.CanonicalPath,known?:C.DiskRevisionRecord):Observed{
  const before=canonicalStat(file);requireStore(before.isFile(),'PATH_INVALID');requireStore(before.size<=BigInt(L.documentBytes),'LIMIT_EXCEEDED');
  const bytes=readRecoveryBytes(file),after=canonicalStat(file);
  requireStore(sameIdentity(identityOf(before),identityOf(after))&&before.size===after.size&&before.mtimeNs===after.mtimeNs,'REVISION_CONFLICT');
  let text:string;try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw new StoreFault('PATH_INVALID');}
  requireStore(!text.includes('\0'),'PATH_INVALID');
  const fresh:C.DiskRevisionRecord={token:uuid(),identity:identityOf(after),sha256:hash(bytes) as C.DiskRevisionRecord['sha256'],byteLength:bytes.length,mtimeNs:String(after.mtimeNs)};
  const previous=known&&equal(known,fresh)?known:this.fingerprints.get(file),revision=previous&&equal(previous,fresh)?previous:fresh;
  this.fingerprints.set(file,revision);if(this.fingerprints.size>L.candidateScanFiles)this.fingerprints.delete(this.fingerprints.keys().next().value!);
  return {bytes,text,revision};
 }
 private scan(workspace:C.WorkspaceRecord):{paths:string[];identities:Set<string>;complete:boolean}{
  const pending=[''],paths:string[]=[],identities=new Set<string>();let count=0,complete=true;
  while(pending.length&&complete){const relative=pending.pop()!,directory=relative?path.join(workspace.worktreePath,...relative.split('/')):workspace.worktreePath;verifiedDirectory(directory);const handle=opendirSync(directory);
   try{for(;;){const entry=handle.readSync();if(!entry)break;if(entry.name.toLowerCase()==='.git')continue;if(++count>L.candidateScanFiles){complete=false;break;}
    const child=relative?relative+'/'+entry.name:entry.name;requireStore(validRelative(child),'PATH_INVALID');const stat=canonicalStat(path.join(workspace.worktreePath,...child.split('/')));
    if(stat.isDirectory())pending.push(child);else if(stat.isFile()&&/\.md$/i.test(child)){paths.push(child);identities.add(identityKey(identityOf(stat)));}
   }}finally{handle.closeSync();}
  }
  return {paths:paths.sort(),identities,complete};
 }
 private page(prd:C.PrdRecord,conventions:readonly C.ConventionRecord[],items:readonly C.DraftCandidate[],complete:boolean):C.DraftCandidatesPage{
  const page:C.DraftCandidatesPage={version:prd.version,conventions:conventions.map(c=>({conventionId:c.conventionId,relativeFolder:c.relativeFolder})),items:items.map(item=>({candidateId:item.candidateId,relativePath:item.relativePath,conventionId:item.conventionId,revision:item.revision,byteLength:item.byteLength,observedAt:item.observedAt,previewText:item.previewText,previewStatus:item.previewStatus})),nextCursor:null,coverage:complete?'complete':'scanLimit'};
  requireStore(Buffer.byteLength(JSON.stringify(page))<=L.pageBytes,'LIMIT_EXCEEDED');return page;
 }
 inventory(prd:C.PrdRecord,workspace:C.WorkspaceRecord):Promise<PortResult<C.DraftCandidatesPage>>{
  return this.run(prd.prdId,async()=>{
   const links=await this.verify(workspace,prd.prdId,prd);
   if(prd.plannedRelativePath){
    const file=this.file(workspace,prd.plannedRelativePath);let directory=workspace.worktreePath;
    for(const component of prd.plannedRelativePath.split('/').slice(0,-1)){directory=path.join(directory,component) as C.CanonicalPath;try{verifiedDirectory(directory);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')break;throw error;}}
    let exists=false;try{canonicalStat(file);exists=true;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}requireStore(!exists,'PATH_INVALID');
   }
   const previous=this.inventories.get(prd.prdId);if(previous)return this.page(prd,links.conventions,[],previous.complete);const scan=this.scan(workspace);
   // Let the filesystem resolve aliases before generation, even if a later replacement changes identity.
   const paths=new Set(scan.paths);for(const convention of links.conventions){const expected=resolvePrdLocation(prd.displayName,prd.creationDate,convention);if(expected.ok&&existsSync(this.file(workspace,expected.value)))paths.add(expected.value);}
   await this.verify(workspace,prd.prdId,prd);this.inventories.set(prd.prdId,{paths,identities:scan.identities,complete:scan.complete});
   return this.page(prd,links.conventions,[],scan.complete);
  });
 }
 candidates(prd:C.PrdRecord,workspace:C.WorkspaceRecord):Promise<PortResult<C.DraftCandidatesPage>>{
  return this.run(prd.prdId,async()=>{
   const links=await this.verify(workspace,prd.prdId,prd),before=this.inventories.get(prd.prdId);
   const cached=take(this.store.transaction(tx=>({ok:true,value:tx.candidates(prd.prdId)})));
   // After restart only already-verified candidates can be offered; never invent a new baseline.
   if(!before)return this.page(prd,links.conventions,cached.filter(c=>!c.preexisting).slice(0,L.candidateItems),false);
   const scan=this.scan(workspace);if(!before.complete)return this.page(prd,links.conventions,[],false);
   const candidates:C.CandidateRecord[]=[];
   for(const relative of scan.paths){
    if(before.paths.has(relative))continue;
    const convention=links.conventions.find(c=>{const expected=resolvePrdLocation(prd.displayName,prd.creationDate,c);return expected.ok&&expected.value===relative;});if(!convention)continue;
    const observed=this.observe(this.file(workspace,relative));
    // A renamed inventoried file is still pre-existing, including Windows case-only aliases.
    if(before.identities.has(identityKey(observed.revision.identity)))continue;
    const old=cached.find(c=>c.relativePath===relative);
    let preview='',bytes=0;for(const character of observed.text){const size=Buffer.byteLength(character);if(bytes+size>L.candidatePreviewBytes)break;preview+=character;bytes+=size;}
    candidates.push({candidateId:old?.candidateId??uuid(),prdId:prd.prdId,scanOperationId:workspace.creationOperationId,conventionId:convention.conventionId,relativePath:relative as C.RelativeMarkdownPath,revision:observed.revision.token,fingerprint:observed.revision,byteLength:observed.bytes.length,observedAt:new Date().toISOString() as C.IsoInstant,previewText:preview,previewStatus:bytes===observed.bytes.length?'complete':'truncated',preexisting:false});
   }
   const complete=scan.complete&&candidates.length<=L.candidateItems,selected=candidates.slice(0,L.candidateItems);
   await this.verify(workspace,prd.prdId,prd);
   take(this.store.transaction(tx=>{requireStore(tx.prd(prd.prdId)?.version===prd.version,'STALE_VERSION');for(const candidate of selected)tx.putCandidate(candidate);return {ok:true,value:undefined};}));
   return this.page(prd,links.conventions,selected,complete);
  });
 }
 register(prd:C.PrdRecord,workspace:C.WorkspaceRecord,candidate:C.CandidateRecord):Promise<PortResult<C.DocumentRecord>>{
  return this.run(prd.prdId,async()=>{
   await this.verify(workspace,prd.prdId,prd);requireStore(!prd.documentId,'LINK_CHANGED');
   const stored=take(this.store.transaction(tx=>{const found=tx.candidates(prd.prdId).find(c=>c.candidateId===candidate.candidateId);requireStore(found&&!found.preexisting&&found.prdId===prd.prdId&&found.revision===candidate.revision,'REVISION_CONFLICT');return {ok:true,value:found};}));
   const observed=this.observe(this.file(workspace,stored.relativePath),stored.fingerprint);requireStore(equal(observed.revision,stored.fingerprint),'REVISION_CONFLICT');
   const document:C.DocumentRecord={documentId:uuid(),prdId:prd.prdId,conventionId:stored.conventionId,relativePath:stored.relativePath,revision:observed.revision,state:'available'};
   await this.verify(workspace,prd.prdId,prd);
   take(this.store.transaction(tx=>{
    const current=tx.prd(prd.prdId);requireStore(current?.version===prd.version&&!current.documentId,'STALE_VERSION');
    const conventions=tx.conventions(workspace.workspaceId);requireStore(conventions.some(c=>c.conventionId===stored.conventionId),'LINK_CHANGED');
    for(const convention of conventions)tx.putConvention({...convention,selected:convention.conventionId===stored.conventionId});
    tx.putDocument(document);tx.putPrd({...current,displayName:generatedLabel(observed.text,current.displayName),documentId:document.documentId,conventionId:document.conventionId,plannedRelativePath:document.relativePath,lifecycle:'draftAvailable',version:uuid()},current.version);return {ok:true,value:undefined};
   }));return document;
  });
 }
 private async reconcileFile(workspace:C.WorkspaceRecord,document:C.DocumentRecord):Promise<{document:C.DocumentRecord;body:C.DocumentBody|null}>{
  const links=await this.verify(workspace,document.prdId),stored=take(this.store.transaction(tx=>{const current=tx.document(document.documentId);requireStore(current&&current.prdId===document.prdId&&links.prd.documentId===current.documentId&&current.relativePath===document.relativePath,'LINK_CHANGED');return {ok:true,value:current};}));
  let observed:Observed|undefined;
  try{observed=this.observe(this.file(workspace,stored.relativePath),stored.revision);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const updated:C.DocumentRecord=observed?{...stored,state:'available',revision:observed.revision}:{...stored,state:'missing'};
  if(updated.state!==stored.state||!equal(updated.revision,stored.revision))take(this.store.transaction(tx=>{
   const prd=tx.prd(stored.prdId),current=tx.document(stored.documentId);requireStore(prd&&prd.version===links.prd.version&&current?.revision.token===stored.revision.token,'STALE_VERSION');
   tx.putDocument(updated);tx.putPrd({...prd,version:uuid()},prd.version);return {ok:true,value:undefined};
  }));
  return {document:updated,body:observed?{documentId:updated.documentId,relativePath:updated.relativePath,revision:updated.revision.token,text:observed.text,byteLength:observed.bytes.length}:null};
 }
 async read(workspace:C.WorkspaceRecord,document:C.DocumentRecord):Promise<PortResult<C.DocumentBody>>{
  const result=await this.reconcile(workspace,document);if(!result.ok)return result;return result.value.body?{ok:true,value:result.value.body}:storeFailure('NOT_FOUND');
 }
 reconcile(workspace:C.WorkspaceRecord,document:C.DocumentRecord):Promise<PortResult<{document:C.DocumentRecord;body:C.DocumentBody|null}>>{
  // Opening history and loading the document can observe the same immutable association together.
  // Mutations still use run() exclusively; different links/revisions are never coalesced.
  const key=JSON.stringify([workspace,document]),current=this.observations.get(document.prdId);
  if(current)return current.key===key?current.task:Promise.resolve(storeFailure('BUSY'));
  const task=this.run(document.prdId,()=>this.reconcileFile(workspace,document));this.observations.set(document.prdId,{key,task});
  void task.then(()=>{if(this.observations.get(document.prdId)?.task===task)this.observations.delete(document.prdId);});return task;
 }
 save(input:DocumentSaveInput):Promise<PortResult<{document:C.DocumentRecord;body:C.DocumentBody;recovery:C.SaveRecoveryRecord}>>{
  return this.run(input.prd.prdId,async()=>{
   let recovery:C.SaveRecoveryRecord|undefined;
   try{
    requireStore(Buffer.byteLength(input.text)<=L.documentBytes&&!input.text.includes('\0'),'LIMIT_EXCEEDED');
    await this.verify(input.workspace,input.prd.prdId,input.prd);requireStore(input.prd.documentId===input.document.documentId&&input.document.prdId===input.prd.prdId&&input.document.state==='available','LINK_CHANGED');
    const file=this.file(input.workspace,input.document.relativePath),before=this.observe(file,input.document.revision);requireStore(equal(before.revision,input.document.revision),'REVISION_CONFLICT');
    recovery=this.recoveries.prepare(input,before.bytes);
    const temporary=path.join(path.dirname(file),'.gabprd-save-'+input.operation.operationId+'.tmp'),parent=verifiedDirectory(path.dirname(file)),fd=openSync(temporary,'wx',Number(canonicalStat(file).mode&0o777n));
    try{writeFileSync(fd,Buffer.from(input.text,'utf8'));fsyncSync(fd);}finally{closeSync(fd);}
    const intendedIdentity=identityOf(canonicalStat(temporary));requireStore(sameIdentity(parent,verifiedDirectory(path.dirname(file))),'LINK_CHANGED');
    await this.hooks.beforeReplace?.();await this.verify(input.workspace,input.prd.prdId,input.prd);
    requireStore(equal(this.observe(file,input.document.revision).revision,input.document.revision),'REVISION_CONFLICT');
    renameSync(temporary,file);recovery=this.recoveries.phase(recovery,'replaced');await this.hooks.afterReplace?.();
    await this.verify(input.workspace,input.prd.prdId,input.prd);const after=this.observe(file);
    requireStore(sameIdentity(intendedIdentity,after.revision.identity)&&after.revision.sha256===recovery.intendedSha256&&after.text===input.text,'REVISION_CONFLICT');
    const document:C.DocumentRecord={...input.document,revision:after.revision,state:'available'};
    take(this.store.transaction(tx=>{const prd=tx.prd(input.prd.prdId),old=tx.document(document.documentId);requireStore(prd?.version===input.prd.version&&old?.revision.token===input.document.revision.token,'REVISION_CONFLICT');tx.putDocument(document);tx.putPrd({...prd,version:uuid()},prd.version);return {ok:true,value:undefined};}));
    recovery=this.recoveries.phase(recovery,'verified');return {document,body:{documentId:document.documentId,relativePath:document.relativePath,revision:document.revision.token,text:after.text,byteLength:after.bytes.length},recovery};
   }catch(error){if(recovery)try{this.recoveries.phase(recovery,'uncertain');}catch{/* Retain all bytes even when metadata cannot be updated. */}throw error;}
  });
 }
 async recover(record:C.SaveRecoveryRecord):Promise<PortResult<C.SaveRecoveryRecord>>{
  try{return {ok:true,value:this.recoveries.recover(record)};}catch(error){return storeFailure(error instanceof StoreFault?error.code:'PATH_INVALID');}
 }
 async fingerprint(verified:VerifiedPath):Promise<PortResult<C.DiskRevisionRecord>>{
  try{const observed=this.observe(verified.path);requireStore(sameIdentity(verified.identity,observed.revision.identity),'LINK_CHANGED');return {ok:true,value:observed.revision};}catch(error){return storeFailure(error instanceof StoreFault?error.code:'PATH_INVALID');}
 }
}
