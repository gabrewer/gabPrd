import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,lstatSync,realpathSync,renameSync,symlinkSync,linkSync,readdirSync} from 'node:fs';
import {fork} from 'node:child_process';
import Database from 'better-sqlite3';
import {PrdStore} from '../../src/main/prd-store';
import {PrdPaths} from '../../src/main/prd-paths';
import type * as C from '../../src/shared/prd-contracts';
import type {PortResult,ProductRoots,StoreTransaction} from '../../src/main/prd-ports';
const id=<T extends string>()=>randomUUID() as T;
const cp=(p:string)=>p as C.CanonicalPath;
const ok=<T>(value:T):PortResult<T>=>({ok:true,value});
function value<T>(r:PortResult<T>):T{assert.equal(r.ok,true,'valid owned persistence action must succeed');if(!r.ok)throw new Error('unexpected safe rejection');return r.value;}
function identity(p:string):C.FilesystemIdentity{const s=lstatSync(p,{bigint:true});return {device:String(s.dev),fileId:String(s.ino),birthtimeNs:String(s.birthtimeNs)};}
function fixture(){return realpathSync(mkdtempSync(path.join(process.env.PRD_NATIVE_FIXTURE_ROOT!,'store-case-')));}
async function context(t:{after:(fn:()=>Promise<void>)=>void}){
 const base=fixture(),userData=cp(path.join(base,'user-data'));mkdirSync(userData);const store=new PrdStore();t.after(()=>store.close());
 const opened=value(await store.open(userData));assert.equal(opened.health.state,'ready');return {base,userData,store,roots:opened.roots};
}
function records(base:string,roots:ProductRoots){
 const checkout=path.join(base,'selected'),common=path.join(checkout,'.git');mkdirSync(common,{recursive:true});
 const repository:C.RepositoryRecord={repositoryId:id(),checkoutRoot:cp(checkout),commonGitDir:cp(common),checkoutIdentity:identity(checkout),commonGitIdentity:identity(common),originFingerprint:'a'.repeat(64) as C.RepositoryRecord['originFingerprint']};
 const prdId=id<C.PrdId>(),workspaceId=id<C.WorkspaceId>(),operationId=id<C.OperationId>(),version=id<C.RecordVersion>();
 const workspace:C.WorkspaceRecord={workspaceId,repositoryId:repository.repositoryId,worktreePath:cp(path.join(roots.workspaces,workspaceId)),gitDir:null,worktreeIdentity:null,gitDirIdentity:null,originalHeadSha:'b'.repeat(40) as C.GitSha,originalBranchRef:'refs/heads/feature/owned',originalIndexHash:'c'.repeat(64) as C.WorkspaceRecord['originalIndexHash'],originalTrackedChangesHash:'d'.repeat(64) as C.WorkspaceRecord['originalTrackedChangesHash'],branchRef:'prd/'+prdId,baseRef:'refs/remotes/origin/main',baseSha:null,creationOperationId:operationId,state:'planned'};
 const prd:C.PrdRecord={prdId,workspaceId,displayName:'Owned draft',creationDate:'2026-10-16' as C.CreationDate,version,lifecycle:'createPending',initialIdea:'Preserve the original idea',conventionId:null,plannedRelativePath:null,eventSequence:0 as C.EventSequence,documentId:null,sessionId:null};
 const operation:C.OperationRecord={operationId,requestId:id(),prdId,sessionId:null,generationId:null,kind:'create',phase:'finished',outcome:'succeeded',error:null,expectedVersion:version,expectedDocumentRevision:null,lastSequence:0 as C.EventSequence,step:'fetchBase',stepState:'effectVerified',recoveryDirectory:null};
 return {repository,workspace,prd,operation};
}
function seed(store:PrdStore,r:ReturnType<typeof records>){value(store.transaction(tx=>{tx.putRepository(r.repository);tx.putWorkspace(r.workspace);tx.putPrd(r.prd,null);tx.putOperation(r.operation);return ok(true);}));}
function snapshot(file:string){const db=new Database(file,{readonly:true,fileMustExist:true});try{const names=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as {name:string}[];return names.map(({name})=>[name,db.prepare('SELECT * FROM '+name+' ORDER BY 1').all()]);}finally{db.close();}}
function admission(prd:C.PrdRecord):C.OperationRecord{return {operationId:id(),requestId:id(),prdId:prd.prdId,sessionId:null,generationId:null,kind:'send',phase:'starting',outcome:null,error:null,expectedVersion:prd.version,expectedDocumentRevision:null,lastSequence:0 as C.EventSequence,step:'prompt',stepState:'intent',recoveryDirectory:null};}
function child(file:string){const c=fork(process.argv[1]!,[],{execPath:process.execPath,env:{...process.env,PRD_STORE_CHILD:file},stdio:['ignore','ignore','ignore','ipc']});return {c,ready:new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{c.kill();reject(new Error('owned child startup timeout'));},15000);c.once('error',reject);c.once('exit',code=>{if(code!==0)reject(new Error('owned child exited'));});c.once('message',m=>{clearTimeout(timer);assert.deepEqual(m,{ready:true});resolve();});}),result:()=>new Promise<{ok:boolean;installationId?:string}>((resolve,reject)=>{const timer=setTimeout(()=>{c.kill();reject(new Error('owned child result timeout'));},15000);c.once('message',m=>{clearTimeout(timer);resolve(m as {ok:boolean;installationId?:string});});})};}
// Same real compiled suite is an owned, barrier-controlled process fixture, never a shipped hook.
if(process.env.PRD_STORE_CHILD){
 const input=JSON.parse(readFileSync(process.env.PRD_STORE_CHILD,'utf8')) as {userData:C.CanonicalPath;prd?:C.PrdRecord};
 process.send?.({ready:true});process.once('message',()=>{void(async()=>{const store=new PrdStore();const opened=await store.open(input.userData);let result:object={ok:opened.ok&&opened.value.health.state==='ready',installationId:opened.ok?opened.value.roots.marker.installationId:undefined};
 if(opened.ok&&input.prd){const a=admission(input.prd);const r=store.transaction(tx=>{tx.putPrd({...input.prd!,version:id()},input.prd!.version);tx.putOperation(a);return ok(true);});result={ok:r.ok};}await store.close();process.send?.(result,()=>process.disconnect());})().catch(()=>{process.exitCode=1;process.disconnect();});});
}else{
 test('P03 real Electron runtime and exclusive owned schema identity survive close/reopen',async t=>{
  assert.equal(process.versions.electron,'44.7.0');assert.equal(process.versions.modules,'149');const c=await context(t);const marker=JSON.parse(readFileSync(path.join(c.userData,'product-v1/owner.json'),'utf8'));assert.equal(marker.initializationState,'ready');assert.equal(marker.databaseExpected,true);
  const db=new Database(c.roots.database,{readonly:true});const names=db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all() as {name:string}[];for(const name of ['store_identity','settings','repositories','workspaces','prds','conventions','documents','sessions','operations','candidates','skill_bindings','save_recoveries'])assert.ok(names.some(n=>n.name===name));assert.equal((db.prepare('SELECT installation_id FROM store_identity').get() as {installation_id:string}).installation_id,marker.installationId);db.close();await c.store.close();const second=new PrdStore();t.after(()=>second.close());assert.equal(value(await second.open(c.userData)).roots.marker.installationId,marker.installationId);
 });
 test('P03 records/defaults and stable original associations persist through restart',async t=>{
  const c=await context(t),r=records(c.base,c.roots);seed(c.store,r);const initial=value(c.store.transaction(tx=>ok(tx.settings())));
  value(c.store.transaction(tx=>{tx.putSettings({version:id(),repositoryId:r.repository.repositoryId,lastRequestId:id()},initial.version);return ok(true);}));await c.store.close();const again=new PrdStore();t.after(()=>again.close());value(await again.open(c.userData));const page=value(again.list(null));assert.equal(page.items.length,1);assert.equal(page.items[0]!.prdId,r.prd.prdId);assert.equal(page.defaultRepository.repository!.repositoryId,r.repository.repositoryId);assert.deepEqual(value(again.transaction(tx=>ok(tx.prd(r.prd.prdId)))),r.prd);
 });
 test('P03 typed document/session/convention/candidate/skill/recovery roundtrips with matching reverse links',async t=>{
  const c=await context(t),r=records(c.base,c.roots);seed(c.store,r);mkdirSync(r.workspace.worktreePath);const gd=path.join(r.repository.commonGitDir,'worktrees',r.workspace.workspaceId);mkdirSync(gd,{recursive:true});
  const workspace:C.WorkspaceRecord={...r.workspace,state:'ready',baseSha:'e'.repeat(40) as C.GitSha,gitDir:cp(gd),worktreeIdentity:identity(r.workspace.worktreePath),gitDirIdentity:identity(gd)};
  const convention:C.ConventionRecord={conventionId:id(),workspaceId:workspace.workspaceId,relativeFolder:'docs/design',source:'fallback',selected:true};
  const revision:C.DiskRevisionRecord={token:id(),identity:identity(r.repository.checkoutRoot),sha256:'f'.repeat(64) as C.DiskRevisionRecord['sha256'],byteLength:12,mtimeNs:'1000000000'};
  const document:C.DocumentRecord={documentId:id(),prdId:r.prd.prdId,conventionId:convention.conventionId,relativePath:'docs/design/2026-10-16-owned.md' as C.RelativeMarkdownPath,revision,state:'available'};
  const sd=path.join(c.roots.sessions,r.prd.prdId);mkdirSync(sd);const session:C.SessionRecord={prdId:r.prd.prdId,sessionId:id(),exactPath:cp(path.join(sd,'allocated.jsonl')),appSessionDir:cp(sd),expectedCwd:workspace.worktreePath,state:'allocated',headerVersion:null,lastPersistedEntryId:null};
  const candidate:C.CandidateRecord={candidateId:id(),prdId:r.prd.prdId,conventionId:convention.conventionId,scanOperationId:r.operation.operationId,relativePath:document.relativePath,revision:revision.token,byteLength:revision.byteLength,observedAt:'2026-10-16T00:00:00.000Z' as C.IsoInstant,previewText:'# Owned',previewStatus:'complete',fingerprint:revision,preexisting:false};
  const skill:C.SkillBinding={name:'brainstorm',sourcePath:cp(path.join(c.base,'brainstorm.md')),baseDir:cp(c.base),identity:identity(c.base),contentSha256:'1'.repeat(64) as C.SkillBinding['contentSha256'],source:'userConfigured'};
  const op:C.OperationRecord={...r.operation,operationId:id(),requestId:id(),kind:'save',step:'saveDocument',expectedDocumentRevision:revision.token};const rd=path.join(c.roots.recovery,op.operationId);mkdirSync(rd);
  const recovery:C.SaveRecoveryRecord={operationId:op.operationId,documentId:document.documentId,baseRevision:revision.token,intendedSha256:revision.sha256,preimagePath:cp(path.join(rd,'preimage.md')),intendedPath:cp(path.join(rd,'intended.md')),phase:'verified'};
  value(c.store.transaction(tx=>{tx.putWorkspace(workspace);tx.putConvention(convention);tx.putDocument(document);tx.putSession(session);tx.putPrd({...r.prd,version:id(),lifecycle:'draftAvailable',conventionId:convention.conventionId,plannedRelativePath:document.relativePath,documentId:document.documentId,sessionId:session.sessionId},r.prd.version);tx.putCandidate(candidate);tx.putSkill(r.prd.prdId,skill);tx.putOperation(op);tx.putRecovery(recovery);return ok(true);}));
  assert.deepEqual(value(c.store.transaction(tx=>ok({doc:tx.document(document.documentId),session:tx.session(r.prd.prdId),conventions:tx.conventions(workspace.workspaceId),candidates:tx.candidates(r.prd.prdId),skill:tx.skill(r.prd.prdId),recovery:tx.recovery(op.operationId)}))),{doc:document,session,conventions:[convention],candidates:[candidate],skill,recovery});
 });
 test('P03 malformed/foreign/cross-record links and stale versions reject without DB changes',async t=>{
  const c=await context(t),r=records(c.base,c.roots);seed(c.store,r);const before=snapshot(c.roots.database);
  for(const action of [(tx:StoreTransaction)=>tx.putPrd({...r.prd,version:id()},id()),(tx:StoreTransaction)=>tx.putPrd({...r.prd,workspaceId:id(),version:id()},r.prd.version),(tx:StoreTransaction)=>tx.putWorkspace({...r.workspace,repositoryId:id()}),(tx:StoreTransaction)=>tx.putPrd({...r.prd,displayName:'x'.repeat(161),version:id()},r.prd.version),(tx:StoreTransaction)=>tx.putPrd({...r.prd,prdId:'BAD' as C.PrdId},null),(tx:StoreTransaction)=>tx.putSettings({version:id(),repositoryId:id(),lastRequestId:id()},value(c.store.transaction(x=>ok(x.settings()))).version)]){
   const result=c.store.transaction(tx=>{action(tx);return ok(true);});assert.equal(result.ok,false);assert.deepEqual(snapshot(c.roots.database),before);
  }
 });
 test('P03 direct SQLite foreign-key/check defenses and typed schema reject malformed writes',async t=>{
  const c=await context(t),r=records(c.base,c.roots);seed(c.store,r);await c.store.close();const db=new Database(c.roots.database);db.pragma('foreign_keys=ON');assert.equal(db.pragma('foreign_keys',{simple:true}),1);
  assert.throws(()=>db.prepare('UPDATE settings SET default_repository_id=?').run(id()));assert.throws(()=>db.prepare('UPDATE operations SET phase=?,outcome=?').run('finished',null));assert.throws(()=>db.prepare('UPDATE store_identity SET schema_version=2').run());db.close();
 });
 test('P03 failed callbacks roll back, scrub sentinel causes, reject async and revoke escaped transaction handles',async t=>{
  const c=await context(t),r=records(c.base,c.roots);const before=readFileSync(c.roots.database);const rejected=c.store.transaction(tx=>{tx.putRepository(r.repository);throw new Error('STORE_SENTINEL_NOT_PUBLIC');});assert.equal(rejected.ok,false);assert.doesNotMatch(JSON.stringify(rejected),/STORE_SENTINEL/);assert.deepEqual(readFileSync(c.roots.database),before);
  const asyncResult=c.store.transaction((async()=>ok(true)) as unknown as (tx:StoreTransaction)=>PortResult<boolean>);assert.equal(asyncResult.ok,false);
  let escaped:StoreTransaction|undefined;value(c.store.transaction(tx=>{escaped=tx;return ok(true);}));assert.throws(()=>escaped!.putRepository(r.repository));assert.deepEqual(readFileSync(c.roots.database),before);
 });
 test('P03 repository/store overlap is rejected before authoritative record changes',async t=>{
  const c=await context(t),r=records(c.base,c.roots),before=snapshot(c.roots.database);const p=path.join(c.userData,'product-v1');assert.equal(c.store.transaction(tx=>{tx.putRepository({...r.repository,checkoutRoot:cp(p),checkoutIdentity:identity(p)});return ok(true);}).ok,false);assert.deepEqual(snapshot(c.roots.database),before);
 });
 for(const failure of ['missing','corrupt','unsupported','foreign','incomplete'] as const)test('P03 '+failure+' existing store enters preservation-first recovery without reset',async t=>{
  const c=await context(t);await c.store.close();const marker=path.join(c.userData,'product-v1/owner.json');let database=c.roots.database;
  if(failure==='missing'){renameSync(database,database+'.retained');}
  if(failure==='corrupt')writeFileSync(database,'STORE_SENTINEL_CORRUPTION');
  if(failure==='unsupported'){const db=new Database(database);db.pragma('user_version=2');db.close();}
  if(failure==='foreign'){const db=new Database(database);db.prepare('UPDATE store_identity SET installation_id=?').run(id());db.close();}
  if(failure==='incomplete'){const m=JSON.parse(readFileSync(marker,'utf8'));m.initializationState='initializing';writeFileSync(marker,JSON.stringify(m));}
  const root=path.dirname(database),files=readdirSync(root).sort(),hashes=files.filter(f=>lstatSync(path.join(root,f)).isFile()).map(f=>[f,createHash('sha256').update(readFileSync(path.join(root,f))).digest('hex')]);
  const again=new PrdStore();t.after(()=>again.close());const opened=value(await again.open(c.userData));assert.equal(opened.health.state,'readOnlyRecovery');if(opened.health.state==='readOnlyRecovery')assert.equal(opened.health.reason,{missing:'missingExpectedDatabase',corrupt:'corruptDatabase',unsupported:'unsupportedSchema',foreign:'foreignOwnership',incomplete:'incompleteInitialization'}[failure]);assert.equal(again.transaction(()=>ok(true)).ok,false);assert.doesNotMatch(JSON.stringify(opened),/STORE_SENTINEL/);assert.deepEqual(readdirSync(root).sort(),files);for(const[f,hash]of hashes)assert.equal(createHash('sha256').update(readFileSync(path.join(root,f!))).digest('hex'),hash);
 });
 test('P03 interrupted initialization/foreign root is never adopted, completed or reseeded',async t=>{
  const root=fixture(),user=cp(path.join(root,'user'));mkdirSync(path.join(user,'product-v1'),{recursive:true});const sentinel=path.join(user,'product-v1/foreign.txt');writeFileSync(sentinel,'STORE_SENTINEL_FOREIGN');const store=new PrdStore();t.after(()=>store.close());assert.equal((await store.open(user)).ok,false);assert.equal(readFileSync(sentinel,'utf8'),'STORE_SENTINEL_FOREIGN');assert.deepEqual(readdirSync(path.dirname(sentinel)),['foreign.txt']);
 });
 test('P03 restart marks active intent interrupted once and never replays an external effect',async t=>{
  const c=await context(t),r=records(c.base,c.roots);seed(c.store,r);const a=admission(r.prd);value(c.store.transaction(tx=>{tx.putOperation(a);return ok(true);}));await c.store.close();const again=new PrdStore();t.after(()=>again.close());value(await again.open(c.userData));const recovered=value(again.recoverInterrupted());assert.equal(recovered.length,1);assert.equal(recovered[0]!.phase,'finished');assert.equal(recovered[0]!.outcome,'interrupted');assert.equal(recovered[0]!.stepState,'uncertain');assert.equal(value(again.transaction(tx=>ok(tx.prd(r.prd.prdId))))!.lifecycle,'interrupted');assert.deepEqual(value(again.recoverInterrupted()),[]);assert.deepEqual(readdirSync(c.roots.workspaces),[]);
 });
 test('P03 list has bounded stable cursor pages, foreign/stale cursor rejection and truthful defaults',async t=>{
  const c=await context(t);for(let n=0;n<52;n++){const r=records(path.join(c.base,'case-'+n),c.roots);seed(c.store,{...r,prd:{...r.prd,displayName:'Draft '+n}});}
  const page=value(c.store.list(null));assert.equal(page.items.length,50);assert.equal(page.coverage,'more');assert.ok(page.nextCursor);const second=value(c.store.list(page.nextCursor));assert.equal(second.items.length,2);assert.equal(new Set([...page.items,...second.items].map(p=>p.prdId)).size,52);assert.equal(c.store.list('foreign' as C.Cursor).ok,false);
  const old=page.nextCursor!,r=records(path.join(c.base,'newer'),c.roots);seed(c.store,r);assert.equal(c.store.list(old).ok,false);assert.equal(value(c.store.list(null)).defaultRepository.repository,null);
 });
 test('P03 genuine process initialization race has one shared store identity without duplicate authority',async t=>{
  const base=fixture(),userData=cp(path.join(base,'user'));mkdirSync(userData);const input=path.join(base,'init.json');writeFileSync(input,JSON.stringify({userData}));const a=child(input),b=child(input);await Promise.all([a.ready,b.ready]);const ar=a.result(),br=b.result();a.c.send('go');b.c.send('go');const results=await Promise.all([ar,br]);assert.ok(results.some(r=>r.ok));const ids=results.filter(r=>r.ok).map(r=>r.installationId);assert.equal(new Set(ids).size,1);const store=new PrdStore();t.after(()=>store.close());assert.equal(value(await store.open(userData)).roots.marker.installationId,ids[0]);
 });
 test('P03 genuine competing admissions cannot create two unfinished operations or silently change the version',async t=>{
  const c=await context(t),r=records(c.base,c.roots);seed(c.store,r);await c.store.close();const input=path.join(c.base,'admit.json');writeFileSync(input,JSON.stringify({userData:c.userData,prd:r.prd}));const a=child(input),b=child(input);await Promise.all([a.ready,b.ready]);const ar=a.result(),br=b.result();a.c.send('go');b.c.send('go');const results=await Promise.all([ar,br]);assert.equal(results.filter(r=>r.ok).length,1);const db=new Database(c.roots.database,{readonly:true});assert.equal((db.prepare("SELECT count(*) AS n FROM operations WHERE phase!='finished'").get() as {n:number}).n,1);db.close();
 });
 test('P03 canonical path helpers reject escape, ADS, aliases, junctions, hardlinks and changed identities without target mutation',async()=>{
  const base=fixture(),root=path.join(base,'workspace'),outside=path.join(base,'outside');mkdirSync(root);mkdirSync(outside);writeFileSync(path.join(outside,'sentinel.md'),'PATH_SENTINEL');const paths=new PrdPaths(),verified=value(await paths.verifyRoot(cp(root)));writeFileSync(path.join(root,'draft.md'),'# Original');const child=value(await paths.verifyChild(verified,'draft.md',null));
  for(const bad of ['../outside/sentinel.md','C:/outside.md','//server/share/file.md','draft.md:stream','./draft.md','sub/../draft.md','CON.md','draft.md.'])assert.equal((await paths.verifyChild(verified,bad,null)).ok,false);
  renameSync(child.path,path.join(root,'retained.md'));writeFileSync(child.path,'# Foreign');assert.equal((await paths.verifyChild(verified,'draft.md',child.identity)).ok,false);symlinkSync(outside,path.join(root,'linked'),'junction');assert.equal((await paths.verifyChild(verified,'linked/sentinel.md',null)).ok,false);linkSync(path.join(outside,'sentinel.md'),path.join(root,'hard.md'));assert.equal((await paths.verifyChild(verified,'hard.md',null)).ok,false);assert.equal(readFileSync(path.join(outside,'sentinel.md'),'utf8'),'PATH_SENTINEL');assert.equal(readFileSync(path.join(root,'retained.md'),'utf8'),'# Original');
 });
 test('P03 adversarial: foreign sqlite-prefixed schema objects cannot hide behind wildcard filtering or execute triggers',async t=>{
  const c=await context(t);await c.store.close();const db=new Database(c.roots.database);db.exec("CREATE TABLE sqliteEvil(value TEXT); CREATE TRIGGER sqliteEvilTrigger AFTER UPDATE ON settings BEGIN INSERT INTO sqliteEvil VALUES('OWNED_SENTINEL_EFFECT'); END;");db.close();const before=readFileSync(c.roots.database);const again=new PrdStore();t.after(()=>again.close());const opened=await again.open(c.userData);assert.ok(!opened.ok||opened.value.health.state==='readOnlyRecovery','foreign triggers must not obtain a writable ready store');assert.equal(again.transaction(()=>ok(true)).ok,false);await again.close();assert.deepEqual(readFileSync(c.roots.database),before);const check=new Database(c.roots.database,{readonly:true});assert.equal((check.prepare('SELECT count(*) AS n FROM sqliteEvil').get() as {n:number}).n,0);check.close();
 });
 test('P03 adversarial: materialized sessions require a non-null verified header, including direct SQL CHECK enforcement',async t=>{
  const c=await context(t),r=records(c.base,c.roots);seed(c.store,r);const sd=path.join(c.roots.sessions,r.prd.prdId);mkdirSync(sd);const session:C.SessionRecord={prdId:r.prd.prdId,sessionId:id(),exactPath:cp(path.join(sd,'allocated.jsonl')),appSessionDir:cp(sd),expectedCwd:r.workspace.worktreePath,state:'allocated',headerVersion:null,lastPersistedEntryId:null};
  value(c.store.transaction(tx=>{tx.putSession(session);tx.putPrd({...r.prd,version:id(),sessionId:session.sessionId},r.prd.version);return ok(true);}));const before=snapshot(c.roots.database);assert.equal(c.store.transaction(tx=>{tx.putSession({...session,state:'materialized',headerVersion:null});return ok(true);}).ok,false,'NULL must not satisfy materialization authority');assert.deepEqual(snapshot(c.roots.database),before);await c.store.close();const db=new Database(c.roots.database);assert.throws(()=>db.prepare("UPDATE sessions SET materialization_state='materialized',header_version=NULL").run(),{code:'SQLITE_CONSTRAINT_CHECK'});db.close();
 });
 test('P03 adversarial: partial nullable identity groups cannot become typed filesystem authority',async t=>{
  const c=await context(t),r=records(c.base,c.roots);seed(c.store,r);const before=snapshot(c.roots.database);const identity={device:'1',fileId:null,birthtimeNs:null} as unknown as C.FilesystemIdentity;assert.equal(c.store.transaction(tx=>{tx.putWorkspace({...r.workspace,worktreeIdentity:identity});return ok(true);}).ok,false);assert.deepEqual(snapshot(c.roots.database),before);
 });
 test('P03 adversarial: missing required settings singleton cannot reopen as a writable ready store',async t=>{
  const c=await context(t);await c.store.close();const db=new Database(c.roots.database);db.prepare('DELETE FROM settings').run();db.close();const before=readFileSync(c.roots.database),again=new PrdStore();t.after(()=>again.close());const opened=await again.open(c.userData);assert.ok(!opened.ok||opened.value.health.state==='readOnlyRecovery','missing required initialization rows must not grant write authority');assert.equal(again.transaction(()=>ok(true)).ok,false);await again.close();assert.deepEqual(readFileSync(c.roots.database),before);
 });
 test('P03 adversarial: document cannot claim a valid convention while selecting an existing file outside that folder',async t=>{
  const c=await context(t),r=records(c.base,c.roots);seed(c.store,r);mkdirSync(r.workspace.worktreePath);const gd=path.join(r.repository.commonGitDir,'worktrees',r.workspace.workspaceId);mkdirSync(gd,{recursive:true});const workspace:C.WorkspaceRecord={...r.workspace,state:'ready',baseSha:'e'.repeat(40) as C.GitSha,gitDir:cp(gd),worktreeIdentity:identity(r.workspace.worktreePath),gitDirIdentity:identity(gd)};
  const convention:C.ConventionRecord={conventionId:id(),workspaceId:workspace.workspaceId,relativeFolder:'docs/design',source:'fallback',selected:true};const relative='other/2026-10-16-owned.md' as C.RelativeMarkdownPath,file=path.join(workspace.worktreePath,...relative.split('/'));mkdirSync(path.dirname(file));writeFileSync(file,'# Existing protected file');const stat=lstatSync(file,{bigint:true});const revision:C.DiskRevisionRecord={token:id(),identity:identity(file),sha256:createHash('sha256').update(readFileSync(file)).digest('hex') as C.DiskRevisionRecord['sha256'],byteLength:Number(stat.size),mtimeNs:String(stat.mtimeNs)};const document:C.DocumentRecord={documentId:id(),prdId:r.prd.prdId,relativePath:relative,conventionId:convention.conventionId,revision,state:'available'};
  const before=snapshot(c.roots.database);assert.equal(c.store.transaction(tx=>{tx.putWorkspace(workspace);tx.putConvention(convention);tx.putDocument(document);tx.putPrd({...r.prd,version:id(),lifecycle:'draftAvailable',conventionId:convention.conventionId,plannedRelativePath:relative,documentId:document.documentId},r.prd.version);return ok(true);}).ok,false,'valid foreign keys do not prove the selected convention contains the document');assert.deepEqual(snapshot(c.roots.database),before);assert.equal(readFileSync(file,'utf8'),'# Existing protected file');
 });
 test('P03 adversarial: WAL-mode stores are rejected before SQLite can create sidecars',async t=>{
  const c=await context(t);await c.store.close();const db=new Database(c.roots.database);assert.equal(db.pragma('journal_mode=WAL',{simple:true}),'wal');db.close();const root=path.dirname(c.roots.database),before=readFileSync(c.roots.database),files=readdirSync(root).sort();const again=new PrdStore();t.after(()=>again.close());const opened=await again.open(c.userData);assert.ok(!opened.ok||opened.value.health.state==='readOnlyRecovery');assert.deepEqual(readdirSync(root).sort(),files);assert.deepEqual(readFileSync(c.roots.database),before);
 });
 test('P03 adversarial: hardlinked expected database is refused without changing either retained alias',async t=>{
  const c=await context(t);await c.store.close();const retained=c.roots.database+'.retained';renameSync(c.roots.database,retained);linkSync(retained,c.roots.database);const before=readFileSync(retained),again=new PrdStore();t.after(()=>again.close());assert.equal((await again.open(c.userData)).ok,false);assert.deepEqual(readFileSync(retained),before);assert.deepEqual(readFileSync(c.roots.database),before);
 });
 test('P03 replacing expected marker identity prevents writes and preserves both objects',async t=>{
  const c=await context(t),r=records(c.base,c.roots);seed(c.store,r);const marker=path.join(c.userData,'product-v1/owner.json');renameSync(marker,marker+'.retained');writeFileSync(marker,readFileSync(marker+'.retained'));const before=snapshot(c.roots.database);assert.equal(c.store.transaction(tx=>{tx.putPrd({...r.prd,version:id()},r.prd.version);return ok(true);}).ok,false);assert.deepEqual(snapshot(c.roots.database),before);assert.deepEqual(readFileSync(marker),readFileSync(marker+'.retained'));
 });
}
