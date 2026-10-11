import {test,expect} from '@playwright/test';
import axe from 'axe-core';
import {writeFile} from 'node:fs/promises';
import {fixture,launch,waitReady} from './fixtures';
test('packaged shell keyboard focus/activation, semantic checks, zoom and reduced-motion supplement',async()=>{const f=await fixture();const app=await launch(f.root);try{await waitReady(app);const page=await app.firstWindow();const refresh=page.getByRole('button',{name:'Refresh status'});await page.keyboard.press('Tab');await expect(refresh).toBeFocused();await page.keyboard.press('Enter');await expect(refresh).toBeFocused();await page.keyboard.press('Space');await expect(refresh).toBeFocused();
 await page.evaluate(axe.source);const results=await page.evaluate(async()=>{const a=Reflect.get(window,'axe') as typeof axe;const r=await a.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length})),incomplete:r.incomplete.map(v=>v.id)};});await writeFile('.pi/tmp/bootstrap-evidence/axe-results.json',JSON.stringify(results,null,2));expect(results.violations).toEqual([]);
 await page.emulateMedia({reducedMotion:'reduce'});expect(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
 const w=await app.browserWindow(page);await w.evaluate(w=>w.webContents.setZoomFactor(2));await expect(refresh).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);await refresh.focus();await page.keyboard.press('Enter');await expect(refresh).toBeFocused();await page.screenshot({path:'.pi/tmp/bootstrap-evidence/shell-200pct-zoom.png'});
 // These are supplemental automated checks, NOT Narrator or 200% Windows OS scaling evidence.
}finally{await app.close();}});
