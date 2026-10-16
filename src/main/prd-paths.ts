/** Canonical component/identity checks. Not an OS sandbox or a filesystem CAS. */
import path from 'node:path';
import {lstatSync,realpathSync} from 'node:fs';
import type {BigIntStats} from 'node:fs';
import type {PrdPathsPort,PortResult,VerifiedPath} from './prd-ports';
import type {CanonicalPath,FilesystemIdentity,RepositoryRecord,WorkspaceRecord} from '../shared/prd-contracts';
import {storeFailure} from './prd-schema';
export function identityOf(stat:BigIntStats):FilesystemIdentity{return Object.freeze({device:String(stat.dev),fileId:String(stat.ino),birthtimeNs:String(stat.birthtimeNs)});}
export function sameIdentity(a:FilesystemIdentity,b:FilesystemIdentity):boolean{return a.device===b.device&&a.fileId===b.fileId&&a.birthtimeNs===b.birthtimeNs;}
export function contained(base:string,candidate:string):boolean{const relative=path.relative(base,candidate);return relative!==''&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);}
export function validRelative(relative:unknown):relative is string{
 return typeof relative==='string'&&Buffer.byteLength(relative)<=1024&&relative.split('/').every(component=>component.length>0&&component!=='.'&&component!=='..'&&component.length<=255&&!/[<>:"/\\|?*\u0000-\u001f]/.test(component)&&!/[. ]$/.test(component)&&!/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(component));
}
export function canonicalStat(file:string):BigIntStats{
 if(typeof file!=='string'||Buffer.byteLength(file)>4096||!path.isAbsolute(file)||path.resolve(file)!==file||realpathSync(file)!==file)throw new Error('Unverified path.');
 const parsed=path.parse(file);let current=parsed.root;const parts=file.slice(parsed.root.length).split(path.sep).filter(Boolean);
 let stat=lstatSync(current,{bigint:true});if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Unverified root.');
 for(let i=0;i<parts.length;i++){current=path.join(current,parts[i]!);stat=lstatSync(current,{bigint:true});if(stat.isSymbolicLink()||realpathSync(current)!==current||(!stat.isDirectory()&&!stat.isFile())||(i<parts.length-1&&!stat.isDirectory())||(stat.isFile()&&stat.nlink!==1n))throw new Error('Unverified component.');}
 return stat;
}
export function verifiedDirectory(file:string):FilesystemIdentity{const stat=canonicalStat(file);if(!stat.isDirectory())throw new Error('Directory required.');return identityOf(stat);}
export class PrdPaths implements PrdPathsPort {
 private readonly roots=new WeakMap<VerifiedPath,FilesystemIdentity>();
 async verifyRoot(root:CanonicalPath):Promise<PortResult<VerifiedPath>>{
  try{const identity=verifiedDirectory(root),verified=Object.freeze({path:root,identity});this.roots.set(verified,identity);return {ok:true,value:verified};}catch{return storeFailure('PATH_INVALID');}
 }
 async verifyChild(root:VerifiedPath,relative:string,expected:FilesystemIdentity|null):Promise<PortResult<VerifiedPath>>{
  try{
   const admitted=this.roots.get(root);if(!admitted||!sameIdentity(admitted,root.identity)||!sameIdentity(admitted,verifiedDirectory(root.path))||!validRelative(relative))throw new Error();
   const file=path.join(root.path,...relative.split('/'));if(!contained(root.path,file))throw new Error();const identity=identityOf(canonicalStat(file));if(expected&&!sameIdentity(expected,identity))throw new Error();
   if(!sameIdentity(admitted,verifiedDirectory(root.path)))throw new Error();return {ok:true,value:Object.freeze({path:file as CanonicalPath,identity})};
  }catch{return storeFailure('PATH_INVALID');}
 }
 async verifyLinks(repository:RepositoryRecord,workspace:WorkspaceRecord):Promise<PortResult<VerifiedPath>>{
  try{
   if(repository.repositoryId!==workspace.repositoryId||!workspace.worktreeIdentity||!workspace.gitDir||!workspace.gitDirIdentity||contained(repository.checkoutRoot,workspace.worktreePath)||repository.checkoutRoot===workspace.worktreePath||!contained(repository.commonGitDir,workspace.gitDir))throw new Error();
   for(const [file,identity]of [[repository.checkoutRoot,repository.checkoutIdentity],[repository.commonGitDir,repository.commonGitIdentity],[workspace.worktreePath,workspace.worktreeIdentity],[workspace.gitDir,workspace.gitDirIdentity]] as const)if(!sameIdentity(identity,verifiedDirectory(file)))throw new Error();
   const result=await this.verifyRoot(workspace.worktreePath);return result.ok?result:storeFailure('LINK_CHANGED');
  }catch{return storeFailure('LINK_CHANGED');}
 }
}
