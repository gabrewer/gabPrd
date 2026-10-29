import {test,expect} from '@playwright/test';
import type {Page,ElectronApplication} from '@playwright/test';
import path from 'node:path';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createPackageWithOptions,uncache} from '@electron/asar';
import {buildRendererHarness} from '../../scripts/prd-renderer-harness.mjs';
import {fixture,launch,hash} from './fixtures';
import type {RendererHarness} from './fixtures';
let harness:RendererHarness;
test.beforeAll(async()=>{
 harness=await buildRendererHarness('tests/prd/layout-entry.tsx') as unknown as RendererHarness;
 // The common harness intentionally preserves packaged CSS. Only this owned copy
 // receives current-source CSS; never patch the standard or running application.
 const extracted=path.join(harness.owner,'extracted');
 await writeFile(path.join(extracted,'.webpack/renderer/main_window/shell.css'),await readFile('src/renderer/shell.css'));
 const replacement=path.join(harness.owner,'layout.asar');await createPackageWithOptions(extracted,replacement,{unpack:'**/*.{node,wasm}'});
 await rename(replacement,harness.archive);uncache(harness.archive);
 expect(await hash(harness.originalArchive)).toBe(harness.originalArchiveSha256);
});
async function contained(page:Page){
 const geometry=await page.evaluate(()=>{const root=document.scrollingElement!,shell=document.querySelector('.workspace-shell')!.getBoundingClientRect();return {width:innerWidth,height:innerHeight,scrollWidth:root.scrollWidth,scrollHeight:root.scrollHeight,scrollTop:root.scrollTop,shellTop:shell.top,shellBottom:shell.bottom};});
 expect(geometry.scrollWidth,JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.width+1);
 expect(geometry.scrollHeight,JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.height+1);
 expect(geometry.scrollTop).toBe(0);expect(geometry.shellTop).toBe(0);expect(geometry.shellBottom).toBeCloseTo(geometry.height,0);
}
async function open(){const f=await fixture(),app=await launch(f.root,harness.executable);const page=await app.firstWindow();await expect(page.getByRole('heading',{name:'PRD Creator layout regression'})).toBeVisible();return {app,page};}
async function close(app:ElectronApplication){await app.close();expect(await hash(harness.originalArchive)).toBe(harness.originalArchiveSha256);}
test('@layout long panes and live announcements never create a root scrollbar or blank tail; keyboard scrolls independently',async()=>{
 const {app,page}=await open();try{
  await page.setViewportSize({width:1600,height:1000});
  await page.getByRole('button',{name:'Update announcement'}).evaluate((el:HTMLButtonElement)=>el.click());
  await contained(page);
  const conversation=page.getByRole('region',{name:'Conversation scroll area',exact:true}),document=page.getByRole('region',{name:'PRD scroll area',exact:true});
  for(const pane of [conversation,document]){await expect(pane).toHaveAttribute('tabindex','0');expect(await pane.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);}
  await conversation.focus();await page.keyboard.press('End');await expect.poll(()=>conversation.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);
  expect(await document.evaluate(el=>el.scrollTop)).toBe(0);
  const reply=page.getByLabel('Reply to Pi');await reply.fill('Keep this unsent reply.');await reply.focus();await reply.evaluate(el=>Reflect.set(window,'layoutReply',el));
  await document.focus();await page.keyboard.press('End');await expect.poll(()=>document.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);await expect(document).toContainText('End of verified document.');
  await reply.focus();await page.setViewportSize({width:1500,height:900});await expect(reply).toBeFocused();await expect(reply).toHaveValue('Keep this unsent reply.');expect(await reply.evaluate(el=>el===Reflect.get(window,'layoutReply'))).toBe(true);
  await expect(page.getByRole('button',{name:'Send message',exact:true})).toBeInViewport();await contained(page);
 }finally{await close(app);}
});
test('@layout compact/zoom-equivalent and expanded metadata keep pane, navigation, form and list controls reachable',async()=>{
 const {app,page}=await open();try{
  for(const size of [{width:1600,height:1000},{width:1000,height:650},{width:700,height:500},{width:500,height:400},{width:320,height:480}]){
   await page.setViewportSize(size);await contained(page);
   await page.getByText('Document location',{exact:true}).click();
   const toggle=page.getByRole('button',{name:'Toggle verified draft'});await toggle.scrollIntoViewIfNeeded();await expect(toggle).toBeInViewport();await contained(page);
   await page.getByText('Document location',{exact:true}).click();
   await page.getByRole('button',{name:'Focus conversation',exact:true}).click();const reply=page.getByLabel('Reply to Pi');await reply.fill('Preserved at '+size.width);await expect(reply).toBeInViewport();await page.keyboard.press('Tab');const send=page.getByRole('button',{name:'Send message',exact:true});await expect(send).toBeFocused();await expect(send).toBeInViewport();
   await page.getByRole('button',{name:'Focus PRD',exact:true}).click();const doc=page.getByRole('region',{name:'PRD scroll area',exact:true});await doc.focus();await page.keyboard.press('End');await expect.poll(()=>doc.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);await contained(page);
   await page.getByRole('button',{name:'Focus conversation',exact:true}).click();await expect(reply).toHaveValue('Preserved at '+size.width);
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const view of ['New PRD','Your PRDs']){await page.getByRole('button',{name:view,exact:true}).click();const last=page.getByRole('button',{name:'Last reachable control'});await last.focus();await expect(last).toBeInViewport();await contained(page);}
 }finally{await close(app);}
});
