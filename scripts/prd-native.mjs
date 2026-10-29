/** Real pinned Electron/Node ABI tests; no host SQLite import or shipped fixture hooks. */
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import webpack from 'webpack';
import {projectRoot,discoverTests,ownedFixture,isolatedEnvironment,captureProcess} from './prd-test.mjs';
const require=createRequire(import.meta.url);
async function compile(files,owner){
 const config={mode:'production',devtool:false,target:'electron44.7-main',context:projectRoot,entry:files,
  output:{path:owner,filename:'tests.cjs'},module:{rules:require('../webpack.rules.cjs')},resolve:{extensions:['.ts','.tsx','.js']},
  externals:{'better-sqlite3':'commonjs '+require.resolve('better-sqlite3')},optimization:{minimize:false,splitChunks:false,runtimeChunk:false}};
 await new Promise((resolve,reject)=>{const compiler=webpack(config);compiler.run((error,stats)=>compiler.close(closeError=>{
  if(error||closeError||!stats||stats.hasErrors())reject(new Error('Native test compilation failed.'));else resolve();
 }));});
}
/** @param {{root?:string,selection?:string[],timeoutMs?:number}} options */
export async function runNative({root=projectRoot,selection=[],timeoutMs=120000}={}){
 const failure={exitCode:1,output:'Native test setup or execution failed safely.',assertionFailures:0,passed:0,timedOut:false,abi:null,electron:null};
 try{
  if(process.platform!=='win32'||process.arch!=='x64')return failure;
  const files=discoverTests({root,kind:'native',selection}),owner=ownedFixture(root,'native');
  // Each selected suite must actually register/pass tests; a different suite cannot hide an empty file.
  if(files.length>1){
   const results=[];for(const file of files)results.push(await runNative({root,selection:['tests/prd/'+path.basename(file)],timeoutMs}));
   return {exitCode:results.every(r=>r.exitCode===0)?0:1,output:results.map(r=>r.output).join('\n'),assertionFailures:results.reduce((n,r)=>n+r.assertionFailures,0),passed:results.reduce((n,r)=>n+r.passed,0),timedOut:results.some(r=>r.timedOut),abi:results.every(r=>r.abi==='149')?'149':null,electron:results.every(r=>r.electron==='44.7.0')?'44.7.0':null};
  }
  await compile(files,owner);
  const bundle=path.join(owner,'tests.cjs'),marker='PRD_NATIVE_RUNTIME ';
  // Probe and tests execute in the same actual Electron binary, never host Node.
  const header=`if(process.versions.electron!=='44.7.0'||process.versions.modules!=='149')throw new Error('Pinned native runtime required');process.stdout.write(${JSON.stringify(marker)}+JSON.stringify({electron:process.versions.electron,abi:process.versions.modules})+'\\n');\n`;
  writeFileSync(bundle,header+readFileSync(bundle,'utf8'));
  const executable=require('electron');if(typeof executable!=='string'||!path.isAbsolute(executable))return failure;
  const result=await captureProcess(executable,['--test','--test-isolation=none','--test-concurrency=1','--test-reporter=tap',bundle],{
   cwd:root,env:{...isolatedEnvironment(owner),ELECTRON_RUN_AS_NODE:'1',PRD_NATIVE_FIXTURE_ROOT:owner},timeoutMs});
  const match=result.output.match(/PRD_NATIVE_RUNTIME (\{[^\r\n]+\})/);let runtime=null;try{runtime=match?JSON.parse(match[1]):null;}catch{}
  const passed=Number(result.output.match(/^# pass (\d+)\s*$/m)?.[1]??0);
  const assertionFailures=(result.output.match(/code: ['"]ERR_ASSERTION['"]/g)??[]).length;
  const registered=result.output.split(/\r?\n/).filter(line=>line.startsWith('# Subtest: ')).some(line=>
   line.slice('# Subtest: '.length).replaceAll(String.fromCharCode(92,92),String.fromCharCode(92))!==bundle);
  if(runtime?.electron!=='44.7.0'||runtime?.abi!=='149')return {...failure,...result,exitCode:1};
  return {...result,exitCode:result.exitCode===0&&passed>0&&registered?0:1,passed,assertionFailures,abi:runtime.abi,electron:runtime.electron};
 }catch{return failure;}
}
async function selfTest(){
 const root=ownedFixture(projectRoot,'native-self');mkdirSync(path.join(root,'tests/prd'),{recursive:true});
 const sources={pass:"import test from 'node:test';import assert from 'node:assert/strict';import Database from 'better-sqlite3';test('actual ABI',()=>{assert.equal(process.versions.modules,'149');const db=new Database(':memory:');assert.equal(db.prepare('SELECT 42 AS value').get().value,42);db.close();});",fail:"import test from 'node:test';import assert from 'node:assert/strict';test('intentional assertion',()=>assert.equal(1,2));",crash:'process.exit(13);',hang:"import test from 'node:test';test('hang',async()=>{setInterval(()=>{},1000);await new Promise(()=>{});});",empty:''};
 for(const [name,text]of Object.entries(sources))writeFileSync(path.join(root,'tests/prd',name+'.integration.test.ts'),text,{flag:'wx'});
 const results=[];for(const name of Object.keys(sources))results.push(await runNative({root,selection:['tests/prd/'+name+'.integration.test.ts'],timeoutMs:name==='hang'?2000:20000}));
 if(results[0].exitCode!==0||results[0].electron!=='44.7.0'||results[0].abi!=='149'||results[1].assertionFailures<1||results.slice(1).some(r=>r.exitCode===0)||!results[3].timedOut)throw new Error('Native self-test failed.');
 console.log('Native runner self-test: Electron 44.7.0 / ABI 149 / real SQLite, assertion failure, crash, timeout and empty-suite propagation verified.');
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 try{if(process.argv[2]==='--self-test')await selfTest();else{const result=await runNative({selection:process.argv.slice(2)});console.log(JSON.stringify(result));process.exitCode=result.exitCode;}}
 catch{console.error('Native runner self-test failed safely.');process.exitCode=1;}
}
