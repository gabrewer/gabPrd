import { contextBridge, ipcRenderer } from 'electron';
import { CONTRACT_VERSION, STATUS_CHANNEL } from '../shared/bootstrap-contracts';
import type { BootstrapResult } from '../shared/bootstrap-contracts';
import { parseResult, safeError } from '../shared/bootstrap-validation';
import {PRD_CHANNELS,PRD_ERROR_MESSAGES} from '../shared/prd-contracts';
import type {PrdBridge,PrdRequest,PrdResult,CommandName,RequestId} from '../shared/prd-contracts';
import {parsePrdRequest,parsePrdResult,parsePrdEvent,parseDetach,parseCloseRequest,parseCloseResponse} from '../shared/prd-validation';

// Presentation only: this DOM marker grants no IPC or filesystem authority.
if (process.argv.includes('--gabprd-bootstrap-fixture-ui')) {
  window.addEventListener('DOMContentLoaded', () => {
    document.documentElement.dataset.bootstrapFixture = 'true';
    document.title = 'PRD Creator — Bootstrap';
    document.dispatchEvent(new Event('gabprd-bootstrap-fixture'));
  }, { once: true });
}

const bootstrap = Object.freeze({
  async getStatus(): Promise<BootstrapResult> {
    try {
      const value: unknown = await ipcRenderer.invoke(STATUS_CHANNEL, { contractVersion: CONTRACT_VERSION });
      return parseResult(value) ?? Object.freeze({ ok: false, error: safeError('INTERNAL') });
    } catch {
      return Object.freeze({ ok: false, error: safeError('INTERNAL') });
    }
  },
});
function failure(code:'INVALID_REQUEST'|'INTERNAL'):PrdResult{return {contractVersion:1,ok:false,command:null,requestId:null,error:{code,message:PRD_ERROR_MESSAGES[code],correlationId:crypto.randomUUID() as RequestId} as import('../shared/prd-contracts').PrdError};}
async function invoke<C extends CommandName>(command:C,value:PrdRequest<C>):Promise<PrdResult<C>>{
 const request=parsePrdRequest(value);if(!request||request.command!==command)return failure('INVALID_REQUEST') as PrdResult<C>;
 try{const reply:unknown=await ipcRenderer.invoke(PRD_CHANNELS.request,request);return (parsePrdResult(reply,request)??parsePrdResult(reply)??failure('INTERNAL')) as PrdResult<C>;}catch{return failure('INTERNAL') as PrdResult<C>;}
}
let pendingCloseId:string|null=null;
const prds:PrdBridge=Object.freeze({
 nativePickRepository:(r:PrdRequest<'NativePickRepository'>)=>invoke('NativePickRepository',r),
 setDefaultRepository:(r:PrdRequest<'SetDefaultRepository'>)=>invoke('SetDefaultRepository',r),
 listPrds:(r:PrdRequest<'ListPrds'>)=>invoke('ListPrds',r),
 createPrd:(r:PrdRequest<'CreatePrd'>)=>invoke('CreatePrd',r),
 openPrd:(r:PrdRequest<'OpenPrd'>)=>invoke('OpenPrd',r),
 readHistory:(r:PrdRequest<'ReadHistory'>)=>invoke('ReadHistory',r),
 readDocument:(r:PrdRequest<'ReadDocument'>)=>invoke('ReadDocument',r),
 saveDocument:(r:PrdRequest<'SaveDocument'>)=>invoke('SaveDocument',r),
 listDraftCandidates:(r:PrdRequest<'ListDraftCandidates'>)=>invoke('ListDraftCandidates',r),
 selectDraft:(r:PrdRequest<'SelectDraft'>)=>invoke('SelectDraft',r),
 sendTurn:(r:PrdRequest<'SendTurn'>)=>invoke('SendTurn',r),
 answerUiQuestion:(r:PrdRequest<'AnswerUiQuestion'>)=>invoke('AnswerUiQuestion',r),
 cancelOperation:(r:PrdRequest<'CancelOperation'>)=>invoke('CancelOperation',r),
 reconcilePrd:(r:PrdRequest<'ReconcilePrd'>)=>invoke('ReconcilePrd',r),
 retryWorkspaceSetup:(r:PrdRequest<'RetryWorkspaceSetup'>)=>invoke('RetryWorkspaceSetup',r),
 onEvent:(listener:Parameters<PrdBridge['onEvent']>[0])=>{const handler=(_event:Electron.IpcRendererEvent,value:unknown)=>{const parsed=parsePrdEvent(value);if(parsed)try{listener(parsed);}catch{/* No raw callback errors. */}};ipcRenderer.on(PRD_CHANNELS.event,handler);return ()=>ipcRenderer.removeListener(PRD_CHANNELS.event,handler);},
 detachSubscription:async(value:Parameters<PrdBridge['detachSubscription']>[0])=>{const parsed=parseDetach(value);if(parsed)await ipcRenderer.invoke(PRD_CHANNELS.detach,parsed).catch(()=>{});},
 onCloseRequested:(listener:Parameters<PrdBridge['onCloseRequested']>[0])=>{const handler=(_event:Electron.IpcRendererEvent,value:unknown)=>{const parsed=parseCloseRequest(value);if(parsed)try{pendingCloseId=parsed.closeId;listener(parsed);}catch{/* Missing acknowledgement blocks ordinary close. */}};ipcRenderer.on(PRD_CHANNELS.closeRequest,handler);return ()=>ipcRenderer.removeListener(PRD_CHANNELS.closeRequest,handler);},
 acknowledgeClose:async(value:Parameters<PrdBridge['acknowledgeClose']>[0])=>{const parsed=parseCloseResponse(value,pendingCloseId??'');if(parsed){pendingCloseId=null;await ipcRenderer.invoke(PRD_CHANNELS.closeResponse,parsed).catch(()=>{});}},
});
contextBridge.exposeInMainWorld('gabPrd', Object.freeze(process.argv.includes('--gabprd-product')?{bootstrap,prds}:{bootstrap}));
