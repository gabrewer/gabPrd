/** Main-owned schema-1 metadata. External Git/Pi/file effects never run in transactions. */
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {constants,openSync,closeSync,readSync,writeFileSync,fsyncSync,fstatSync,mkdirSync,renameSync,lstatSync} from 'node:fs';
import Database from 'better-sqlite3';
import type * as C from '../shared/prd-contracts';
import {PRD_ERROR_MESSAGES,PRD_LIMITS} from '../shared/prd-contracts';
import type {PrdStorePort,StoreTransaction,PortResult,ProductRoots} from './prd-ports';
import {TABLES,SCHEMA_SQL,IDENTITY_SQL,INDEX_SQL,StoreFault,requireStore,storeFailure,encode,decode,verifyGraph} from './prd-schema';
import type {Table} from './prd-schema';
import {canonicalStat,verifiedDirectory,identityOf,sameIdentity,contained} from './prd-paths';
const token=<T extends string>()=>randomUUID() as T;
const cp=(p:string)=>p as C.CanonicalPath;
const success=<T>(value:T):PortResult<T>=>({ok:true,value});
function exists(file:string):boolean{try{lstatSync(file);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}}
function readOwned(file:string,limit:number):Buffer{
 const before=canonicalStat(file);requireStore(before.isFile()&&before.size<=BigInt(limit));const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{requireStore(sameIdentity(identityOf(before),identityOf(fstatSync(fd,{bigint:true}))));const bytes=Buffer.alloc(limit+1),length=readSync(fd,bytes,0,bytes.length,0);requireStore(length<=limit&&BigInt(length)===before.size&&sameIdentity(identityOf(before),identityOf(canonicalStat(file))));return bytes.subarray(0,length);}finally{closeSync(fd);}
}
function markerAt(root:string):C.ProductOwnerMarker{
 const raw:unknown=JSON.parse(readOwned(path.join(root,'owner.json'),4096).toString('utf8'));requireStore(raw&&typeof raw==='object'&&!Array.isArray(raw));
 const r=raw as Record<string,unknown>;requireStore(Object.keys(r).sort().join(',')==='canonicalRoot,databaseExpected,initializationState,installationId,schemaVersion'&&r.schemaVersion===1&&r.canonicalRoot===root&&r.databaseExpected===true&&(r.initializationState==='initializing'||r.initializationState==='ready')&&typeof r.installationId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(r.installationId));return Object.freeze(raw as C.ProductOwnerMarker);
}
function writeExclusive(file:string,bytes:string|Buffer){const fd=openSync(file,'wx',0o600);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}}
function sidecars(file:string){return ['-wal','-shm','-journal'].some(suffix=>exists(file+suffix));}
/** Read the fixed header before SQLite: even a readonly WAL open can create sidecars. */
function deleteJournalHeader(file:string):boolean{
 const before=canonicalStat(file);if(!before.isFile()||before.size<100n)return false;const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{requireStore(sameIdentity(identityOf(before),identityOf(fstatSync(fd,{bigint:true}))));const header=Buffer.alloc(100);if(readSync(fd,header,0,100,0)!==100)return false;requireStore(sameIdentity(identityOf(before),identityOf(canonicalStat(file))));return header.subarray(0,16).equals(Buffer.from('SQLite format 3\0'))&&header[18]===1&&header[19]===1;}finally{closeSync(fd);}
}
function matchesMarker(a:C.ProductOwnerMarker,b:C.ProductOwnerMarker){return a.installationId===b.installationId&&a.canonicalRoot===b.canonicalRoot&&a.schemaVersion===b.schemaVersion&&a.initializationState===b.initializationState&&a.databaseExpected===b.databaseExpected;}
function verifySchema(db:Database.Database,marker:C.ProductOwnerMarker){
 requireStore(db.pragma('user_version',{simple:true})===1,'STORE_READ_ONLY');
 const expected=[IDENTITY_SQL,...Object.values(TABLES).map(t=>t.sql),...INDEX_SQL].sort();
 const actual=(db.prepare("SELECT sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' ORDER BY sql LIMIT ?").all(expected.length+1) as {sql:string}[]).map(r=>r.sql).sort();requireStore(actual.length===expected.length&&actual.every((sql,n)=>sql===expected[n]));
 const rows=db.prepare('SELECT * FROM store_identity LIMIT 2').all() as {singleton:number;schema_version:number;installation_id:string;canonical_root:string}[];
 requireStore(rows.length===1&&rows[0]!.singleton===1&&rows[0]!.schema_version===1&&rows[0]!.installation_id===marker.installationId&&rows[0]!.canonical_root===marker.canonicalRoot);
 const settings=db.prepare('SELECT * FROM settings LIMIT 2').all() as Record<string,unknown>[];
 requireStore(settings.length===1&&settings[0]!.singleton===1);decode<C.DefaultRepositoryRecord>(TABLES.settings,settings[0]!);
 requireStore(db.pragma('foreign_keys',{simple:true})===1);verifyGraph(db);
}
function databaseHealth(db:Database.Database,marker:C.ProductOwnerMarker):C.StoreHealth{
 if(db.pragma('user_version',{simple:true})!==1)return {state:'readOnlyRecovery',reason:'unsupportedSchema'};
 const row=db.prepare('SELECT installation_id,canonical_root FROM store_identity WHERE singleton=1').get() as {installation_id:string;canonical_root:string}|undefined;
 if(!row||row.installation_id!==marker.installationId||row.canonical_root!==marker.canonicalRoot)return {state:'readOnlyRecovery',reason:'foreignOwnership'};
 verifySchema(db,marker);requireStore((db.prepare('PRAGMA quick_check(1)').get() as {quick_check:string})?.quick_check==='ok');return {state:'ready'};
}
export class PrdStore implements PrdStorePort {
 private db:Database.Database|undefined;
 private roots:ProductRoots|undefined;
 private health:C.StoreHealth={state:'initializing'};
 private identities:{root:C.FilesystemIdentity;marker:C.FilesystemIdentity;database:C.FilesystemIdentity;children:readonly C.FilesystemIdentity[]}|undefined;
 private transactionActive=false;
 private readonly recoveryVersion=token<C.RecordVersion>();
 private readonly cursors=new Map<string,{snapshot:string;date:string;id:string}>();
 private fault<T>(error:unknown):PortResult<T>{
  let code:C.PrdErrorCode=error instanceof StoreFault?error.code:'INTERNAL';const nativeCode=error&&typeof error==='object'?Object.getOwnPropertyDescriptor(error,'code')?.value:undefined;
  if(typeof nativeCode==='string'){if(nativeCode==='SQLITE_BUSY'||nativeCode==='SQLITE_LOCKED')code='BUSY';else if(nativeCode.startsWith('SQLITE_CONSTRAINT'))code='LINK_CHANGED';}return storeFailure(code);
 }
 private children(roots:ProductRoots){return [roots.workspaces,roots.sessions,roots.recovery] as const;}
 private remember(){const roots=this.roots!;this.identities={root:verifiedDirectory(roots.marker.canonicalRoot),marker:identityOf(canonicalStat(path.join(roots.marker.canonicalRoot,'owner.json'))),database:identityOf(canonicalStat(roots.database)),children:this.children(roots).map(verifiedDirectory)};}
 private guard(){
  requireStore(this.health.state==='ready'&&this.db?.open&&this.roots&&this.identities,'STORE_READ_ONLY');const roots=this.roots,known=this.identities;
  requireStore(sameIdentity(known.root,verifiedDirectory(roots.marker.canonicalRoot))&&sameIdentity(known.marker,identityOf(canonicalStat(path.join(roots.marker.canonicalRoot,'owner.json'))))&&sameIdentity(known.database,identityOf(canonicalStat(roots.database)))&&matchesMarker(roots.marker,markerAt(roots.marker.canonicalRoot)),'STORE_READ_ONLY');
  this.children(roots).forEach((child,n)=>requireStore(sameIdentity(known.children[n]!,verifiedDirectory(child)),'STORE_READ_ONLY'));
  requireStore(deleteJournalHeader(roots.database)&&(!sidecars(roots.database)||this.db.inTransaction),'STORE_READ_ONLY');verifySchema(this.db,roots.marker);
 }
 async open(userData:C.CanonicalPath):Promise<PortResult<Readonly<{roots:ProductRoots;health:C.StoreHealth}>>>{
  if(this.db||this.roots)return storeFailure('BUSY');let handle:Database.Database|undefined;
  try{
   const userIdentity=verifiedDirectory(userData),root=path.join(userData,'product-v1'),fresh=!exists(root);if(fresh)mkdirSync(root,{mode:0o700});
   const rootIdentity=verifiedDirectory(root);requireStore(sameIdentity(userIdentity,verifiedDirectory(userData)));
   if(fresh){const marker:C.ProductOwnerMarker={schemaVersion:1,installationId:token(),canonicalRoot:cp(root),initializationState:'initializing',databaseExpected:true};writeExclusive(path.join(root,'owner.json'),JSON.stringify(marker));}
   const marker=markerAt(root);const roots:ProductRoots={marker,database:cp(path.join(root,'metadata.sqlite3')),workspaces:cp(path.join(root,'workspaces')),sessions:cp(path.join(root,'sessions')),recovery:cp(path.join(root,'recovery'))};this.roots=Object.freeze(roots);
   const recover=(reason:Extract<C.StoreHealth,{state:'readOnlyRecovery'}>['reason'])=>{this.health={state:'readOnlyRecovery',reason};return success({roots:this.roots!,health:this.health});};
   if(!fresh&&marker.initializationState==='initializing')return recover('incompleteInitialization');
   if(fresh){
    for(const child of this.children(roots)){requireStore(sameIdentity(rootIdentity,verifiedDirectory(root)));mkdirSync(child,{mode:0o700});verifiedDirectory(child);}
    requireStore(matchesMarker(marker,markerAt(root))&&sameIdentity(rootIdentity,verifiedDirectory(root))&&!exists(roots.database));writeExclusive(roots.database,Buffer.alloc(0));
    const reserved=identityOf(canonicalStat(roots.database));requireStore(!sidecars(roots.database));handle=new Database(roots.database,{fileMustExist:true,timeout:0});handle.pragma('foreign_keys=ON');handle.pragma('journal_mode=DELETE');handle.pragma('synchronous=FULL');
    handle.transaction(()=>{handle!.exec(SCHEMA_SQL);handle!.pragma('user_version=1');handle!.prepare('INSERT INTO store_identity VALUES(1,1,?,?)').run(marker.installationId,root);handle!.prepare('INSERT INTO settings(singleton,version,default_repository_id,last_request_id) VALUES(1,?,NULL,NULL)').run(token());}).exclusive();
    requireStore(sameIdentity(reserved,identityOf(canonicalStat(roots.database)))&&sameIdentity(rootIdentity,verifiedDirectory(root))&&matchesMarker(marker,markerAt(root)));requireStore(databaseHealth(handle,marker).state==='ready');handle.close();handle=undefined;
    const ready:C.ProductOwnerMarker={...marker,initializationState:'ready'},temporary=path.join(root,'owner-'+randomUUID()+'.tmp');writeExclusive(temporary,JSON.stringify(ready));requireStore(matchesMarker(marker,markerAt(root))&&sameIdentity(rootIdentity,verifiedDirectory(root)));renameSync(temporary,path.join(root,'owner.json'));this.roots=Object.freeze({...roots,marker:Object.freeze(ready)});
   }
   const current=this.roots!;for(const child of this.children(current))verifiedDirectory(child);
   if(!exists(current.database))return recover('missingExpectedDatabase');const stat=canonicalStat(current.database);requireStore(stat.isFile());if(sidecars(current.database)||!deleteJournalHeader(current.database))return recover('corruptDatabase');const expected=identityOf(stat);
   handle=new Database(current.database,{readonly:true,fileMustExist:true,timeout:0});handle.pragma('foreign_keys=ON');let health:C.StoreHealth;
   try{handle.exec('BEGIN');health=databaseHealth(handle,current.marker);if(health.state==='ready')this.verifyLocations(handle);handle.exec('ROLLBACK');}catch{try{handle.exec('ROLLBACK');}catch{}health={state:'readOnlyRecovery',reason:'corruptDatabase'};}
   handle.close();handle=undefined;if(health.state==='readOnlyRecovery')return recover(health.reason);requireStore(health.state==='ready');
   requireStore(sameIdentity(rootIdentity,verifiedDirectory(root))&&sameIdentity(expected,identityOf(canonicalStat(current.database)))&&matchesMarker(current.marker,markerAt(root))&&!sidecars(current.database));
   handle=new Database(current.database,{fileMustExist:true,timeout:0});handle.pragma('foreign_keys=ON');handle.pragma('synchronous=FULL');verifySchema(handle,current.marker);this.db=handle;handle=undefined;this.health={state:'ready'};this.remember();return success({roots:current,health:this.health});
  }catch{try{handle?.close();}catch{}return storeFailure('STORE_READ_ONLY');}
 }
 private verifyLocations(db:Database.Database){
  const roots=this.roots!;
  // Stream fixed-width records; never materialize an unbounded table in memory.
  for(const table of Object.values(TABLES))for(const row of db.prepare('SELECT * FROM '+table.name).iterate() as Iterable<Record<string,unknown>>)decode(table,row);
  const root=roots.marker.canonicalRoot;
  for(const row of db.prepare('SELECT * FROM repositories').iterate() as Iterable<Record<string,unknown>>){const r=decode<C.RepositoryRecord>(TABLES.repositories,row);requireStore(r.checkoutRoot!==root&&!contained(r.checkoutRoot,root)&&!contained(root,r.checkoutRoot));}
  for(const row of db.prepare('SELECT * FROM workspaces').iterate() as Iterable<Record<string,unknown>>){const w=decode<C.WorkspaceRecord>(TABLES.workspaces,row);requireStore(w.worktreePath===path.join(roots.workspaces,w.workspaceId)&&w.branchRef==='prd/'+(db.prepare('SELECT prd_id FROM prds WHERE workspace_id=?').get(w.workspaceId) as {prd_id:string}|undefined)?.prd_id);}
  for(const row of db.prepare('SELECT s.*,w.worktree_path FROM sessions s JOIN prds p ON p.prd_id=s.prd_id JOIN workspaces w ON w.workspace_id=p.workspace_id').iterate() as Iterable<Record<string,unknown>>){const s=decode<C.SessionRecord>(TABLES.sessions,row);requireStore(s.appSessionDir===path.join(roots.sessions,s.prdId)&&contained(s.appSessionDir,s.exactPath)&&path.dirname(s.exactPath)===s.appSessionDir&&s.expectedCwd===row.worktree_path);}
  for(const row of db.prepare('SELECT * FROM operations WHERE recovery_directory IS NOT NULL').iterate() as Iterable<Record<string,unknown>>){const o=decode<C.OperationRecord>(TABLES.operations,row);requireStore(o.recoveryDirectory===path.join(roots.recovery,o.operationId));}
  for(const row of db.prepare('SELECT * FROM save_recoveries').iterate() as Iterable<Record<string,unknown>>){const r=decode<C.SaveRecoveryRecord>(TABLES.save_recoveries,row),directory=path.join(roots.recovery,r.operationId);requireStore(contained(directory,r.preimagePath)&&contained(directory,r.intendedPath)&&r.preimagePath!==r.intendedPath);}
  for(const row of db.prepare('SELECT * FROM skill_bindings').iterate() as Iterable<Record<string,unknown>>){const r=decode<C.SkillBinding>(TABLES.skill_bindings,row);requireStore(contained(r.baseDir,r.sourcePath));}
 }
 transaction<T>(work:(tx:StoreTransaction)=>PortResult<T>):PortResult<T>{
  if(this.transactionActive)return storeFailure('BUSY');let live=false;
  try{
   this.guard();requireStore(typeof work==='function'&&Object.prototype.toString.call(work)!=='[object AsyncFunction]','INVALID_REQUEST');const db=this.db!;db.exec('BEGIN IMMEDIATE');this.transactionActive=true;live=true;
   const beforeVersions=new Map<string,C.RecordVersion|null>();const check=()=>requireStore(live&&this.transactionActive&&db.inTransaction,'STORE_READ_ONLY');
   const read=<R>(table:Table,id:string,column=table.key):R|null=>{check();const row=db.prepare('SELECT * FROM '+table.name+' WHERE '+column+'=?').get(id) as Record<string,unknown>|undefined;return row?decode<R>(table,row):null;};
   const many=<R>(table:Table,id:string,column:string):R[]=>{check();return (db.prepare('SELECT * FROM '+table.name+' WHERE '+column+'=? ORDER BY '+table.key+' LIMIT 33').all(id) as Record<string,unknown>[]).map(row=>decode<R>(table,row));};
   const put=(table:Table,record:unknown,extra:Record<string,string|number>={})=>{check();const row={...encode(table,record),...extra},columns=Object.keys(row);db.prepare('INSERT INTO '+table.name+'('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+') ON CONFLICT('+table.key+') DO UPDATE SET '+columns.filter(c=>c!==table.key).map(c=>c+'=excluded.'+c).join(',')).run(...Object.values(row));};
   const immutable=(old:unknown,record:unknown)=>requireStore(JSON.stringify(old)===JSON.stringify(record));
   const tx:StoreTransaction={
    repository:id=>read(TABLES.repositories,id),workspace:id=>read(TABLES.workspaces,id),prd:id=>read(TABLES.prds,id),document:id=>read(TABLES.documents,id),session:id=>read(TABLES.sessions,id,'prd_id'),operation:id=>read(TABLES.operations,id),operationByRequest:id=>read(TABLES.operations,id,'request_id'),latestOperation:id=>{check();const row=db.prepare('SELECT * FROM operations WHERE prd_id=? ORDER BY rowid DESC LIMIT 1').get(id) as Record<string,unknown>|undefined;return row?decode<C.OperationRecord>(TABLES.operations,row):null;},conventions:id=>many(TABLES.conventions,id,'workspace_id'),candidates:id=>many(TABLES.candidates,id,'prd_id'),skill:id=>read(TABLES.skill_bindings,id),recovery:id=>read(TABLES.save_recoveries,id),
    settings:()=>{const r=read<C.DefaultRepositoryRecord>(TABLES.settings,'1');requireStore(r);return r;},
    putRepository:r=>{check();encode(TABLES.repositories,r);const old=read<C.RepositoryRecord>(TABLES.repositories,r.repositoryId);if(old)immutable(old,r);put(TABLES.repositories,r);},
    putWorkspace:r=>{check();encode(TABLES.workspaces,r);const old=read<C.WorkspaceRecord>(TABLES.workspaces,r.workspaceId);if(old){for(const field of ['repositoryId','worktreePath','branchRef','baseRef','creationOperationId','originalHeadSha','originalBranchRef','originalIndexHash','originalTrackedChangesHash'] as const)requireStore(old[field]===r[field]);if(old.baseSha)requireStore(old.baseSha===r.baseSha);}put(TABLES.workspaces,r);},
    putPrd:(r,expected)=>{check();encode(TABLES.prds,r);const old=read<C.PrdRecord>(TABLES.prds,r.prdId);requireStore(old?old.version===expected:expected===null,'STALE_VERSION');if(!beforeVersions.has(r.prdId))beforeVersions.set(r.prdId,old?.version??null);if(old){requireStore(old.version!==r.version||(r.eventSequence>old.eventSequence&&Object.keys(old).every(key=>key==='eventSequence'||old[key as keyof C.PrdRecord]===r[key as keyof C.PrdRecord])),'STALE_VERSION');requireStore(old.workspaceId===r.workspaceId&&old.creationDate===r.creationDate&&old.initialIdea===r.initialIdea&&r.eventSequence>=old.eventSequence);if(old.documentId)requireStore(r.documentId===old.documentId&&r.plannedRelativePath===old.plannedRelativePath);if(old.sessionId)requireStore(r.sessionId===old.sessionId);}put(TABLES.prds,r);},
    putDocument:r=>{check();encode(TABLES.documents,r);const old=read<C.DocumentRecord>(TABLES.documents,r.documentId);if(old)requireStore(old.prdId===r.prdId&&old.relativePath===r.relativePath&&old.conventionId===r.conventionId);put(TABLES.documents,r);},
    putSession:r=>{check();encode(TABLES.sessions,r);const old=read<C.SessionRecord>(TABLES.sessions,r.sessionId);if(old){requireStore(old.prdId===r.prdId&&old.expectedCwd===r.expectedCwd&&old.appSessionDir===r.appSessionDir);if(old.state!=='allocated')requireStore(old.exactPath===r.exactPath&&r.state!=='allocated');}put(TABLES.sessions,r);},
    putOperation:r=>{check();encode(TABLES.operations,r);const old=read<C.OperationRecord>(TABLES.operations,r.operationId);if(old){requireStore(old.prdId===r.prdId&&old.requestId===r.requestId&&old.kind===r.kind&&old.expectedVersion===r.expectedVersion&&old.expectedDocumentRevision===r.expectedDocumentRevision&&r.lastSequence>=old.lastSequence);if(old.phase==='finished')immutable(old,r);}else{const p=read<C.PrdRecord>(TABLES.prds,r.prdId);requireStore(p);requireStore(r.expectedVersion===(beforeVersions.get(p.prdId)??p.version),'STALE_VERSION');}if(r.phase!=='finished')requireStore(!db.prepare("SELECT 1 FROM operations WHERE prd_id=? AND phase!='finished' AND operation_id!=?").get(r.prdId,r.operationId),'BUSY');put(TABLES.operations,r);},
    putConvention:r=>put(TABLES.conventions,r),putCandidate:r=>put(TABLES.candidates,r),putSkill:(prdId,r)=>put(TABLES.skill_bindings,r,{prd_id:prdId}),putRecovery:r=>put(TABLES.save_recoveries,r),
    putSettings:(r,expected)=>{check();const old=read<C.DefaultRepositoryRecord>(TABLES.settings,'1');requireStore(old&&old.version===expected&&r.version!==old.version,'STALE_VERSION');requireStore(r.lastRequestId!==null);put(TABLES.settings,r,{singleton:1});},
   };
   const result=work(tx);requireStore(result&&typeof result==='object'&&Object.getPrototypeOf(result)===Object.prototype&&typeof result.ok==='boolean','INVALID_REQUEST');live=false;
   if(!result.ok){db.exec('ROLLBACK');return result;}this.guard();verifyGraph(db);this.verifyLocations(db);db.exec('COMMIT');return result;
  }catch(error){try{if(this.db?.inTransaction)this.db.exec('ROLLBACK');}catch{}return this.fault(error);}finally{live=false;this.transactionActive=false;}
 }
 private repositoryView(r:C.RepositoryRecord):C.RepositoryView{const name=path.basename(r.checkoutRoot);return {repositoryId:r.repositoryId,displayName:Buffer.byteLength(name)>160?'Repository':name,verifiedDisplayPath:r.checkoutRoot};}
 private get<R>(table:Table,id:string,column=table.key):R|null{const row=this.db!.prepare('SELECT * FROM '+table.name+' WHERE '+column+'=?').get(id) as Record<string,unknown>|undefined;return row?decode<R>(table,row):null;}
 list(cursor:C.Cursor|null):PortResult<C.PrdListPage>{
  if(this.health.state==='readOnlyRecovery')return success({items:[],nextCursor:null,coverage:'complete',defaultRepository:{version:this.recoveryVersion,repository:null},store:this.health});
  try{
   this.guard();requireStore(!this.transactionActive,'BUSY');return this.db!.transaction(()=>{
    const db=this.db!,snapshot=String(db.pragma('data_version',{simple:true}))+':'+String((db.prepare('SELECT total_changes() AS n').get() as {n:number}).n),entry=cursor===null?undefined:this.cursors.get(cursor);requireStore(cursor===null||entry?.snapshot===snapshot,'STALE_VERSION');
    const rows=(entry?db.prepare('SELECT * FROM prds WHERE creation_date<? OR (creation_date=? AND prd_id>?) ORDER BY creation_date DESC,prd_id ASC LIMIT 51').all(entry.date,entry.date,entry.id):db.prepare('SELECT * FROM prds ORDER BY creation_date DESC,prd_id ASC LIMIT 51').all()) as Record<string,unknown>[];
    const records=rows.slice(0,50).map(row=>decode<C.PrdRecord>(TABLES.prds,row));const items:C.PrdSummary[]=records.map(p=>{
     const w=this.get<C.WorkspaceRecord>(TABLES.workspaces,p.workspaceId)!;const repository=this.get<C.RepositoryRecord>(TABLES.repositories,w.repositoryId)!;const document=p.documentId?this.get<C.DocumentRecord>(TABLES.documents,p.documentId):null,session=p.sessionId?this.get<C.SessionRecord>(TABLES.sessions,p.sessionId):null;
     return {prdId:p.prdId,workspaceId:p.workspaceId,repository:this.repositoryView(repository),version:p.version,displayName:p.displayName,creationDate:p.creationDate,lifecycle:p.lifecycle,workspaceState:w.state,document:document?(document.state==='available'?{state:'available',documentId:document.documentId,relativePath:document.relativePath,revision:document.revision.token,byteLength:document.revision.byteLength}:{state:document.state,documentId:document.documentId,relativePath:document.relativePath}):{state:'notRegistered'},session:session?{state:session.state,sessionId:session.sessionId,lastPersistedEntryId:session.lastPersistedEntryId}:{state:'notAllocated'},publication:'unavailable'};
    });
    const settings=this.get<C.DefaultRepositoryRecord>(TABLES.settings,'1')!,repository=settings.repositoryId?this.get<C.RepositoryRecord>(TABLES.repositories,settings.repositoryId):null;let nextCursor:C.Cursor|null=null;
    if(rows.length>50){const last=records.at(-1)!;nextCursor=token();this.cursors.set(nextCursor,{snapshot,date:last.creationDate,id:last.prdId});if(this.cursors.size>256)this.cursors.delete(this.cursors.keys().next().value!);}
    const page:C.PrdListPage={items,nextCursor,coverage:nextCursor?'more':'complete',defaultRepository:{version:settings.version,repository:repository?this.repositoryView(repository):null},store:this.health};requireStore(Buffer.byteLength(JSON.stringify(page))<=PRD_LIMITS.pageBytes,'LIMIT_EXCEEDED');return success(page);
   }).deferred();
  }catch(error){return this.fault(error);}
 }
 recoverInterrupted():PortResult<readonly C.OperationRecord[]>{
  return this.transaction(tx=>{
   // Bounded recovery batch; caller may repeat until empty. No external effects/replay.
   const rows=this.db!.prepare("SELECT * FROM operations WHERE phase!='finished' ORDER BY operation_id LIMIT 256").all() as Record<string,unknown>[];const recovered:C.OperationRecord[]=[];
   for(const row of rows){const o=decode<C.OperationRecord>(TABLES.operations,row),p=tx.prd(o.prdId)!;const next:C.OperationRecord={...o,phase:'finished',outcome:'interrupted',error:{code:'INTERRUPTED',message:PRD_ERROR_MESSAGES.INTERRUPTED,correlationId:o.operationId},stepState:'uncertain'};tx.putOperation(next);tx.putPrd({...p,version:token(),lifecycle:'interrupted'},p.version);recovered.push(next);}return success(recovered);
  });
 }
 async close():Promise<void>{if(this.transactionActive)throw new StoreFault('BUSY');try{this.db?.close();}finally{this.db=undefined;this.roots=undefined;this.identities=undefined;this.cursors.clear();this.health={state:'initializing'};}}
}
