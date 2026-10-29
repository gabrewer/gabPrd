/** Exact current-frame product IPC; never a generic renderer invoke/filesystem channel. */
import {ipcMain,dialog} from 'electron';
import type {BrowserWindow,IpcMainInvokeEvent,WebFrameMain} from 'electron';
import {randomUUID} from 'node:crypto';
import {SHELL_URL} from '../shared/bootstrap-contracts';
import {PRD_CHANNELS as CH,PRD_LIMITS,PRD_ERROR_MESSAGES as M} from '../shared/prd-contracts';
import type * as C from '../shared/prd-contracts';
import {parsePrdRequest,parsePrdResult,parsePrdEvent,parseDetach,parseCloseResponse} from '../shared/prd-validation';
import type {PrdServicePort,ProductCaller} from './prd-ports';
export function currentProductCaller(window:BrowserWindow,frame?:WebFrameMain|null):ProductCaller{
 const owned=window.webContents,destroyed=window.isDestroyed()||owned.isDestroyed(),mainFrame=destroyed?null:owned.mainFrame,actual=frame===undefined?mainFrame:frame;
 return {identity:{sender:owned,frame:actual,url:actual?.url??''},expected:{sender:owned,mainFrame:mainFrame??Object.freeze({}),url:SHELL_URL},destroyed};
}
export function isProductCallerLive(window:BrowserWindow,caller:ProductCaller):boolean{
 try{const owned=window.webContents,frame=owned.mainFrame;return !window.isDestroyed()&&!owned.isDestroyed()&&!caller.destroyed&&caller.identity.sender===owned&&caller.identity.frame===frame&&caller.identity.url===SHELL_URL&&frame.url===SHELL_URL&&owned.getURL()===SHELL_URL;}catch{return false;}
}
function rejected(code:C.PrdErrorCode):C.PrdResult{return {contractVersion:1,ok:false,command:null,requestId:null,error:{code,message:M[code],correlationId:randomUUID()} as C.PrdError};}
export function registerProductIpc(window:BrowserWindow,service:PrdServicePort,onClosed:()=>void):()=>void{
 const owned=window.webContents;let disposed=false,attachedFrame:WebFrameMain|null=null,detachListener:(()=>void)|undefined,allowClose=false,closeRequest:C.CloseRequest|null=null,closeTimer:ReturnType<typeof setTimeout>|undefined;
 function caller(event:IpcMainInvokeEvent):ProductCaller|null{
  try{if(disposed||event.sender!==owned)return null;const value=currentProductCaller(window,event.senderFrame);return isProductCallerLive(window,value)?value:null;}catch{return null;}
 }
 let queue:C.PrdEvent[]=[],queueBytes=0,scheduled=false,responsive=true;const pendingResync=new Map<C.SubscriptionId,C.PrdEvent>();
 function resync(event:C.PrdEvent):C.PrdEvent {const {contractVersion,subscriptionId,requestId,prdId,sessionId,operationId,generationId,sequence,version}=event;return parsePrdEvent({contractVersion,subscriptionId,requestId,prdId,sessionId,operationId,generationId,sequence,version,type:'resyncRequired',reason:'backpressure'})!;}
 function flush(){if(scheduled)return;scheduled=true;setImmediate(()=>{scheduled=false;if(disposed||!responsive)return;if(owned.isDestroyed()||owned.mainFrame!==attachedFrame||owned.getURL()!==SHELL_URL){queue=[];queueBytes=0;return;}const batch=queue;queue=[];queueBytes=0;for(const event of batch){if(disposed||owned.isDestroyed())break;try{owned.send(CH.event,event);}catch{break;}}});}
 function attach(value:ProductCaller){const frame=owned.mainFrame;if(frame===attachedFrame)return;detachListener?.();queue=[];queueBytes=0;pendingResync.clear();attachedFrame=frame;detachListener=service.attach(value,event=>{
  if(disposed||!isProductCallerLive(window,value))return;
  if(!responsive){pendingResync.set(event.subscriptionId,resync(event));return;}
  const bytes=Buffer.byteLength(JSON.stringify(event));if(queue.length>=PRD_LIMITS.eventQueueItems||queueBytes+bytes>PRD_LIMITS.eventQueueBytes){const affected=new Map(queue.map(item=>[item.subscriptionId,item]));affected.set(event.subscriptionId,event);queue=[...affected.values()].map(resync);queueBytes=Buffer.byteLength(JSON.stringify(queue));}else{queue.push(event);queueBytes+=bytes;}flush();
 });}
 const unresponsive=()=>{responsive=false;for(const event of queue)pendingResync.set(event.subscriptionId,resync(event));queue=[];queueBytes=0;};
 const resumed=()=>{responsive=true;if(pendingResync.size){queue=[...pendingResync.values()];queueBytes=Buffer.byteLength(JSON.stringify(queue));pendingResync.clear();flush();}};
 window.on('unresponsive',unresponsive);window.on('responsive',resumed);
 ipcMain.handle(CH.request,async(event,value:unknown)=>{
  const owner=caller(event);if(!owner)return rejected('UNAUTHORIZED_CALLER');const request=parsePrdRequest(value);if(!request)return rejected('INVALID_REQUEST');
  try{attach(owner);const result=await service.request(owner,request);if(!isProductCallerLive(window,owner))return rejected('UNAUTHORIZED_CALLER');return parsePrdResult(result,request)??rejected('INTERNAL');}catch{return rejected('INTERNAL');}
 });
 ipcMain.handle(CH.detach,(event,value:unknown)=>{const owner=caller(event),request=parseDetach(value);if(!owner||!request)return;try{service.detach(owner,request);}catch{/* Invalid ownership never changes another subscription. */}});
 async function blocked(){closeRequest=null;if(closeTimer!==undefined)clearTimeout(closeTimer);closeTimer=undefined;if(!window.isDestroyed())await dialog.showMessageBox(window,{type:'warning',title:'PRD Creator',message:M.INTERRUPTED,detail:'The window remains open so you can keep working or try closing again.',buttons:['Keep working'],noLink:true});}
 ipcMain.handle(CH.closeResponse,async(event,value:unknown)=>{
  const owner=caller(event),response=parseCloseResponse(value,closeRequest?.closeId??'');if(!owner||!response||!closeRequest||response.closeId!==closeRequest.closeId)return;
  const accepted=service.acknowledgeClose(owner,response);if(!accepted.ok)return;if(closeTimer!==undefined)clearTimeout(closeTimer);closeTimer=undefined;
  if(response.decision==='blocked'){closeRequest=null;return;}
  const result=await service.shutdown();if(!result.ok){await blocked();return;}
  closeRequest=null;allowClose=true;dispose();onClosed();if(!window.isDestroyed())window.destroy();
 });
 const beginClose=(event:Electron.Event)=>{
  if(allowClose||disposed)return;event.preventDefault();if(closeRequest)return;
  try{const owner=currentProductCaller(window);if(!isProductCallerLive(window,owner)){void service.shutdown().then(result=>{if(result.ok){allowClose=true;dispose();window.destroy();onClosed();}});return;}
   closeRequest=service.beginClose(owner);owned.send(CH.closeRequest,closeRequest);closeTimer=setTimeout(()=>{void blocked();},PRD_LIMITS.shutdownTimeoutMs);
  }catch{void blocked();}
 };
 window.on('close',beginClose);
 function dispose(){if(disposed)return;disposed=true;if(closeTimer!==undefined)clearTimeout(closeTimer);closeTimer=undefined;detachListener?.();detachListener=undefined;attachedFrame=null;ipcMain.removeHandler(CH.request);ipcMain.removeHandler(CH.detach);ipcMain.removeHandler(CH.closeResponse);window.removeListener('close',beginClose);window.removeListener('unresponsive',unresponsive);window.removeListener('responsive',resumed);queue=[];queueBytes=0;pendingResync.clear();}
 return dispose;
}
