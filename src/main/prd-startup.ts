/** Normal persistent application startup; bootstrap fixture mode is selected separately by main. */
import {app,session,dialog} from 'electron';
import type {BrowserWindow} from 'electron';
import {mkdirSync,realpathSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import type * as C from '../shared/prd-contracts';
import {PRD_ERROR_MESSAGES as M} from '../shared/prd-contracts';
import {SHELL_URL} from '../shared/bootstrap-contracts';
import {installAssetProtocol,registerBootstrapScheme} from './assets';
import {createBootstrapWindow} from './window';
import {PrdStore} from './prd-store';
import {PrdWorkspace} from './prd-workspace';
import {PrdDocuments} from './prd-documents';
import {PrdPiUtility} from './pi-utility';
import {PrdService} from './prd-service';
import type {PrdServiceDependencies} from './prd-service';
import {registerProductIpc,isProductCallerLive} from './prd-ipc';
import {verifiedDirectory} from './prd-paths';
import {verifyPackagedFile} from '../pi-utility/prd-resources';
import {requireStore} from './prd-schema';
export function startProduct():void{
 registerBootstrapScheme();if(!app.requestSingleInstanceLock()){app.exit(0);return;}
 let window:BrowserWindow|undefined,service:PrdService|undefined,dispose:(()=>void)|undefined,closed=false;
 const close=()=>{if(window&&!window.isDestroyed())window.close();else void(service?.shutdown()??Promise.resolve({ok:true})).then(result=>{closed=true;app.exit(result.ok?0:1);});};
 app.on('second-instance',()=>{if(window&&!window.isDestroyed()){if(window.isMinimized())window.restore();window.focus();}});
 app.on('before-quit',event=>{if(closed)return;event.preventDefault();close();});
 app.on('window-all-closed',()=>{if(closed)app.quit();});process.on('SIGINT',close);process.on('SIGTERM',close);
 void app.whenReady().then(async()=>{
  const userData=app.getPath('userData');mkdirSync(userData,{recursive:true});const canonical=realpathSync(userData) as C.CanonicalPath;verifiedDirectory(canonical);
  const store=new PrdStore(),opened=await store.open(canonical);let deps:PrdServiceDependencies|null=null;let interrupted:readonly C.OperationRecord[]=[];
  if(opened.ok&&opened.value.health.state==='ready'){
   const recovered=store.recoverInterrupted();requireStore(recovered.ok,'STORE_READ_ONLY');interrupted=recovered.value;
   const workspace=new PrdWorkspace(store,opened.value.roots),documents=new PrdDocuments(store,opened.value.roots,workspace);deps={store,roots:opened.value.roots,workspace,documents};
  }
  const nonce=randomBytes(24).toString('base64');installAssetProtocol(session.defaultSession,app.getAppPath(),nonce);window=createBootstrapWindow(false);const owned=window;
  service=new PrdService(deps,{
   appPath:app.getAppPath() as C.CanonicalPath,
   isLive:caller=>isProductCallerLive(owned,caller),
   createPi:()=>new PrdPiUtility(),
   pickRepository:async()=>{requireStore(!owned.isDestroyed(),'INTERRUPTED');const selected=await dialog.showOpenDialog(owned,{title:'Choose a local Git repository',buttonLabel:'Use repository',properties:['openDirectory']});if(selected.canceled)return null;requireStore(selected.filePaths.length===1,'PATH_INVALID');const folder=realpathSync(selected.filePaths[0]!) as C.CanonicalPath;verifiedDirectory(folder);return folder;},
   agentDir:async()=>{
    const root=app.getAppPath(),sdkRoot=path.join(root,'node_modules/@earendil-works/pi-coding-agent'),entry=path.join(sdkRoot,'dist/index.js');verifyPackagedFile(entry,root);
    const sdk=await import(/* webpackIgnore: true */pathToFileURL(entry).href) as typeof import('@earendil-works/pi-coding-agent');
    requireStore(sdk.VERSION==='1.1.0'&&sdk.getPackageDir()===sdkRoot,'CONFIG_INCOMPATIBLE');const directory=realpathSync(sdk.getAgentDir()) as C.CanonicalPath;verifiedDirectory(directory);return directory;
   },
  },interrupted);
  dispose=registerProductIpc(owned,service,()=>{closed=true;queueMicrotask(()=>app.quit());});
  owned.once('closed',()=>{dispose?.();if(!closed)void service!.shutdown().then(result=>{closed=true;app.exit(result.ok?0:1);});});
  await owned.loadURL(SHELL_URL);
 }).catch(()=>{console.error(M.INTERNAL);if(window&&!window.isDestroyed())void dialog.showMessageBox(window,{type:'error',title:'PRD Creator',message:M.STORE_READ_ONLY,buttons:['OK']}).catch(()=>{});else app.exit(1);});
}
