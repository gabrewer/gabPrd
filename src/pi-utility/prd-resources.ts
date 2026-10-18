/** Normal pinned public SDK discovery/composition; no overlays, tool lists or replacement skill. */
import {constants,openSync,readSync,closeSync,realpathSync,fstatSync,lstatSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {PiLaunchConfig,SkillBinding} from '../shared/prd-contracts';
import {PRD_LIMITS} from '../shared/prd-contracts';
import type {PortResult} from '../main/prd-ports';
import {storeFailure,requireStore,StoreFault,TABLES,encode} from '../main/prd-schema';
import {canonicalStat,verifiedDirectory,identityOf,sameIdentity} from '../main/prd-paths';
/** Electron ASAR paths are canonical virtual files; do not treat the archive ancestor as a directory. */
export function verifyPackagedFile(file:string,root:string):void{
 const relative=path.relative(root,file);requireStore(path.isAbsolute(root)&&path.resolve(file)===file&&!path.isAbsolute(relative)&&relative!== '..'&&!relative.startsWith('..'+path.sep),'CONFIG_INCOMPATIBLE');let current=root;requireStore(realpathSync(current)===current&&!lstatSync(current).isSymbolicLink(),'CONFIG_INCOMPATIBLE');for(const component of relative.split(path.sep)){current=path.join(current,component);requireStore(realpathSync(current)===current&&!lstatSync(current).isSymbolicLink(),'CONFIG_INCOMPATIBLE');}const stat=lstatSync(file);requireStore(stat.isFile()&&stat.size>0,'CONFIG_INCOMPATIBLE');
}
export type PrdSdk=typeof import('@earendil-works/pi-coding-agent');
export interface PrdResources {readonly loader:InstanceType<PrdSdk['DefaultResourceLoader']>;readonly settings:import('@earendil-works/pi-coding-agent').SettingsManager;readonly binding:SkillBinding}
function skillBytes(file:string):{text:string;identity:SkillBinding['identity'];digest:SkillBinding['contentSha256']}{
 const before=canonicalStat(file);requireStore(before.isFile()&&before.size>0n&&before.size<=BigInt(PRD_LIMITS.skillBytes),'SKILL_UNAVAILABLE');const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{requireStore(sameIdentity(identityOf(before),identityOf(fstatSync(fd,{bigint:true}))),'SKILL_UNAVAILABLE');const bytes=Buffer.alloc(Number(before.size));let position=0;while(position<bytes.length){const count=readSync(fd,bytes,position,bytes.length-position,position);requireStore(count>0,'SKILL_UNAVAILABLE');position+=count;}const after=canonicalStat(file);requireStore(sameIdentity(identityOf(before),identityOf(after))&&before.size===after.size&&before.mtimeNs===after.mtimeNs,'SKILL_UNAVAILABLE');const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);requireStore(!text.includes('\0'),'SKILL_UNAVAILABLE');return {text,identity:identityOf(before),digest:createHash('sha256').update(bytes).digest('hex') as SkillBinding['contentSha256']};}finally{closeSync(fd);}
}
export async function loadPrdResources(sdk:PrdSdk,config:PiLaunchConfig):Promise<PortResult<PrdResources>>{
 try{
  requireStore(sdk.VERSION==='1.1.0'&&realpathSync(sdk.getPackageDir())===config.packagedSdkRoot,'CONFIG_INCOMPATIBLE');verifiedDirectory(config.worktreeCwd);verifiedDirectory(config.existingAgentDir);
  const settings=sdk.SettingsManager.create(config.worktreeCwd,config.existingAgentDir);requireStore(settings.drainErrors().length===0,'CONFIG_INCOMPATIBLE');
  // Names/builtin/replaceable preserve -builtin settings and configured replacement semantics.
  const loader=new sdk.DefaultResourceLoader({cwd:config.worktreeCwd,agentDir:config.existingAgentDir,settingsManager:settings,extensionFactories:[{name:'codemode',factory:sdk.createCodemodeExtension(),builtin:true,replaceable:true},{name:'tool-search',factory:sdk.createToolSearchExtension(),builtin:true,replaceable:true},{name:'mcp',factory:sdk.createMcpExtension(),builtin:true,replaceable:true}]});
  await loader.reload();requireStore(settings.drainErrors().length===0&&loader.getExtensions().errors.length===0,'CONFIG_INCOMPATIBLE');const skill=loader.getSkills().skills.find(s=>s.name==='brainstorm');requireStore(skill,'SKILL_UNAVAILABLE');
  const sourcePath=realpathSync(skill.filePath) as SkillBinding['sourcePath'],baseDir=realpathSync(skill.baseDir) as SkillBinding['baseDir'];verifiedDirectory(baseDir);const read=skillBytes(sourcePath),info=skill.sourceInfo;
  const source:SkillBinding['source']=info.origin==='package'?'package':info.scope==='temporary'?'extension':info.scope==='project'?info.source==='auto'?'worktreeDiscovered':'worktreeConfigured':info.source==='auto'?'userDiscovered':'userConfigured';const binding:SkillBinding={name:'brainstorm',sourcePath,baseDir,identity:read.identity,contentSha256:read.digest,source};encode(TABLES.skill_bindings,binding);return {ok:true,value:{loader,settings,binding}};
 }catch(error){return storeFailure(error instanceof StoreFault?error.code:'CONFIG_INCOMPATIBLE');}
}
export function readBoundSkill(binding:SkillBinding):PortResult<string>{
 try{encode(TABLES.skill_bindings,binding);const read=skillBytes(binding.sourcePath);requireStore(sameIdentity(binding.identity,read.identity)&&binding.contentSha256===read.digest,'SKILL_UNAVAILABLE');return {ok:true,value:read.text};}catch{return storeFailure('SKILL_UNAVAILABLE');}
}
