import assert from 'node:assert/strict';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,realpathSync,unlinkSync,utimesSync,statSync,renameSync,symlinkSync} from 'node:fs';
import Database from 'better-sqlite3';
import {PrdStore} from '../../src/main/prd-store';
import {PrdWorkspace} from '../../src/main/prd-workspace';
import {PrdDocuments} from '../../src/main/prd-documents';
import type {DocumentSaveHooks} from '../../src/main/prd-documents';
import {resolvePrdLocation} from '../../src/main/prd-location';
import type {PortResult,DocumentSaveInput} from '../../src/main/prd-ports';
import type * as C from '../../src/shared/prd-contracts';
import {PRD_LIMITS as L} from '../../src/shared/prd-contracts';
export const id=<T extends string>()=>randomUUID() as T;
export const ok=<T>(value:T):PortResult<T>=>({ok:true,value});
export function value<T>(result:PortResult<T>):T{assert.equal(result.ok,true,'real owned boundary must succeed');if(!result.ok)throw Error('Safe rejection');return result.value;}
function git(cwd:string,...args:string[]){return execFileSync('git',['-c','core.fsmonitor=false','-c','gc.auto=0','-C',cwd,...args],{env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0',GCM_INTERACTIVE:'never'},encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();}
export async function fixture(t:{after:(fn:()=>Promise<unknown>)=>void},hooks:DocumentSaveHooks={}){
 assert.equal(process.versions.modules,'149');const base=realpathSync(mkdtempSync(path.join(process.env.PRD_NATIVE_FIXTURE_ROOT!,'document-case-'))),remote=path.join(base,'remote.git'),author=path.join(base,'author'),checkout=path.join(base,'checkout');
 git(base,'init','--bare','--initial-branch=main',remote);git(base,'init','-b','main',author);git(author,'config','user.name','Owned fixture');git(author,'config','user.email','owned@example.invalid');writeFileSync(path.join(author,'README.md'),'# PRD Creator\n');writeFileSync(path.join(author,'AGENTS.md'),'PRDs: `docs/design/` or `requirements/`.\n');git(author,'add','README.md','AGENTS.md');git(author,'commit','-m','owned base');git(author,'remote','add','origin',remote);git(author,'push','origin','main');git(base,'clone',remote,checkout);
 const userData=path.join(base,'profile') as C.CanonicalPath;mkdirSync(userData);const store=new PrdStore();t.after(()=>store.close());const opened=value(await store.open(userData)),roots=opened.roots,workspacePort=new PrdWorkspace(store,roots),repository=value(await workspacePort.register(checkout as C.CanonicalPath));
 const prdId=id<C.PrdId>(),workspaceId=id<C.WorkspaceId>(),operationId=id<C.OperationId>(),version=id<C.RecordVersion>(),planned=value(await workspacePort.plan(repository,prdId,workspaceId,operationId));
 const initial:C.PrdRecord={prdId,workspaceId,displayName:'PRD Creator',creationDate:'2026-10-18' as C.CreationDate,version,lifecycle:'createPending',initialIdea:'A Windows app for interactive PRD creation.',conventionId:null,plannedRelativePath:null,eventSequence:0 as C.EventSequence,documentId:null,sessionId:null};
 const operation:C.OperationRecord={operationId,requestId:id(),prdId,sessionId:null,generationId:null,kind:'create',phase:'starting',outcome:null,error:null,expectedVersion:version,expectedDocumentRevision:null,lastSequence:0 as C.EventSequence,step:'fetchBase',stepState:'intent',recoveryDirectory:null};
 value(store.transaction(tx=>{tx.putPrd(initial,null);tx.putWorkspace(planned);tx.putOperation(operation);return ok(true);}));const workspace=value(await workspacePort.provision(repository,planned,operation)).workspace,conventions=value(await workspacePort.conventions(workspace));
 value(store.transaction(tx=>{for(const convention of conventions)tx.putConvention(convention);const old=tx.operation(operationId)!;tx.putOperation({...old,phase:'finished',outcome:'succeeded',error:null,stepState:'effectVerified'});return ok(true);}));
 const docs=new PrdDocuments(store,roots,workspacePort,hooks),prd=()=>value(store.transaction(tx=>ok(tx.prd(prdId))))!,document=()=>value(store.transaction(tx=>ok(tx.document(tx.prd(prdId)!.documentId!))))!;
 const file=(relative:string)=>path.join(workspace.worktreePath,...relative.split('/'));
 const produce=(folderIndex=0,text='# PRD Creator\n\nInteractive brainstorm and document review.\n')=>{const relative=value(resolvePrdLocation(prd().displayName,prd().creationDate,conventions[folderIndex]!));mkdirSync(path.dirname(file(relative)),{recursive:true});writeFileSync(file(relative),text);return {relative,path:file(relative),text};};
 const register=async()=>{const page=value(await docs.candidates(prd(),workspace));assert.equal(page.coverage,'complete');const candidate=value(store.transaction(tx=>ok(tx.candidates(prdId))))[0]!;return value(await docs.register(prd(),workspace,candidate));};
 const saveIntent=(text:string):DocumentSaveInput=>{const p=prd(),d=document(),op:C.OperationRecord={operationId:id(),requestId:id(),prdId,sessionId:null,generationId:null,kind:'save',phase:'starting',outcome:null,error:null,expectedVersion:p.version,expectedDocumentRevision:d.revision.token,lastSequence:0 as C.EventSequence,step:'saveDocument',stepState:'intent',recoveryDirectory:null};value(store.transaction(tx=>{tx.putPrd({...p,version:id()},p.version);tx.putOperation(op);return ok(true);}));return {prd:prd(),workspace,document:d,operation:op,text};};
 const snapshot=()=>{const db=new Database(roots.database,{readonly:true});try{return ['prds','documents','operations','save_recoveries','candidates'].map(table=>db.prepare('SELECT * FROM '+table+' ORDER BY 1').all());}finally{db.close();}};
 return {base,userData,store,roots,workspacePort,workspace,conventions,docs,prdId,prd,document,file,produce,register,saveIntent,snapshot};
}

