import {test,expect} from '@playwright/test';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {createRequire} from 'node:module';
import {extractFile,listPackage} from '@electron/asar';
import {buildRendererHarness} from '../../scripts/prd-renderer-harness.mjs';
import {isolatedEnvironment} from '../../scripts/prd-test.mjs';
import {fixture,launch,hash} from './fixtures';
import type {RendererHarness} from './fixtures';
const require=createRequire(import.meta.url);
const entry='tests/prd/renderer-smoke-entry.tsx';
async function mounted(){const harness=await buildRendererHarness(entry) as unknown as RendererHarness;
 const f=await fixture();const app=await launch(f.root,harness.executable);return {harness,app};}

test('@runner actual mounted smoke uses real preload/service with unchanged shipped protections and original package',async()=>{
 const {harness,app}=await mounted();try{const page=await app.firstWindow();
  await expect(page.getByRole('heading',{name:'P02 renderer smoke mounted',exact:true})).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Real bootstrap service: ready');
  const w=await app.browserWindow(page);const prefs=await w.evaluate(w=>w.webContents.getLastWebPreferences());
  expect(prefs.sandbox).toBe(true);expect(prefs.contextIsolation).toBe(true);expect(prefs.nodeIntegration).toBe(false);expect(prefs.webSecurity).toBe(true);
  expect(await page.evaluate(()=>typeof Reflect.get(window,'require'))).toBe('undefined');
  expect(await hash(harness.originalArchive)).toBe(harness.originalArchiveSha256);
  const asset=(name:string)=>Buffer.from(extractFile(harness.archive,path.normalize(name)));
  const crypto=await import('node:crypto');const digest=(b:Buffer)=>crypto.createHash('sha256').update(b).digest('hex');
  expect(digest(asset('.webpack/main/index.cjs'))).toBe(harness.mainSha256);
  expect(digest(asset('.webpack/renderer/main_window/preload.cjs'))).toBe(harness.preloadSha256);
  expect(digest(asset('.webpack/renderer/main_window/index.html'))).toBe(harness.htmlSha256);
  expect(digest(asset('.webpack/renderer/main_window/shell.css'))).toBe(harness.cssSha256);
  const html=asset('.webpack/renderer/main_window/index.html').toString('utf8');expect(html).not.toMatch(/unsafe-eval|unsafe-inline/);
  const original=Buffer.from(extractFile(harness.originalArchive,path.normalize('.webpack/renderer/main_window/index.js'))).toString('utf8');
  expect(original).not.toContain('P02 renderer smoke mounted');
  expect(listPackage(harness.originalArchive,{isPack:false}).join('\n')).not.toMatch(/tests[\\/]prd|prd-renderer-harness|renderer-smoke-entry/);
 }finally{await app.close();}
});

test('@runner mount/result assertions detect absent UI and deliberately wrong expected output, not setup failures',async()=>{
 for(const mode of ['absent','wrong']){
  const f=await fixture();const child=spawnSync(process.execPath,[require.resolve('@playwright/test/cli'),'test','--config','playwright.prd.config.ts','--grep','@probe-runner','--reporter=json'],
   {cwd:process.cwd(),env:{...isolatedEnvironment(f.root),PRD_RUNNER_PROBE:mode},encoding:'utf8',timeout:110000,windowsHide:true,maxBuffer:4*1024*1024});
  expect(child.error).toBeUndefined();expect(child.status).toBe(1);
  const report=JSON.parse(child.stdout);const results=report.suites.flatMap((s:any)=>s.specs).flatMap((s:any)=>s.tests).flatMap((t:any)=>t.results);
  expect(results).toHaveLength(1);expect(results[0].status).toBe('failed');
  expect(results[0].error.message).toMatch(/expect\(|toBeVisible|toHaveText/);
  expect(results[0].error.message).not.toMatch(/not implemented|compil|Cannot find|launch.*failed/i);
 }
});

test('@probe-runner assertion-control',async()=>{
 test.skip(!process.env.PRD_RUNNER_PROBE,'Only subprocess assertion controls execute this case.');
 const {app}=await mounted();try{const page=await app.firstWindow();
  await expect(page.getByRole('heading',{name:'P02 renderer smoke mounted',exact:true})).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Real bootstrap service: ready');
  if(process.env.PRD_RUNNER_PROBE==='absent'){await page.evaluate(()=>document.getElementById('root')!.replaceChildren());
   await expect(page.getByRole('heading',{name:'P02 renderer smoke mounted',exact:true})).toBeVisible({timeout:1000});}
  else await expect(page.getByRole('status')).toHaveText('DELIBERATELY WRONG RESULT',{timeout:1000});
 }finally{await app.close();}
});
