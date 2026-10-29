/** Fixed schema-1 columns/codecs. No record JSON blobs, migrations or credential fields. */
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type Database from 'better-sqlite3';
import {PRD_ERROR_MESSAGES,PRD_LIMITS} from '../shared/prd-contracts';
import type {PrdError,PrdErrorCode,RequestId} from '../shared/prd-contracts';
import type {PortResult} from './prd-ports';
export class StoreFault extends Error{constructor(readonly code:PrdErrorCode){super('Persistence operation rejected.');}}
export function requireStore(condition:unknown,code:PrdErrorCode='LINK_CHANGED'):asserts condition{if(!condition)throw new StoreFault(code);}
export function storeFailure<T>(code:PrdErrorCode='STORE_READ_ONLY'):PortResult<T>{return {ok:false,error:{code,message:PRD_ERROR_MESSAGES[code],correlationId:randomUUID() as RequestId} as PrdError};}
type Field=readonly[key:string,column:string,rule:string,nullable?:boolean];
export interface Table {readonly name:string;readonly key:string;readonly fields:readonly Field[];readonly groups:readonly string[];readonly sql:string}
const quote=(v:string)=>"'"+v.replaceAll("'","''")+"'";
const enumeration=(...v:string[])=>'e:'+v.join('|');
const identity=(key:string,prefix:string,nullable=false):Field[]=>[['device','device'],['fileId','file_id'],['birthtimeNs','birthtime_ns']].map(([property,column])=>[key+'.'+property,prefix+'_'+column,'decimal',nullable]);
const fingerprint=(key:string,prefix:string):Field[]=>[[key+'.token',prefix+'_token','uuid'],...identity(key+'.identity',prefix),[key+'.sha256',prefix+'_sha256','sha256'],[key+'.byteLength',prefix+'_byte_length','n:'+PRD_LIMITS.documentBytes],[key+'.mtimeNs',prefix+'_mtime_ns','decimal']];
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function component(v:string){return v.length>0&&v!=='.'&&v!=='..'&&v.length<=255&&!/[<>:"/\\|?*\u0000-\u001f]/.test(v)&&!/[. ]$/.test(v)&&!/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(v);}
function valid(rule:string,v:unknown):boolean{
 if(rule==='bool')return typeof v==='boolean';
 if(rule.startsWith('n:'))return typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=Number(rule.slice(2));
 if(typeof v!=='string'||v.includes('\0'))return false;
 if(rule.startsWith('e:'))return rule.slice(2).split('|').includes(v);
 if(rule.startsWith('s:'))return Buffer.byteLength(v)<=Number(rule.slice(2));
 if(rule==='uuid')return uuidPattern.test(v);
 if(rule==='decimal')return /^\d{1,64}$/.test(v);
 if(rule==='sha256'||rule==='sha1')return new RegExp('^[a-f0-9]{'+(rule==='sha256'?64:40)+'}$').test(v);
 if(rule==='date')return /^\d{4}-\d\d-\d\d$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 if(rule==='instant')return /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
 if(rule==='path'){const root=path.parse(v).root;return v.length>root.length&&Buffer.byteLength(v)<=4096&&path.isAbsolute(v)&&path.resolve(v)===v&&v.slice(root.length).split(path.sep).every(component);}
 if(rule==='folder'||rule==='md')return Buffer.byteLength(v)<=1024&&v.split('/').every(component)&&(rule==='folder'||(/\.md$/i.test(v)&&Buffer.byteLength(v.split('/').at(-1)!)<=200));
 return false;
}
function column([,name,rule,nullable]:Field):string{
 const numeric=rule==='bool'||rule.startsWith('n:'),checks:string[]=[];
 if(rule==='bool')checks.push(name+' IN (0,1)');
 else if(rule.startsWith('n:'))checks.push(name+' BETWEEN 0 AND '+Number(rule.slice(2)));
 else{
  let limit=rule.startsWith('s:')?Number(rule.slice(2)):rule==='path'?4096:rule==='md'||rule==='folder'?1024:rule==='instant'?24:rule==='date'?10:rule==='decimal'?64:256;
  checks.push('length(CAST('+name+' AS BLOB)) <= '+limit,'instr('+name+',char(0))=0');
  if(!rule.startsWith('s:'))checks.push('length('+name+')>0');
  if(rule.startsWith('e:'))checks.push(name+' IN ('+rule.slice(2).split('|').map(quote).join(',')+')');
  if(rule==='uuid')checks.push('length('+name+')=36',...[9,14,19,24].map(n=>'substr('+name+','+n+",1)='-'"),"replace("+name+",'-','') NOT GLOB '*[^0-9a-f]*'",'length(replace('+name+",'-',''))=32",'substr('+name+",15,1) IN ('1','2','3','4','5','6','7','8')",'substr('+name+",20,1) IN ('8','9','a','b')");
  if(rule==='sha256'||rule==='sha1')checks.push('length('+name+')='+(rule==='sha256'?64:40),name+" NOT GLOB '*[^0-9a-f]*'");
  if(rule==='decimal')checks.push(name+" NOT GLOB '*[^0-9]*'");
 }
 return name+' '+(numeric?'INTEGER':'TEXT')+(nullable?'':' NOT NULL')+' CHECK('+(nullable?name+' IS NULL OR (':'')+checks.join(' AND ')+(nullable?')':'')+')';
}
function table(name:string,key:string,fields:readonly Field[],constraints:string[],groups:string[]=[]):Table{
 const isConstraint=(sql:string)=>/^(?:PRIMARY KEY|FOREIGN KEY|UNIQUE|CHECK)\(/.test(sql);
 const groupChecks=groups.map(group=>{const columns=fields.filter(field=>field[0].startsWith(group+'.')).map(field=>field[1]);return 'CHECK(('+columns.map(column=>column+' IS NULL').join(' AND ')+') OR ('+columns.map(column=>column+' IS NOT NULL').join(' AND ')+'))';});
 const sql='CREATE TABLE '+name+' ('+[...fields.map(column),...constraints.filter(sql=>!isConstraint(sql)),...constraints.filter(isConstraint),...groupChecks].join(', ')+') STRICT';return {name,key,fields,groups,sql};
}
const fk=(column:string,target:string,key:string)=>'FOREIGN KEY('+column+') REFERENCES '+target+'('+key+') DEFERRABLE INITIALLY DEFERRED';
const uuid=(key:string,column=key):Field=>[key,column,'uuid'];
const text=(key:string,column:string,size:number,nullable=false):Field=>[key,column,'s:'+size,nullable];
const max='n:'+Number.MAX_SAFE_INTEGER;
export const TABLES={
 settings:table('settings','singleton',[[...uuid('version')],['repositoryId','default_repository_id','uuid',true],['lastRequestId','last_request_id','uuid',true]],['singleton INTEGER PRIMARY KEY CHECK(singleton=1)',fk('default_repository_id','repositories','repository_id')]),
 repositories:table('repositories','repository_id',[uuid('repositoryId','repository_id'),['checkoutRoot','checkout_root','path'],['commonGitDir','common_git_dir','path'],...identity('checkoutIdentity','checkout'),...identity('commonGitIdentity','common_git'),['originFingerprint','origin_fingerprint','sha256']],['PRIMARY KEY(repository_id)','UNIQUE(checkout_root)',"display_name TEXT NOT NULL DEFAULT 'Repository' CHECK(length(CAST(display_name AS BLOB)) BETWEEN 1 AND 160)"]),
 workspaces:table('workspaces','workspace_id',[uuid('workspaceId','workspace_id'),uuid('repositoryId','repository_id'),['worktreePath','worktree_path','path'],['gitDir','git_dir','path',true],...identity('worktreeIdentity','worktree',true),...identity('gitDirIdentity','git_dir',true),['originalHeadSha','original_head_sha','sha1'],text('originalBranchRef','original_branch_ref',1024,true),['originalIndexHash','original_index_hash','sha256'],['originalTrackedChangesHash','original_tracked_changes_hash','sha256'],text('branchRef','branch_ref',1024),['baseRef','base_ref',enumeration('refs/remotes/origin/main')],['baseSha','base_sha','sha1',true],uuid('creationOperationId','creation_operation_id'),['state','state',enumeration('planned','baseFetched','branchCreated','worktreeCreated','ready','recoveryRequired')]],['PRIMARY KEY(workspace_id)','UNIQUE(worktree_path)','UNIQUE(repository_id,branch_ref)',fk('repository_id','repositories','repository_id'),fk('creation_operation_id','operations','operation_id'),"CHECK(state NOT IN ('baseFetched','branchCreated','worktreeCreated','ready') OR base_sha IS NOT NULL)","CHECK(state NOT IN ('worktreeCreated','ready') OR (git_dir IS NOT NULL AND worktree_device IS NOT NULL AND worktree_file_id IS NOT NULL AND worktree_birthtime_ns IS NOT NULL AND git_dir_device IS NOT NULL AND git_dir_file_id IS NOT NULL AND git_dir_birthtime_ns IS NOT NULL))"],['worktreeIdentity','gitDirIdentity']),
 prds:table('prds','prd_id',[uuid('prdId','prd_id'),uuid('workspaceId','workspace_id'),text('displayName','display_name',160),['creationDate','creation_date','date'],uuid('version'),['lifecycle','lifecycle',enumeration('createPending','brainstormActive','draftAvailable','failed','interrupted')],text('initialIdea','initial_idea',65536),['conventionId','convention_id','uuid',true],['plannedRelativePath','planned_relative_path','md',true],['eventSequence','event_sequence',max],['documentId','document_id','uuid',true],['sessionId','session_id','uuid',true]],['PRIMARY KEY(prd_id)','UNIQUE(workspace_id)','UNIQUE(document_id)','UNIQUE(session_id)',fk('workspace_id','workspaces','workspace_id'),fk('convention_id','conventions','convention_id'),fk('document_id','documents','document_id'),fk('session_id','sessions','session_id'),"CHECK(length(CAST(display_name AS BLOB))>0)","CHECK(length(CAST(initial_idea AS BLOB))>0)","CHECK(lifecycle!='draftAvailable' OR document_id IS NOT NULL)"]),
 conventions:table('conventions','convention_id',[uuid('conventionId','convention_id'),uuid('workspaceId','workspace_id'),['relativeFolder','relative_folder','folder'],['source','source',enumeration('instructions','existing','fallback')],['selected','selected','bool']],['PRIMARY KEY(convention_id)',fk('workspace_id','workspaces','workspace_id')]),
 documents:table('documents','document_id',[uuid('documentId','document_id'),uuid('prdId','prd_id'),['relativePath','relative_path','md'],uuid('conventionId','convention_id'),...fingerprint('revision','revision'),['state','state',enumeration('available','missing','invalid')]],['PRIMARY KEY(document_id)','UNIQUE(prd_id)','UNIQUE(prd_id,relative_path)',fk('prd_id','prds','prd_id'),fk('convention_id','conventions','convention_id')]),
 sessions:table('sessions','session_id',[uuid('prdId','prd_id'),uuid('sessionId','session_id'),['exactPath','exact_path','path'],['appSessionDir','app_session_dir','path'],['expectedCwd','expected_cwd','path'],['state','materialization_state',enumeration('allocated','materialized','missing','corrupt','linkageMismatch')],['headerVersion','header_version','n:3',true],['lastPersistedEntryId','last_persisted_entry_id','s:128',true]],['PRIMARY KEY(session_id)','UNIQUE(prd_id)','UNIQUE(exact_path)',fk('prd_id','prds','prd_id'),"CHECK(materialization_state!='materialized' OR (header_version IS NOT NULL AND header_version=3))","CHECK(materialization_state!='allocated' OR (header_version IS NULL AND last_persisted_entry_id IS NULL))"]),
 operations:table('operations','operation_id',[uuid('operationId','operation_id'),uuid('requestId','request_id'),uuid('prdId','prd_id'),['sessionId','session_id','uuid',true],['generationId','generation_id','uuid',true],['kind','kind',enumeration('create','brainstorm','send','piRevision','save','reopen','cancel','reconcile','workspaceRetry')],['phase','phase',enumeration('starting','running','awaitingUiResponse','cancelling','reconciling','finished')],['outcome','outcome',enumeration('succeeded','cancelled','failed','interrupted','handledWithoutRun'),true],['error.code','error_code',enumeration(...Object.keys(PRD_ERROR_MESSAGES)),true],['error.message','error_message',enumeration(...Object.values(PRD_ERROR_MESSAGES)),true],['error.correlationId','error_correlation_id','uuid',true],uuid('expectedVersion','expected_version'),['expectedDocumentRevision','expected_document_revision','uuid',true],['lastSequence','last_sequence',max],['step','step',enumeration('fetchBase','createBranch','createWorktree','allocateSession','prompt','saveDocument','reconcile','closeUtility')],['stepState','step_state',enumeration('intent','effectVerified','uncertain')],['recoveryDirectory','recovery_directory','path',true]],['PRIMARY KEY(operation_id)','UNIQUE(request_id)',fk('prd_id','prds','prd_id'),fk('session_id','sessions','session_id'),"CHECK((phase='finished')=(outcome IS NOT NULL))","CHECK((outcome IN ('failed','interrupted') AND error_code IS NOT NULL AND error_message IS NOT NULL AND error_correlation_id IS NOT NULL) OR ((outcome IS NULL OR outcome NOT IN ('failed','interrupted')) AND error_code IS NULL AND error_message IS NULL AND error_correlation_id IS NULL))",'CHECK(error_code IS NULL OR error_message=CASE error_code '+Object.entries(PRD_ERROR_MESSAGES).map(([code,message])=>'WHEN '+quote(code)+' THEN '+quote(message)).join(' ')+' END)'],['error']),
 candidates:table('candidates','candidate_id',[uuid('candidateId','candidate_id'),uuid('prdId','prd_id'),uuid('conventionId','convention_id'),uuid('scanOperationId','scan_operation_id'),['relativePath','relative_path','md'],uuid('revision','revision_token'),['byteLength','byte_length','n:2097152'],['observedAt','observed_at','instant'],text('previewText','preview_text',8192),['previewStatus','preview_status',enumeration('complete','truncated')],...fingerprint('fingerprint','fingerprint'),['preexisting','preexisting','bool']],['PRIMARY KEY(candidate_id)',fk('prd_id','prds','prd_id'),fk('convention_id','conventions','convention_id'),fk('scan_operation_id','operations','operation_id'),'CHECK(revision_token=fingerprint_token AND byte_length=fingerprint_byte_length)']),
 skill_bindings:table('skill_bindings','prd_id',[['name','configured_name',enumeration('brainstorm')],['sourcePath','source_path','path'],['baseDir','base_dir','path'],...identity('identity','source'),['contentSha256','content_sha256','sha256'],['source','source',enumeration('worktreeConfigured','worktreeDiscovered','userConfigured','userDiscovered','package','extension')]],['prd_id TEXT PRIMARY KEY',fk('prd_id','prds','prd_id')]),
 save_recoveries:table('save_recoveries','operation_id',[uuid('operationId','operation_id'),uuid('documentId','document_id'),uuid('baseRevision','base_revision'),['intendedSha256','intended_sha256','sha256'],['preimagePath','preimage_path','path'],['intendedPath','intended_path','path'],['phase','phase',enumeration('reserved','prepared','replaced','verified','uncertain')]],['PRIMARY KEY(operation_id)',fk('operation_id','operations','operation_id'),fk('document_id','documents','document_id')]),
} as const;
export const IDENTITY_SQL='CREATE TABLE store_identity (singleton INTEGER PRIMARY KEY CHECK(singleton=1), schema_version INTEGER NOT NULL CHECK(schema_version=1), installation_id TEXT NOT NULL UNIQUE, canonical_root TEXT NOT NULL) STRICT';
export const INDEX_SQL=["CREATE UNIQUE INDEX operations_one_foreground ON operations(prd_id) WHERE phase!='finished'",'CREATE UNIQUE INDEX conventions_one_selected ON conventions(workspace_id) WHERE selected=1','CREATE INDEX prds_list_order ON prds(creation_date DESC,prd_id ASC)'];
export const SCHEMA_SQL=[IDENTITY_SQL,...Object.values(TABLES).map(t=>t.sql),...INDEX_SQL].join(';');
function shape(table:Table){const root:Record<string,unknown>={};for(const[field]of table.fields){let node=root;const parts=field.split('.');for(const part of parts.slice(0,-1)){node[part]??={};node=node[part] as Record<string,unknown>;}node[parts.at(-1)!]=true;}return root;}
export function encode(table:Table,record:unknown):Record<string,string|number|null>{
 const fields=new Map(table.fields.map(f=>[f[0],f]));const output:Record<string,string|number|null>={};
 function walk(object:unknown,tree:Record<string,unknown>,prefix=''){
  requireStore(object&&typeof object==='object'&&!Array.isArray(object)&&Object.getPrototypeOf(object)===Object.prototype);const descriptors=Object.getOwnPropertyDescriptors(object);requireStore(Reflect.ownKeys(object).length===Object.keys(tree).length);
  for(const [key,child]of Object.entries(tree)){const descriptor=descriptors[key];requireStore(descriptor&&descriptor.enumerable&&'value'in descriptor);const name=prefix?prefix+'.'+key:key,v:unknown=descriptor.value;
   if(child===true){const field=fields.get(name)!;requireStore(v===null?field[3]&&!table.groups.some(group=>name.startsWith(group+'.')):valid(field[2],v));output[field[1]]=typeof v==='boolean'?(v?1:0):v as string|number|null;}
   else if(v===null&&table.groups.includes(name)){for(const field of table.fields.filter(f=>f[0].startsWith(name+'.')))output[field[1]]=null;}
   else walk(v,child as Record<string,unknown>,name);
  }
 }
 walk(record,shape(table));
 if(table.name==='sessions'){
  requireStore(output.materialization_state!=='materialized'||output.header_version===3);
  requireStore(output.materialization_state!=='allocated'||(output.header_version===null&&output.last_persisted_entry_id===null));
 }
 return output;
}
export function decode<T>(table:Table,row:Record<string,unknown>):T{
 const output:Record<string,unknown>={};for(const [key,column,rule]of table.fields){let target=output;const parts=key.split('.');for(const part of parts.slice(0,-1)){target[part]??={};target=target[part] as Record<string,unknown>;}target[parts.at(-1)!]=rule==='bool'?row[column]===1:row[column];}
 for(const group of table.groups){if(table.fields.filter(f=>f[0].startsWith(group+'.')).every(f=>row[f[1]]===null))output[group]=null;}
 encode(table,output);return output as T;
}
export function verifyGraph(db:Database.Database):void{
 const bad=(sql:string)=>requireStore(!db.prepare(sql+' LIMIT 1').get());
 requireStore(!db.prepare('PRAGMA foreign_key_check').get());
 bad('SELECT 1 FROM workspaces w JOIN operations o ON o.operation_id=w.creation_operation_id JOIN prds p ON p.prd_id=o.prd_id WHERE p.workspace_id!=w.workspace_id');
 bad('SELECT 1 FROM prds p JOIN documents d ON d.prd_id=p.prd_id WHERE p.document_id IS NULL OR p.document_id!=d.document_id OR p.convention_id IS NULL OR p.convention_id!=d.convention_id OR p.planned_relative_path IS NULL OR p.planned_relative_path!=d.relative_path');
 bad('SELECT 1 FROM prds p JOIN documents d ON d.document_id=p.document_id WHERE d.prd_id!=p.prd_id');
 bad('SELECT 1 FROM prds p JOIN sessions s ON s.prd_id=p.prd_id WHERE p.session_id IS NULL OR p.session_id!=s.session_id');
 bad('SELECT 1 FROM prds p JOIN sessions s ON s.session_id=p.session_id WHERE s.prd_id!=p.prd_id');
 bad('SELECT 1 FROM prds p JOIN conventions c ON c.convention_id=p.convention_id WHERE c.workspace_id!=p.workspace_id OR c.selected!=1');
 bad("SELECT 1 FROM prds WHERE (convention_id IS NULL)!=(planned_relative_path IS NULL)");
 bad("SELECT 1 FROM prds p JOIN conventions c ON c.convention_id=p.convention_id WHERE substr(p.planned_relative_path,1,length(c.relative_folder)+1)!=c.relative_folder||'/'");
 bad("SELECT 1 FROM documents d JOIN prds p ON p.prd_id=d.prd_id JOIN conventions c ON c.convention_id=d.convention_id WHERE p.workspace_id!=c.workspace_id OR substr(d.relative_path,1,length(c.relative_folder)+1)!=c.relative_folder||'/'");
 bad("SELECT 1 FROM candidates d JOIN conventions c ON c.convention_id=d.convention_id WHERE substr(d.relative_path,1,length(c.relative_folder)+1)!=c.relative_folder||'/'");
 bad('SELECT 1 FROM operations o JOIN sessions s ON s.session_id=o.session_id WHERE o.prd_id!=s.prd_id');
 bad('SELECT 1 FROM candidates c JOIN prds p ON p.prd_id=c.prd_id JOIN conventions f ON f.convention_id=c.convention_id JOIN operations o ON o.operation_id=c.scan_operation_id WHERE p.workspace_id!=f.workspace_id OR o.prd_id!=p.prd_id');
 bad('SELECT 1 FROM save_recoveries r JOIN operations o ON o.operation_id=r.operation_id JOIN documents d ON d.document_id=r.document_id WHERE o.prd_id!=d.prd_id OR o.kind!=\'save\'');
 bad('SELECT 1 FROM conventions GROUP BY workspace_id HAVING count(*)>32');bad('SELECT 1 FROM candidates GROUP BY prd_id HAVING count(*)>32');
}
