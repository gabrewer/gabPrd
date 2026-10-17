/** Main-only naming/convention discovery. Never writes instructions or chooses an ambiguous folder. */
import path from 'node:path';
import {createHash} from 'node:crypto';
import {constants,openSync,closeSync,readSync,fstatSync,lstatSync} from 'node:fs';
import {opendir} from 'node:fs/promises';
import type * as C from '../shared/prd-contracts';
import type {PortResult} from './prd-ports';
import {TABLES,encode,requireStore,storeFailure} from './prd-schema';
import {canonicalStat,verifiedDirectory,identityOf,sameIdentity,validRelative,contained} from './prd-paths';
export function stablePrdId<T extends string>(...parts:string[]):T{
 const bytes=createHash('sha256').update(JSON.stringify(parts)).digest().subarray(0,16);bytes[6]=(bytes[6]!&15)|128;bytes[8]=(bytes[8]!&63)|128;const hex=bytes.toString('hex');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-') as T;
}
export function pathExists(file:string):boolean{try{lstatSync(file);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}}
/** Missing future folders are allowed, but every existing component must already be canonical. */
export function verifyFutureDirectory(root:string,relative:string):void{
 requireStore(validRelative(relative),'PATH_INVALID');verifiedDirectory(root);let current=root;
 for(const component of relative.split('/')){current=path.join(current,component);requireStore(contained(root,current),'PATH_INVALID');if(!pathExists(current))return;verifiedDirectory(current);}
}
export function resolvePrdLocation(title:string,date:C.CreationDate,convention:C.ConventionRecord):PortResult<C.RelativeMarkdownPath>{
 try{
  encode(TABLES.conventions,convention);requireStore(typeof title==='string'&&!title.includes('\0')&&Buffer.byteLength(title)<=160,'PATH_INVALID');
  requireStore(typeof date==='string'&&/^\d{4}-\d\d-\d\d$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date,'PATH_INVALID');
  const slug=title.normalize('NFC').trim().toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-+|-+$/g,'');
  requireStore(slug.length>0&&!/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])$/i.test(slug),'PATH_INVALID');
  const filename=date+'-'+slug+'.md',relative=convention.relativeFolder+'/'+filename;requireStore(filename.length<=255&&Buffer.byteLength(filename)<=200&&validRelative(relative),'PATH_INVALID');return {ok:true,value:relative as C.RelativeMarkdownPath};
 }catch{return storeFailure('PATH_INVALID');}
}
function instructionText(file:string):string{
 const before=canonicalStat(file);requireStore(before.isFile()&&before.size<=256n*1024n,'LIMIT_EXCEEDED');const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{requireStore(sameIdentity(identityOf(before),identityOf(fstatSync(fd,{bigint:true}))),'PATH_INVALID');const buffer=Buffer.alloc(256*1024+1),length=readSync(fd,buffer,0,buffer.length,0);requireStore(length<=256*1024&&BigInt(length)===before.size,'LIMIT_EXCEEDED');requireStore(sameIdentity(identityOf(before),identityOf(canonicalStat(file))),'PATH_INVALID');return new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,length));}finally{closeSync(fd);}
}
export async function discoverPrdConventions(workspace:C.WorkspaceRecord):Promise<PortResult<readonly C.ConventionRecord[]>>{
 try{
  const root=workspace.worktreePath,known=verifiedDirectory(root);requireStore(workspace.worktreeIdentity&&sameIdentity(known,workspace.worktreeIdentity),'LINK_CHANGED');const folders=new Set<string>();let source:C.ConventionRecord['source']='instructions';
  for(const name of ['AGENTS.md','CLAUDE.md','README.md']){
   const file=path.join(root,name);if(!pathExists(file))continue;
   for(const line of instructionText(file).split(/\r?\n/)){
    if(!/\b(?:prds?|design\s+documents?|product\s+requirements?)\b/i.test(line))continue;
    for(const match of line.matchAll(/`([^`]+)`/g)){
     const raw=match[1]!;if(!raw.includes('/')&&!/^(?:requirements|prds?|design|specifications)\/?$/i.test(raw)&&!/(?:\bin|\bunder|\bfolder|\bdirectory|:)\s*$/i.test(line.slice(0,match.index)))continue;
     const relative=raw.replace(/\/$/,'');verifyFutureDirectory(root,relative);folders.add(relative);
    }
   }
  }
  if(folders.size===0){
   source='existing';let visited=0;
   const scan=async(relative:string):Promise<void>=>{
    const directory=path.join(root,...relative.split('/').filter(Boolean));verifiedDirectory(directory);const entries=await opendir(directory);
    for await(const entry of entries){
     if(['.git','.pi','node_modules','vendor','out','.webpack'].includes(entry.name))continue;
     requireStore(++visited<=4096,'LIMIT_EXCEEDED');const child=relative?relative+'/'+entry.name:entry.name;requireStore(validRelative(child),'PATH_INVALID');const stat=canonicalStat(path.join(root,...child.split('/')));
     if(stat.isDirectory()){if(/^(?:design|prds?|requirements)$/i.test(entry.name))folders.add(child);await scan(child);}
    }
   };
   await scan('');
  }
  if(folders.size===0){source='fallback';verifyFutureDirectory(root,'docs/design');folders.add('docs/design');}
  requireStore(folders.size<=32,'LIMIT_EXCEEDED');requireStore(sameIdentity(known,verifiedDirectory(root)),'LINK_CHANGED');const values=[...folders].sort();return {ok:true,value:values.map(relativeFolder=>({conventionId:stablePrdId<C.ConventionId>('convention',workspace.workspaceId,relativeFolder),workspaceId:workspace.workspaceId,relativeFolder,source,selected:values.length===1}))};
 }catch(error){return storeFailure(error&&typeof error==='object'&&'code'in error&&error.code==='LIMIT_EXCEEDED'?'LIMIT_EXCEEDED':'PATH_INVALID');}
}
