import {mkdtemp,realpath,writeFile,readFile,cp,rename,readdir,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {_electron} from '@playwright/test';
import type {ElectronApplication} from '@playwright/test';
import {extractAll,createPackageWithOptions} from '@electron/asar';
import type {BootstrapResult} from '../../src/shared/bootstrap-contracts';
export const packageRoot=path.resolve('out/gabPrd-win32-x64');
export const executable=path.join(packageRoot,'gabPrd.exe');
export async function fixture(){const root=await realpath(await mkdtemp(path.join(tmpdir(),'gabprd-bootstrap-test-')));const marker={schemaVersion:1,fixtureId:randomUUID(),canonicalRoot:root,databaseExpected:false};await writeFile(path.join(root,'bootstrap-owner.json'),JSON.stringify(marker),{flag:'wx'});return {root,marker};}
export async function launch(root:string,exe=executable,environment:Record<string,string>={}){return _electron.launch({executablePath:exe,args:['--bootstrap-fixture-root='+root],cwd:root,chromiumSandbox:true,bypassCSP:false,timeout:30_000,env:{...process.env,PI_PACKAGE_DIR:path.join(root,'foreign-sdk'),PI_CODING_AGENT_DIR:path.join(root,'foreign-pi'),OPENAI_API_KEY:'BOOTSTRAP_SENTINEL_SECRET_DO_NOT_EMIT',...environment}});}
export async function status(app:ElectronApplication):Promise<BootstrapResult>{const page=await app.firstWindow();return page.evaluate(()=>window.gabPrd.bootstrap.getStatus());}
export async function waitReady(app:ElectronApplication){const end=Date.now()+30_000;for(;;){const result=await status(app);if(result.ok&&result.snapshot.state==='ready')return result.snapshot;if(!result.ok||(result.snapshot.state==='failed'))throw new Error('Packaged startup checks failed: '+JSON.stringify(result));if(Date.now()>end)throw new Error('Packaged startup did not settle');await new Promise(r=>setTimeout(r,100));}}
export async function digest(file:string){return createHash('sha256').update(await readFile(file)).digest('hex');}
export async function tamperedPackage(change:(root:string)=>Promise<void>,source=packageRoot){const owner=await fixture();const clone=path.join(owner.root,'package');await cp(source,clone,{recursive:true,errorOnExist:true,force:false});const archive=path.join(clone,'resources','app.asar');const extracted=path.join(owner.root,'extracted');extractAll(archive,extracted);await change(extracted);const replacement=path.join(clone,'resources','replacement.asar');await createPackageWithOptions(extracted,replacement,{unpack:'**/*.{node,wasm}'});await rename(replacement,archive);return path.join(clone,'gabPrd.exe');}
// Observers exist ONLY in an owned package copy. Real SQLite constructors and SDK
// code still run; no forged success, shipped API or renderer capability is added.
export async function observedPackage(change?:(root:string)=>Promise<void>){return tamperedPackage(async root=>{
 if(change)await change(root);
 const main=path.join(root,'.webpack/main/index.cjs');const original=await readFile(main,'utf8');
 const prelude=`const __t={sqliteOpens:0,forks:0,inits:0,replies:[],output:''};globalThis.__bootstrapTestTelemetry=__t;
 for(const stream of [process.stdout,process.stderr]){if(stream){const original=stream.write.bind(stream);const captured=(chunk,...args)=>{__t.output+=Buffer.isBuffer(chunk)?chunk.toString('utf8'):String(chunk);return original(chunk,...args);};if(!Reflect.set(stream,'write',captured)||stream.write!==captured)throw new Error('Owned stream observer unavailable');}}
 const __key=require.resolve('better-sqlite3');const __driver=require(__key);require.cache[__key].exports=new Proxy(__driver,{construct(target,args){__t.sqliteOpens++;return Reflect.construct(target,args,target);}});
 const __utility=require('electron').utilityProcess;const __fork=__utility.fork.bind(__utility);const __observe=(...args)=>{const child=__fork(...args);if(args[2]?.serviceName==='gabPrd Pi bootstrap'){__t.forks++;const send=child.postMessage.bind(child);const counted=m=>{if(m?.type==='bootstrap.init')__t.inits++;return send(m);};if(!Reflect.set(child,'postMessage',counted)||child.postMessage!==counted)throw new Error('Owned observer unavailable');child.on('message',m=>__t.replies.push(m));}return child;};if(!Reflect.set(__utility,'fork',__observe)||__utility.fork!==__observe)throw new Error('Owned observer unavailable');\n`;
 await writeFile(main,prelude+original);
});}
export interface ProbeTelemetry {sqliteOpens:number;forks:number;inits:number;replies:unknown[];output:string}
export async function telemetry(app:ElectronApplication):Promise<ProbeTelemetry>{return app.evaluate(()=>Reflect.get(globalThis,'__bootstrapTestTelemetry'));}
export async function fileTree(root:string):Promise<Record<string,string>>{const files:Record<string,string>={};async function visit(dir:string){for(const entry of(await readdir(dir)).sort()){const file=path.join(dir,entry);const stat=await lstat(file);if(stat.isSymbolicLink())throw new Error('Owned fixture contains an unexpected link');if(stat.isDirectory()){files[path.relative(root,file)+path.sep]='directory';await visit(file);}else if(stat.isFile())files[path.relative(root,file)]=await digest(file);}}await visit(root);return files;}
export async function assertLogsSafe(root:string,sentinel:string){const files=await fileTree(root);let count=0;for(const file of Object.keys(files)){if(!file.endsWith(path.sep)&&(file.startsWith('logs'+path.sep)||/\.(?:log|jsonl)$/i.test(file))){if((await readFile(path.join(root,file))).includes(Buffer.from(sentinel)))throw new Error('Sentinel found in an ordinary app log');count++;}}return count;}
export async function ownedUtilityPid(app:ElectronApplication){return app.evaluate(({app})=>{const matches=app.getAppMetrics().filter(m=>m.name==='gabPrd Pi bootstrap');if(matches.length!==1)throw new Error('Owned utility metric not unique');return matches[0]!.pid;});}
