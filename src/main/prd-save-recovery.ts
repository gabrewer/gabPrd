/** Retained save evidence. Recovery never silently reapplies, restores, or deletes a file. */
import path from 'node:path';
import {constants,openSync,closeSync,writeFileSync,readSync,fsyncSync,mkdirSync,fstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type * as C from '../shared/prd-contracts';
import {PRD_LIMITS} from '../shared/prd-contracts';
import type {PrdStorePort,ProductRoots,DocumentSaveInput} from './prd-ports';
import {canonicalStat,verifiedDirectory,identityOf,sameIdentity} from './prd-paths';
import {requireStore,StoreFault} from './prd-schema';
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
function take<T>(result:import('./prd-ports').PortResult<T>):T{if(!result.ok)throw new StoreFault(result.error.code);return result.value;}
export function readRecoveryBytes(file:C.CanonicalPath):Buffer {
 const before=canonicalStat(file);requireStore(before.isFile()&&before.size<=BigInt(PRD_LIMITS.documentBytes),'PATH_INVALID');
 const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  requireStore(sameIdentity(identityOf(before),identityOf(fstatSync(fd,{bigint:true}))),'LINK_CHANGED');
  const bytes=Buffer.alloc(Number(before.size));let position=0;
  while(position<bytes.length){const n=readSync(fd,bytes,position,bytes.length-position,position);requireStore(n>0,'REVISION_CONFLICT');position+=n;}
  const after=canonicalStat(file);requireStore(sameIdentity(identityOf(before),identityOf(after))&&before.size===after.size&&before.mtimeNs===after.mtimeNs,'REVISION_CONFLICT');return bytes;
 }finally{closeSync(fd);}
}
function exclusive(file:string,bytes:Buffer){
 const parent=path.dirname(file),identity=verifiedDirectory(parent),fd=openSync(file,'wx',0o600);
 try{writeFileSync(fd,bytes);fsyncSync(fd);requireStore(sameIdentity(identity,verifiedDirectory(parent))&&sameIdentity(identityOf(fstatSync(fd,{bigint:true})),identityOf(canonicalStat(file))),'LINK_CHANGED');}finally{closeSync(fd);}
}
export class PrdSaveRecovery {
 constructor(private readonly store:PrdStorePort,private readonly roots:ProductRoots){}
 private paths(record:C.SaveRecoveryRecord){
  verifiedDirectory(this.roots.marker.canonicalRoot);verifiedDirectory(this.roots.recovery);
  const directory=path.join(this.roots.recovery,record.operationId);
  requireStore(record.preimagePath===path.join(directory,'preimage.md')&&record.intendedPath===path.join(directory,'intended.md'),'LINK_CHANGED');return directory;
 }
 prepare(input:DocumentSaveInput,preimage:Buffer):C.SaveRecoveryRecord {
  requireStore(Buffer.byteLength(input.text)<=PRD_LIMITS.documentBytes&&!input.text.includes('\0'),'LIMIT_EXCEEDED');
  const directory=path.join(this.roots.recovery,input.operation.operationId) as C.CanonicalPath;
  const record:C.SaveRecoveryRecord={operationId:input.operation.operationId,documentId:input.document.documentId,baseRevision:input.document.revision.token,intendedSha256:hash(Buffer.from(input.text,'utf8')) as C.SaveRecoveryRecord['intendedSha256'],preimagePath:path.join(directory,'preimage.md') as C.CanonicalPath,intendedPath:path.join(directory,'intended.md') as C.CanonicalPath,phase:'reserved'};
  this.paths(record);
  take(this.store.transaction(tx=>{
   const current=tx.prd(input.prd.prdId),operation=tx.operation(record.operationId),document=tx.document(record.documentId);
   requireStore(current?.version===input.prd.version&&current.documentId===record.documentId&&document?.prdId===current.prdId&&document.revision.token===record.baseRevision,'STALE_VERSION');
   requireStore(document.revision.sha256===hash(preimage)&&document.revision.byteLength===preimage.length&&sameIdentity(document.revision.identity,input.document.revision.identity)&&document.revision.mtimeNs===input.document.revision.mtimeNs,'REVISION_CONFLICT');
   requireStore(operation&&operation.prdId===current.prdId&&operation.kind==='save'&&operation.phase!=='finished'&&operation.expectedDocumentRevision===record.baseRevision&&!tx.recovery(record.operationId),'LINK_CHANGED');
   tx.putOperation({...operation,step:'saveDocument',stepState:'intent',recoveryDirectory:directory});tx.putRecovery(record);return {ok:true,value:undefined};
  }));
  // The durable reservation precedes every external effect; never reuse an existing directory.
  mkdirSync(directory,{mode:0o700});verifiedDirectory(directory);this.paths(record);
  exclusive(record.preimagePath,preimage);this.paths(record);exclusive(record.intendedPath,Buffer.from(input.text,'utf8'));
  return this.phase(record,'prepared');
 }
 phase(record:C.SaveRecoveryRecord,phase:C.SaveRecoveryRecord['phase']):C.SaveRecoveryRecord {
  this.paths(record);const updated={...record,phase};
  take(this.store.transaction(tx=>{
   const old=tx.recovery(record.operationId),operation=tx.operation(record.operationId);
   requireStore(old&&old.documentId===record.documentId&&old.baseRevision===record.baseRevision&&old.intendedSha256===record.intendedSha256&&old.preimagePath===record.preimagePath&&old.intendedPath===record.intendedPath&&operation?.recoveryDirectory===path.dirname(record.preimagePath),'LINK_CHANGED');
   tx.putRecovery(updated);return {ok:true,value:undefined};
  }));return updated;
 }
 recover(record:C.SaveRecoveryRecord):C.SaveRecoveryRecord {
  this.paths(record);const stored=take(this.store.transaction(tx=>{const old=tx.recovery(record.operationId);requireStore(old&&Object.keys(old).length===Object.keys(record).length&&Object.entries(old).every(([key,value])=>value===record[key as keyof C.SaveRecoveryRecord]),'LINK_CHANGED');return {ok:true,value:old};}));
  try{readRecoveryBytes(stored.preimagePath);requireStore(hash(readRecoveryBytes(stored.intendedPath))===stored.intendedSha256,'REVISION_CONFLICT');return stored.phase==='verified'?stored:this.phase(stored,'uncertain');}
  catch{return this.phase(stored,'uncertain');}
 }
}
