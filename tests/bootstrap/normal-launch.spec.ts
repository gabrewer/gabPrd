import {test,expect,_electron} from '@playwright/test';
import type {ElectronApplication} from '@playwright/test';
import type {RequestId} from '../../src/shared/prd-contracts';
import {fixture,tamperedPackage,digest,waitReady,packageRoot} from './fixtures';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
let hiddenExecutable:string,originalHash:string;
test.beforeAll(async()=>{
 originalHash=await digest(path.join(packageRoot,'resources/app.asar'));
 hiddenExecutable=await tamperedPackage(async root=>{
  const main=path.join(root,'.webpack/main/index.cjs'),source=await readFile(main,'utf8'),constructor=/\bnew [\w$]+\.BrowserWindow\(\{/g;
  if([...source.matchAll(constructor)].length!==1)throw new Error('Owned hidden constructor unavailable');
  const prelude=`const __e=require('electron');process.on('uncaughtException',()=>__e.app.exit(1));const __root=process.env.GABPRD_OWNED_HIDDEN_ROOT;if(!__root)throw new Error('Owned profile unavailable');const __p=require('node:path');__e.app.setPath('userData',__p.join(__root,'user-data'));__e.app.setPath('sessionData',__p.join(__root,'session-data'));__e.app.setAppLogsPath(__p.join(__root,'logs'));const __ownedHiddenWindow=new Proxy(__e.BrowserWindow,{construct(Target,args){const [options,...rest]=args;return Reflect.construct(Target,[{...options,show:false,webPreferences:{...options.webPreferences,backgroundThrottling:false}},...rest]);}});const __deny=()=>{throw new Error('Unexpected owned native modal suppressed');};if(!Reflect.set(__e.dialog,'showMessageBox',__deny)||!Reflect.set(__e.dialog,'showErrorBox',__deny))throw new Error('Owned native-modal guard unavailable');globalThis.__ownedLaunchForks=0;const __fork=__e.utilityProcess.fork.bind(__e.utilityProcess);__e.utilityProcess.fork=(...args)=>{globalThis.__ownedLaunchForks++;return __fork(...args);};\n`;
  await writeFile(main,prelude+source.replace(constructor,'new __ownedHiddenWindow({'));
 });
});
test.afterAll(async()=>{expect(await digest(path.join(packageRoot,'resources/app.asar'))).toBe(originalHash);});
async function launchOwned(args:string[]=[]){
 const f=await fixture();for(const child of['user-data','session-data','logs','pi-config'])await mkdir(path.join(f.root,child));
 const env:Record<string,string>={SystemRoot:process.env.SystemRoot??process.env.SYSTEMROOT??'',WINDIR:process.env.WINDIR??process.env.SystemRoot??'',PATH:process.env.PATH??'',ComSpec:process.env.ComSpec??'',PATHEXT:process.env.PATHEXT??'.COM;.EXE;.BAT;.CMD',HOME:f.root,USERPROFILE:f.root,TEMP:process.env.TEMP??process.env.TMP??f.root,TMP:process.env.TMP??process.env.TEMP??f.root,APPDATA:f.root,LOCALAPPDATA:f.root,PI_CODING_AGENT_DIR:path.join(f.root,'pi-config'),GABPRD_OWNED_HIDDEN_ROOT:f.root};
 const actual=args.map(argument=>argument==='owned-bootstrap-root'?'--bootstrap-fixture-root='+f.root:argument);
 return {f,app:await _electron.launch({executablePath:hiddenExecutable,args:actual,cwd:f.root,env,timeout:30_000,chromiumSandbox:true,bypassCSP:false})};
}
async function productReady(app:ElectronApplication){
 const page=await app.firstWindow();expect(await(await app.browserWindow(page)).evaluate(window=>window.isVisible())).toBe(false);await expect(page).toHaveTitle('PRD Creator');await expect(page.getByRole('heading',{name:'What would you like to build?',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Choose repository',exact:true})).toBeEnabled();await expect(page.getByText(/bootstrap|SQLite|SDK|not implemented|Refresh status/i)).toHaveCount(0);expect(await app.evaluate(()=>Reflect.get(globalThis,'__ownedLaunchForks'))).toBe(0);return page;
}
test('ordinary launch shows the real product and no diagnostic text after startup finishes',async()=>{
 const {app}=await launchOwned();let otherId:number|undefined;try{const page=await productReady(app);expect(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length)).toBe(1);
  const before=await page.evaluate(()=>window.gabPrd.prds!.listPrds({contractVersion:1,requestId:crypto.randomUUID() as RequestId,command:'ListPrds',cursor:null}));expect(before.ok).toBe(true);if(!before.ok)throw new Error('Owned product metadata unavailable');
  const pending=app.waitForEvent('window');otherId=await app.evaluate(async({BrowserWindow},preload)=>{const owner=BrowserWindow.getAllWindows()[0]!;const other=new BrowserWindow({show:false,webPreferences:{preload,additionalArguments:['--gabprd-product'],sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,backgroundThrottling:false}});await other.loadURL(owner.webContents.getURL());return other.id;},path.join(path.dirname(hiddenExecutable),'resources/app.asar/.webpack/renderer/main_window/preload.cjs'));const foreign=await pending;expect(await(await app.browserWindow(foreign)).evaluate(window=>window.isVisible())).toBe(false);
  const denied=await foreign.evaluate(version=>window.gabPrd.prds!.setDefaultRepository({contractVersion:1,requestId:crypto.randomUUID() as RequestId,command:'SetDefaultRepository',repositoryId:null,expectedVersion:version}),before.value.defaultRepository.version);expect(denied.ok).toBe(false);if(!denied.ok)expect(denied.error.code).toBe('UNAUTHORIZED_CALLER');
  const after=await page.evaluate(()=>window.gabPrd.prds!.listPrds({contractVersion:1,requestId:crypto.randomUUID() as RequestId,command:'ListPrds',cursor:null}));expect(after.ok).toBe(true);if(after.ok)expect(after.value).toEqual(before.value);
 }finally{if(otherId!==undefined)await app.evaluate(({BrowserWindow},id)=>BrowserWindow.fromId(id)?.destroy(),otherId);await app.close();}
});
test('a diagnostic-looking application argument cannot enable the renderer fixture view',async()=>{
 const {app}=await launchOwned(['--gabprd-bootstrap-fixture-ui']);try{await productReady(app);}finally{await app.close();}
});
test('diagnostic UI remains available only on explicit owned fixture launch',async()=>{
 const {app}=await launchOwned(['owned-bootstrap-root']);try{await waitReady(app);const page=await app.firstWindow();expect(await(await app.browserWindow(page)).evaluate(window=>window.isVisible())).toBe(false);await expect(page).toHaveTitle('PRD Creator — Bootstrap');await expect(page.getByRole('heading',{name:'PRD Creator — Bootstrap'})).toBeVisible();await expect(page.getByRole('button',{name:'Refresh status'})).toBeVisible();expect(await app.evaluate(()=>Reflect.get(globalThis,'__ownedLaunchForks'))).toBe(1);}finally{await app.close();}
});
