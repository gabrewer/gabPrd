import {test,expect,_electron} from '@playwright/test';
import {fixture,executable,launch,waitReady} from './fixtures';
test('ordinary launch shows no diagnostic text, including after startup finishes',async()=>{
 const f=await fixture();const app=await _electron.launch({executablePath:executable,args:[],cwd:f.root,timeout:30_000,chromiumSandbox:true,bypassCSP:false});
 try{const page=await app.firstWindow();await expect(page).toHaveTitle('PRD Creator');await expect(page.locator('body')).toHaveText('');await waitReady(app);await expect(page.locator('body')).toHaveText('');await expect(page.getByText(/bootstrap|SQLite|SDK|not implemented|Refresh status/i)).toHaveCount(0);expect(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length)).toBe(1);}finally{await app.close();}
});
test('a diagnostic-looking application argument cannot enable the renderer fixture view',async()=>{
 const f=await fixture();const app=await _electron.launch({executablePath:executable,args:['--gabprd-bootstrap-fixture-ui'],cwd:f.root,timeout:30_000,chromiumSandbox:true,bypassCSP:false});try{const page=await app.firstWindow();await waitReady(app);await expect(page).toHaveTitle('PRD Creator');await expect(page.locator('body')).toHaveText('');}finally{await app.close();}
});
test('diagnostic UI remains available only on explicit fixture launch',async()=>{
 const f=await fixture(),app=await launch(f.root);try{await waitReady(app);const page=await app.firstWindow();await expect(page).toHaveTitle('PRD Creator — Bootstrap');await expect(page.getByRole('heading',{name:'PRD Creator — Bootstrap'})).toBeVisible();await expect(page.getByRole('button',{name:'Refresh status'})).toBeVisible();}finally{await app.close();}
});
