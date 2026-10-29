/** Test-only renderer builds in retained owned package copies; shipped package is read-only. */
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {lstat,realpath,cp,mkdir,readFile,writeFile,rename,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {extractAll,extractFile,createPackageWithOptions,uncache} from '@electron/asar';
import webpack from 'webpack';
import {projectRoot,ownedFixture} from './prd-test.mjs';
const require=createRequire(import.meta.url);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function verifyEntry(entry){
 if(typeof entry!=='string'||!/^tests\/prd\/[a-z0-9][a-z0-9-]*entry\.tsx$/i.test(entry))throw new Error('Invalid renderer fixture entry.');
 let current=projectRoot;
 for(const component of entry.split('/')){current=path.join(current,component);if((await lstat(current)).isSymbolicLink()||await realpath(current)!==current)throw new Error('Fixture entry identity could not be verified.');}
 if(!(await lstat(current)).isFile())throw new Error('Fixture entry is not a file.');return current;
}
export async function buildRendererHarness(entry){
 const source=await verifyEntry(entry),owner=ownedFixture(projectRoot,'renderer');
 const originalRoot=path.join(projectRoot,'out/gabPrd-win32-x64');
 const originalArchive=path.join(originalRoot,'resources/app.asar');
 if((await lstat(originalArchive)).isSymbolicLink())throw new Error('Original package identity changed.');
 const originalArchiveSha256=digest(await readFile(originalArchive));
 const names={mainSha256:'.webpack/main/index.cjs',preloadSha256:'.webpack/renderer/main_window/preload.cjs',htmlSha256:'.webpack/renderer/main_window/index.html',cssSha256:'.webpack/renderer/main_window/shell.css'};
 const hashes=Object.fromEntries(Object.entries(names).map(([key,name])=>[key,digest(extractFile(originalArchive,path.normalize(name)))]));
 const clone=path.join(owner,'package');await cp(originalRoot,clone,{recursive:true,errorOnExist:true,force:false});
 const archive=path.join(clone,'resources/app.asar'),extracted=path.join(owner,'extracted');extractAll(archive,extracted);
 const assets=path.join(owner,'renderer-assets');await mkdir(assets);
 const base=require('../webpack.renderer.config.cjs');
 // Do not emit/replace shell HTML/CSS or main/preload; only selected test renderer bundle.
 const config={...base,entry:{main_window:source},plugins:[],output:{...base.output,path:assets}};
 await new Promise((resolve,reject)=>{const compiler=webpack(config);compiler.run((error,stats)=>compiler.close(closeError=>{
  if(error||closeError||!stats||stats.hasErrors())reject(new Error('Owned renderer fixture compilation failed.'));else resolve();
 }));});
 const built=await readdir(path.join(assets,'main_window'));
 if(built.some(name=>!['index.js','shell.css'].includes(name))||!built.includes('index.js'))throw new Error('Unexpected fixture build assets.');
 const bundle=await readFile(path.join(assets,'main_window/index.js'));
 if(/sourceMappingURL|\beval\s*\(/.test(bundle.toString('utf8')))throw new Error('Unsafe fixture bundle rejected.');
 await writeFile(path.join(extracted,'.webpack/renderer/main_window/index.js'),bundle);
 for(const [key,name]of Object.entries(names))if(digest(await readFile(path.join(extracted,name)))!==hashes[key])throw new Error('Fixture altered privileged or shell assets.');
 const replacement=path.join(clone,'resources/fixture.asar');await createPackageWithOptions(extracted,replacement,{unpack:'**/*.{node,wasm}'});await rename(replacement,archive);
 uncache(archive); // extractAll cached the old copied archive's offsets before replacement.
 if(digest(await readFile(originalArchive))!==originalArchiveSha256)throw new Error('Original package changed during fixture build.');
 await writeFile(path.join(owner,'renderer-owner.json'),JSON.stringify({entry,originalArchiveSha256,...hashes}),{flag:'wx'});
 return {owner,executable:path.join(clone,'gabPrd.exe'),archive,originalArchive,originalArchiveSha256,...hashes};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 try{if(process.argv.length!==3||process.argv[2]!=='--self-test')throw new Error('Invalid harness command.');
  const fixture=await buildRendererHarness('tests/prd/renderer-smoke-entry.tsx');
  console.log('Renderer build self-test: owned copy, unchanged privileged/CSP shell assets and original archive verified. Actual mount is separately required by @runner.');
  if(!fixture.executable)process.exitCode=1;
 }catch{console.error('Renderer fixture build self-test failed safely.');process.exitCode=1;}
}
