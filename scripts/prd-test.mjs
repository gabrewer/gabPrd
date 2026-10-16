/** Test-only runner. No application/renderer entry imports this file. */
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {readdirSync,lstatSync,realpathSync,mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
const require=createRequire(import.meta.url);
export const projectRoot=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export function isolatedEnvironment(root){
 const env={};
 for(const name of ['SystemRoot','SYSTEMROOT','WINDIR','PATH','Path','PATHEXT','COMSPEC','ComSpec'])if(process.env[name])env[name]=process.env[name];
 return {...env,TEMP:root,TMP:root,HOME:root,USERPROFILE:root,APPDATA:path.join(root,'appdata'),LOCALAPPDATA:path.join(root,'localdata'),PI_CODING_AGENT_DIR:root.replaceAll('\\','/')+'/pi'};
}
/** @param {{root?:string,kind?:string,selection?:string[]}} options */
export function discoverTests({root=projectRoot,kind='unit',selection=[]}={}){
 if(!['unit','native'].includes(kind)||!Array.isArray(selection)||selection.some(s=>typeof s!=='string')||new Set(selection).size!==selection.length)throw new Error('Invalid test selection.');
 const folder=path.join(root,'tests/prd');
 const matches=name=>/\.test\.ts$/.test(name)&&(kind==='native'?name.endsWith('.integration.test.ts')||name==='native-runner.test.ts':!name.endsWith('.integration.test.ts')&&name!=='native-runner.test.ts');
 const candidates=readdirSync(folder).filter(matches).sort();
 const names=selection.length?selection.map(name=>{
  if(!/^tests\/prd\/[a-z0-9][a-z0-9.-]*\.test\.ts$/i.test(name)||!matches(path.basename(name)))throw new Error('Invalid test selection.');return path.basename(name);
 }):candidates;
 if(names.length===0)throw new Error('No tests selected.');
 return names.map(name=>{const file=path.join(folder,name);if(!candidates.includes(name)||!lstatSync(file).isFile()||lstatSync(file).isSymbolicLink()||realpathSync(file)!==path.resolve(file)||realpathSync(folder)!==path.resolve(folder))throw new Error('Test selection could not be verified.');return file;});
}
export function ownedFixture(root=projectRoot,label='run'){
 const parent=path.join(root,'.pi/tmp/prd-tests');mkdirSync(parent,{recursive:true});
 const owner=mkdtempSync(path.join(parent,label+'-'));mkdirSync(path.join(owner,'pi'));return owner;
}
/** Only a freshly spawned owned child tree may be terminated; never global process matching. */
export async function captureProcess(executable,args,{cwd=projectRoot,env=process.env,timeoutMs=120000}={}){
 return new Promise(resolve=>{
  let output='',timedOut=false,settled=false;
  const child=spawn(executable,args,{cwd,env,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
  const append=chunk=>{output=(output+chunk.toString('utf8')).slice(-1024*1024);};
  child.stdout?.on('data',append);child.stderr?.on('data',append);
  const timer=setTimeout(()=>{timedOut=true;if(child.exitCode===null&&child.pid){
   if(process.platform==='win32')spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:10000});else child.kill('SIGKILL');
  }},timeoutMs);
  const finish=code=>{if(settled)return;settled=true;clearTimeout(timer);resolve({exitCode:timedOut?1:(code??1),output,timedOut});};
  child.once('error',()=>finish(1));child.once('close',finish);
 });
}
/** @param {{root?:string,kind?:string,selection?:string[],timeoutMs?:number}} options */
export async function runTests({root=projectRoot,kind='unit',selection=[],timeoutMs=120000}={}){
 try{
  if(!['unit','runtime'].includes(kind))throw new Error('Use the separate pinned Electron native runner.');
  // Bootstrap fixture policy rejects checkout descendants, even under TEMP.
  const owner=kind==='runtime'?realpathSync(mkdtempSync(path.join(tmpdir(),'gabprd-product-test-env-'))):ownedFixture(root);
  if(kind==='runtime'){
   // Expose only bounded selection/list options, never an alternate configuration or shell.
   for(let n=0;n<selection.length;n++){
    const arg=selection[n];if(arg==='--list')continue;
    if(arg==='--grep'&&typeof selection[n+1]==='string'&&selection[n+1].length<=256){n++;continue;}
    if(/^tests\/prd\/[a-z0-9.-]+\.spec\.ts$/i.test(arg))continue;
    throw new Error('Invalid runtime selection.');
   }
   return await captureProcess(process.execPath,[require.resolve('@playwright/test/cli'),'test','--config',path.join(projectRoot,'playwright.prd.config.ts'),...selection],{cwd:root,env:isolatedEnvironment(owner),timeoutMs});
  }
  const files=discoverTests({root,kind,selection});
  return await captureProcess(process.execPath,['--import',pathToFileURL(require.resolve('tsx')).href,'--test','--test-concurrency=1',...files],{cwd:root,env:isolatedEnvironment(owner),timeoutMs});
 }catch{return {exitCode:1,output:'Product test selection or launch failed safely.',timedOut:false};}
}
async function selfTest(){
 const root=ownedFixture(projectRoot,'self');mkdirSync(path.join(root,'tests/prd'),{recursive:true});
 const sources={pass:"import test from 'node:test';test('self pass',()=>{});",fail:"import test from 'node:test';import assert from 'node:assert/strict';test('self assertion',()=>assert.equal(1,2));",crash:'process.exit(13);',hang:"import test from 'node:test';test('hang',async()=>{setInterval(()=>{},1000);await new Promise(()=>{});});"};
 for(const [name,source]of Object.entries(sources))writeFileSync(path.join(root,'tests/prd',name+'.test.ts'),source,{flag:'wx'});
 const results=[];for(const name of Object.keys(sources))results.push(await runTests({root,selection:['tests/prd/'+name+'.test.ts'],timeoutMs:name==='hang'?1000:10000}));
 let rejected=false;try{discoverTests({root,selection:['tests/prd/missing.test.ts']});}catch{rejected=true;}
 if(results[0].exitCode!==0||results.slice(1).some(r=>r.exitCode===0)||!results[1].output.includes('ERR_ASSERTION')||!results[3].timedOut||!rejected)throw new Error('Runner self-test failed.');
 console.log('Unit runner self-test: selection, pass, assertion failure, crash and timeout propagation verified.');
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 try{if(process.argv[2]==='--self-test')await selfTest();else{const kind=process.argv[2]??'unit';const result=await runTests({kind,selection:process.argv.slice(3),timeoutMs:kind==='runtime'?600000:120000});process.stdout.write(result.output);process.exitCode=result.exitCode;}}
 catch{console.error('Product runner self-test failed safely.');process.exitCode=1;}
}
