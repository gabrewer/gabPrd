/** Exact, bounded read-before-open validation. Never calls SDK open/reset/migration. */
import path from 'node:path';
import {constants,openSync,readSync,closeSync,fstatSync} from 'node:fs';
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import type {Cursor,HistoryPage,SessionRecord,HistoryItem,HistoryEntryId,MessageId,IsoInstant} from '../shared/prd-contracts';
import {PRD_LIMITS as L} from '../shared/prd-contracts';
import type {PortResult} from '../main/prd-ports';
import {TABLES,encode,requireStore,StoreFault,storeFailure} from '../main/prd-schema';
import {canonicalStat,verifiedDirectory,identityOf,sameIdentity} from '../main/prd-paths';
import type {FileEntry} from '@earendil-works/pi-coding-agent';
export interface PrdSessionInspection {readonly record:SessionRecord;readonly entries:readonly FileEntry[];readonly snapshot:string}
const cursorKey=randomBytes(32),hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const text=(x:unknown,max=4096):x is string=>typeof x==='string'&&Buffer.byteLength(x)<=max;
const identifier=(x:unknown):x is string=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const instant=(x:unknown)=>typeof x==='string'&&x.length<=64&&/^\d{4}-\d\d-\d\dT/.test(x)&&Number.isFinite(Date.parse(x));
function content(x:unknown):boolean{return typeof x==='string'||Array.isArray(x)&&x.every(b=>object(b)&&typeof b.type==='string'&&(b.type!=='text'||typeof b.text==='string')&&(b.type!=='image'||typeof b.data==='string'&&typeof b.mimeType==='string'));}
function validateEntry(entry:Record<string,unknown>,seen:Map<string,Record<string,unknown>>):void{
 requireStore(identifier(entry.id)&&!seen.has(entry.id)&&instant(entry.timestamp)&&(entry.parentId===null||identifier(entry.parentId)&&seen.has(entry.parentId)),'SESSION_CORRUPT');
 switch(entry.type){
  case'message':{
   const m=entry.message;requireStore(object(m)&&text(m.role,128)&&typeof m.timestamp==='number'&&Number.isFinite(m.timestamp),'SESSION_CORRUPT');
   if(m.role==='user'||m.role==='custom'||m.role==='system')requireStore(content(m.content),'SESSION_CORRUPT');
   if(m.role==='assistant'){requireStore(Array.isArray(m.content)&&content(m.content)&&text(m.api)&&text(m.provider)&&text(m.model)&&['stop','length','toolUse','error','aborted','deferred'].includes(String(m.stopReason))&&object(m.usage),'SESSION_CORRUPT');for(const n of['input','output','cacheRead','cacheWrite','totalTokens'])requireStore(typeof m.usage[n]==='number'&&Number.isFinite(m.usage[n])&&Number(m.usage[n])>=0,'SESSION_CORRUPT');}
   if(m.role==='toolResult')requireStore(text(m.toolName)&&text(m.toolCallId)&&Array.isArray(m.content)&&content(m.content)&&typeof m.isError==='boolean','SESSION_CORRUPT');break;
  }
  case'model_change':requireStore(text(entry.provider)&&text(entry.modelId),'SESSION_CORRUPT');break;
  case'thinking_level_change':requireStore(['off','minimal','low','medium','high','xhigh','max'].includes(String(entry.thinkingLevel)),'SESSION_CORRUPT');break;
  case'compaction':requireStore(typeof entry.summary==='string'&&identifier(entry.firstKeptEntryId)&&(entry.firstKeptEntryId===entry.id||seen.has(entry.firstKeptEntryId))&&typeof entry.tokensBefore==='number'&&Number.isFinite(entry.tokensBefore)&&entry.tokensBefore>=0,'SESSION_CORRUPT');break;
  case'branch_summary':requireStore(typeof entry.summary==='string'&&(entry.fromId===null||identifier(entry.fromId)&&seen.has(entry.fromId)),'SESSION_CORRUPT');break;
  case'context_edit':requireStore(identifier(entry.targetId)&&seen.has(entry.targetId)&&(entry.replacement===null||content(entry.replacement)),'SESSION_CORRUPT');break;
  case'custom':requireStore(text(entry.customType),'SESSION_CORRUPT');if(entry.customType==='gabprd.writer-input.v1'){const data=entry.data;requireStore(object(data)&&Object.keys(data).sort().join(',')==='entryId,text'&&identifier(data.entryId)&&seen.get(data.entryId)?.type==='message'&&(seen.get(data.entryId)!.message as Record<string,unknown>).role==='user'&&text(data.text,L.inputBytes)&&!data.text.includes('\0'),'SESSION_CORRUPT');}break;
  case'custom_message':requireStore(text(entry.customType)&&content(entry.content)&&typeof entry.display==='boolean','SESSION_CORRUPT');break;
  case'label':requireStore(identifier(entry.targetId)&&seen.has(entry.targetId)&&(entry.label===undefined||typeof entry.label==='string'),'SESSION_CORRUPT');break;
  case'session_info':requireStore(typeof entry.name==='string','SESSION_CORRUPT');break;
  case'usage':requireStore(text(entry.kind)&&text(entry.provider)&&text(entry.model)&&object(entry.usage),'SESSION_CORRUPT');break;
  default:throw new StoreFault('SESSION_CORRUPT');
 }
 seen.set(entry.id as string,entry);
}
export function inspectPrdSession(record:SessionRecord):PortResult<PrdSessionInspection>{
 try{
  encode(TABLES.sessions,record);verifiedDirectory(record.expectedCwd);verifiedDirectory(record.appSessionDir);requireStore(path.basename(record.appSessionDir)===record.prdId&&path.dirname(record.exactPath)===record.appSessionDir&&path.extname(record.exactPath)==='.jsonl','LINK_CHANGED');
  let before:ReturnType<typeof canonicalStat>;try{before=canonicalStat(record.exactPath);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'){if(record.state==='allocated'&&record.headerVersion===null&&record.lastPersistedEntryId===null)return {ok:true,value:{record,entries:[],snapshot:'allocated'}};throw new StoreFault('SESSION_MISSING');}throw new StoreFault('LINK_CHANGED');}
  requireStore(before.isFile()&&before.size>0n,'SESSION_CORRUPT');requireStore(before.size<=BigInt(L.sessionBytes),'LIMIT_EXCEEDED');const fd=openSync(record.exactPath,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes:Buffer;
  try{requireStore(sameIdentity(identityOf(before),identityOf(fstatSync(fd,{bigint:true}))),'LINK_CHANGED');bytes=Buffer.alloc(Number(before.size));let offset=0;while(offset<bytes.length){const count=readSync(fd,bytes,offset,Math.min(bytes.length-offset,64*1024),offset);requireStore(count>0,'STALE_VERSION');offset+=count;}const after=canonicalStat(record.exactPath);requireStore(sameIdentity(identityOf(before),identityOf(after))&&before.size===after.size&&before.mtimeNs===after.mtimeNs,'STALE_VERSION');}finally{closeSync(fd);}
  const source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);requireStore(source.endsWith('\n'),'SESSION_CORRUPT');const lines=source.split('\n');if(lines.at(-1)==='')lines.pop();const entries:Record<string,unknown>[]=[],seen=new Map<string,Record<string,unknown>>();
  for(const line of lines){requireStore(line.length>0,'SESSION_CORRUPT');requireStore(Buffer.byteLength(line)<=L.sessionLineBytes,'LIMIT_EXCEEDED');const entry:unknown=JSON.parse(line);requireStore(object(entry),'SESSION_CORRUPT');if(entries.length===0){requireStore(entry.type==='session'&&entry.version===3&&instant(entry.timestamp),'SESSION_CORRUPT');requireStore(entry.id===record.sessionId&&entry.cwd===record.expectedCwd&&entry.parentSession===undefined,'LINK_CHANGED');}else validateEntry(entry,seen);entries.push(entry);}
  requireStore(entries.length>0&&(!record.lastPersistedEntryId||seen.has(record.lastPersistedEntryId)),'SESSION_CORRUPT');const last=[...seen.keys()].at(-1)??null;
  return {ok:true,value:{record:{...record,state:'materialized',headerVersion:3,lastPersistedEntryId:last as HistoryEntryId|null},entries:entries as unknown as FileEntry[],snapshot:hash(bytes)}};
 }catch(error){return storeFailure(error instanceof StoreFault?error.code:'SESSION_CORRUPT');}
}
/** Same identity mapping for live SDK messages and their persisted entries; collision ordinal is explicit. */
export function prdMessageKey(message:{role:string;timestamp:number;provider?:string;model?:string}):string{return JSON.stringify([message.role,message.timestamp,message.provider??'',message.model??'']);}
export function prdMessageId(sessionId:string,key:string,ordinal:number):MessageId{return ('m:'+hash(JSON.stringify([sessionId,key,ordinal]))) as MessageId;}
export function boundedText(source:string,max:number):{text:string;textStatus:'complete'|'truncated'}{
 if(Buffer.byteLength(source)<=max)return {text:source,textStatus:'complete'};let result='',bytes=0;for(const character of source){const size=Buffer.byteLength(character);if(bytes+size>max)break;result+=character;bytes+=size;}return {text:result,textStatus:'truncated'};
}
function messageText(contentValue:unknown):string{if(typeof contentValue==='string')return contentValue;if(!Array.isArray(contentValue))return '';return contentValue.filter(b=>object(b)&&b.type==='text'&&typeof b.text==='string').map(b=>b.text as string).join('');}
function items(session:PrdSessionInspection):HistoryItem[]{
 const submitted=new Map<string,string>();for(const entry of session.entries)if(entry.type==='custom'&&entry.customType==='gabprd.writer-input.v1'){const data=entry.data as {entryId:string;text:string};submitted.set(data.entryId,data.text);}
 const result:HistoryItem[]=[],counts=new Map<string,number>(),active=new Set<string>(),byId=new Map(session.entries.filter(entry=>entry.type!=='session').map(entry=>[entry.id,entry]));
 let leaf=session.entries.at(-1);while(leaf&&leaf.type!=='session'){active.add(leaf.id);leaf=leaf.parentId?byId.get(leaf.parentId):undefined;}
 for(const raw of session.entries){
  if(raw.type==='message'){
   const message=raw.message;if(message.role!=='user'&&message.role!=='assistant'&&message.role!=='custom')continue;const key=prdMessageKey(message),ordinal=counts.get(key)??0;counts.set(key,ordinal+1);if(!active.has(raw.id))continue;
   if(message.role==='assistant'&&(message.stopReason==='error'||message.stopReason==='aborted'||message.stopReason==='pending'))continue;
   const body=message.role==='user'?submitted.get(raw.id)??messageText(message.content):messageText(message.content);if(!body)continue;result.push({entryId:raw.id as HistoryEntryId,messageId:prdMessageId(session.record.sessionId,key,ordinal),role:message.role==='user'?'writer':message.role==='assistant'?'assistant':'extension',...boundedText(body,L.historyTextBytes),persistedAt:raw.timestamp as IsoInstant});
  }else if(raw.type==='custom_message'&&raw.display&&active.has(raw.id)){const body=messageText(raw.content);if(body)result.push({entryId:raw.id as HistoryEntryId,messageId:prdMessageId(session.record.sessionId,raw.id,0),role:'extension',...boundedText(body,L.historyTextBytes),persistedAt:raw.timestamp as IsoInstant});}
 }
 return result;
}
export function readPrdHistory(record:SessionRecord,cursor:Cursor|null):PortResult<HistoryPage>{
 try{
  const checked=inspectPrdSession(record);if(!checked.ok)return checked;const session=checked.value,all=items(session);let start=0;
  if(cursor!==null){requireStore(typeof cursor==='string'&&Buffer.byteLength(cursor)<=L.cursorBytes,'INVALID_REQUEST');const [payload,signature,...extra]=cursor.split('.');requireStore(payload&&signature&&extra.length===0,'INVALID_REQUEST');const expected=createHmac('sha256',cursorKey).update(payload).digest('base64url');requireStore(signature.length===expected.length&&timingSafeEqual(Buffer.from(signature),Buffer.from(expected)),'INVALID_REQUEST');const data:unknown=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));requireStore(Array.isArray(data)&&data.length===3&&data[0]===record.sessionId&&Number.isSafeInteger(data[2])&&Number(data[2])>=0,'INVALID_REQUEST');requireStore(data[1]===session.snapshot,'STALE_VERSION');start=Number(data[2]);requireStore(start<=all.length,'INVALID_REQUEST');}
  const page:HistoryItem[]=[];let offset=start;for(;offset<all.length&&page.length<L.historyItems;offset++){const next=all[offset]!;if(Buffer.byteLength(JSON.stringify([...page,next]))>L.pageBytes-1024)break;page.push(next);}
  let nextCursor:Cursor|null=null;if(offset<all.length){const payload=Buffer.from(JSON.stringify([record.sessionId,session.snapshot,offset])).toString('base64url'),signature=createHmac('sha256',cursorKey).update(payload).digest('base64url');nextCursor=(payload+'.'+signature) as Cursor;requireStore(Buffer.byteLength(nextCursor)<=L.cursorBytes,'LIMIT_EXCEEDED');}
  return {ok:true,value:{sessionId:record.sessionId,lastPersistedEntryId:session.record.lastPersistedEntryId,items:page,nextCursor,coverage:nextCursor?'more':'complete'}};
 }catch(error){return storeFailure(error instanceof StoreFault?error.code:'SESSION_CORRUPT');}
}
