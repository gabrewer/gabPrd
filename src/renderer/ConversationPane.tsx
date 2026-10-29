import {useEffect,useId,useRef,useState} from 'react';
import type * as C from '../shared/prd-contracts';
import {PRD_LIMITS as L,PRD_ERROR_MESSAGES as M} from '../shared/prd-contracts';
import PrdQuestionDialog from './PrdQuestionDialog';
export interface TurnPreconditions {readonly expectedVersion:C.RecordVersion;readonly expectedDocumentRevision:C.DocumentRevision|null}
export interface ConversationPaneProps {readonly bridge:C.PrdBridge;readonly snapshot:C.PrdSnapshot;readonly onSnapshot:(value:C.PrdSnapshot)=>void;readonly beforeTurn:()=>Promise<TurnPreconditions|null>}
interface LiveMessage {messageId:C.MessageId;role:'writer'|'assistant';text:string;truncated:boolean;bytes:number}
interface Controller {refresh:()=>Promise<void>;history:(cursor:C.Cursor|null)=>Promise<void>}
interface ExtensionActivity {key:string;label:string;text:string}
interface ExtensionNotice {sequence:C.EventSequence;level:'info'|'warning';text:string}
const requestId=()=>crypto.randomUUID() as C.RequestId;
const encoder=new TextEncoder();
/** Pure view-state selection, also used by fast readiness regressions. */
export function conversationStateText(loading:boolean,session:C.SessionView,operation:C.OperationView|null,location:C.PrdSnapshot['draftLocation']):string{
 const working=operation!==null&&operation.phase!=='finished';
 if(loading)return 'Opening the saved conversation…';
 if(session.state==='notAllocated')return operation?.error?'Workspace setup stopped before brainstorming. Review the error and retry setup.':location.state==='unresolved'&&location.choices.length>0?'Choose the document location to start brainstorming.':'Preparing your PRD workspace…';
 return working?operation.phase==='awaitingUiResponse'?'Pi is waiting for your answer.':operation.phase==='cancelling'?'Stopping Pi and checking saved work…':'Pi is working…':session.state==='allocated'?'No completed conversation turn has been saved yet. Your workspace has been kept.':'Ready for your next message.';
}
export default function ConversationPane({bridge,snapshot,onSnapshot,beforeTurn}:ConversationPaneProps){
 const [current,setCurrent]=useState(snapshot),[history,setHistory]=useState<C.HistoryPage|null>(null),[live,setLive]=useState<readonly LiveMessage[]>([]),[text,setText]=useState(''),[error,setError]=useState(''),[sending,setSending]=useState(false),[loading,setLoading]=useState(true),[announcement,setAnnouncement]=useState(''),[previous,setPrevious]=useState<readonly (C.Cursor|null)[]>([]);
 const [activity,setActivity]=useState<readonly ExtensionActivity[]>([]),[notices,setNotices]=useState<readonly ExtensionNotice[]>([]);
 const inputId=useId(),errorId=useId(),latest=useRef(snapshot),callbacks=useRef({onSnapshot,beforeTurn}),controller=useRef<Controller|null>(null),liveMessages=useRef(new Map<C.MessageId,LiveMessage>()),cursor=useRef<C.Cursor|null>(null),mounted=useRef(true);
 callbacks.current={onSnapshot,beforeTurn};
 useEffect(()=>{if(snapshot.prd.prdId===latest.current.prd.prdId&&snapshot.sequence>=latest.current.sequence){latest.current=snapshot;setCurrent(snapshot);}},[snapshot]);
 useEffect(()=>{
  mounted.current=true;let active=true,opening=true,overflow=false,syncing:Promise<void>|null=null,syncAgain=false,sequence=Number(latest.current.sequence),lastUiSequence=0;let buffered:C.PrdEvent[]=[],bufferedBytes=0;
  const prdId=snapshot.prd.prdId,subscriptionId=crypto.randomUUID() as C.SubscriptionId;
  function apply(value:C.PrdSnapshot){if(!active||value.prd.prdId!==prdId||value.sequence<latest.current.sequence)return;const previous=latest.current.operation;latest.current=value;sequence=Math.max(sequence,value.sequence);setCurrent(value);callbacks.current.onSnapshot(value);if(value.operation?.phase==='finished'&&(previous?.operationId!==value.operation.operationId||previous.phase!=='finished'))setAnnouncement(value.operation.error?.message??'Pi finished this turn. Saved work has been refreshed.');}
  async function readHistory(next:C.Cursor|null):Promise<void>{
   const session=latest.current.prd.session;if(session.state==='notAllocated'||!active)return;
   const result=await bridge.readHistory({contractVersion:1,requestId:requestId(),command:'ReadHistory',prdId,sessionId:session.sessionId,cursor:next});if(!active)return;
   if(!result.ok){if(result.error.code==='STALE_VERSION'&&next!==null){cursor.current=null;setPrevious([]);setAnnouncement('The saved conversation changed. Showing its first page.');await readHistory(null);}else setError(result.error.message);return;}
   cursor.current=next;setHistory(result.value);const saved=new Set(result.value.items.map(item=>item.messageId));for(const key of liveMessages.current.keys())if(saved.has(key))liveMessages.current.delete(key);setLive([...liveMessages.current.values()]);
  }
  function refresh():Promise<void>{
   if(syncing){syncAgain=true;return syncing;}
   syncing=(async()=>{try{const result=await bridge.reconcilePrd({contractVersion:1,requestId:requestId(),command:'ReconcilePrd',prdId});if(!active)return;if(result.ok){apply(result.value);await readHistory(null);setPrevious([]);}else setError(result.error.message);}catch{if(active)setError(M.INTERNAL);}finally{syncing=null;if(syncAgain&&active){syncAgain=false;void refresh();}}})();return syncing;
  }
  function receive(event:C.PrdEvent){
   if(!active||event.subscriptionId!==subscriptionId||event.prdId!==prdId)return;
   if(opening){const bytes=new TextEncoder().encode(JSON.stringify(event)).length;if(buffered.length>=L.eventQueueItems||bufferedBytes+bytes>L.eventQueueBytes){overflow=true;buffered=[];bufferedBytes=0;}else if(!overflow){buffered.push(event);bufferedBytes+=bytes;}return;}
   sequence=Math.max(sequence,latest.current.sequence);
   if(event.type==='extensionUi'){
    const op=latest.current.operation,s=latest.current.prd.session;
    if(!op||op.requestId!==event.requestId||op.operationId!==event.operationId||op.generationId!==event.generationId||s.state==='notAllocated'||s.sessionId!==event.sessionId){if(event.sequence>sequence){sequence=event.sequence;void refresh();}return;}
    // Snapshot sequence can include startup UI updates without carrying their transient values.
    if(event.sequence>lastUiSequence){lastUiSequence=event.sequence;const update=event.update;
     if(update.kind==='notice')setNotices(old=>{const next=[...old,{sequence:event.sequence,level:update.level,text:update.text}];while(next.length>L.uiOptions||encoder.encode(JSON.stringify(next)).length>L.eventQueueBytes)next.shift();return next;});
     else{const key=update.kind+(('key'in update)?':'+update.key:''),label=(update.kind==='status'?'Status':update.kind==='widget'?'Widget':update.kind==='working'?'Working':update.kind==='thinking'?'Thinking':'Title')+(('key'in update)?' · '+update.key:'');setActivity(old=>{const next=old.filter(item=>item.key!==key);if(update.text!==null&&update.text!=='')next.push({key,label,text:update.text});while(next.length>L.uiOptions||encoder.encode(JSON.stringify(next)).length>L.eventQueueBytes)next.shift();return next;});}
    }
    const gap=event.sequence>sequence+1;sequence=Math.max(sequence,event.sequence);if(gap)void refresh();return;
   }
   if(event.sequence<=sequence)return;
   if(event.type==='snapshot'){const gap=event.sequence!==sequence+1;apply(event.snapshot);if(gap)void refresh();return;}
   if(event.sequence!==sequence+1||event.type==='resyncRequired'){sequence=event.sequence;void refresh();return;}sequence=event.sequence;
   if(event.type==='error'){setError(event.error.message);return;}
   if(event.type==='historyPersisted'){void readHistory(null);setPrevious([]);return;}
   if(event.type==='uiQuestion'||event.type==='uiQuestionDismissed'||event.type==='documentChanged'||event.type==='operation'){void refresh();return;}
   if(event.type==='writerMessage'||event.type==='textDelta'||event.type==='textFinalized'){
    const op=latest.current.operation,session=latest.current.prd.session;
    if(!op||op.requestId!==event.requestId||op.operationId!==event.operationId||op.generationId!==event.generationId||session.state==='notAllocated'||session.sessionId!==event.sessionId){void refresh();return;}
    const old=liveMessages.current.get(event.messageId),raw=event.type==='textDelta'?(old?.text??'')+event.delta:event.text;
    if(event.type==='textDelta'&&old?.truncated)return;
    let value=raw,size=encoder.encode(raw).length;if(size>L.historyTextBytes){value='';size=0;for(const character of raw){const n=encoder.encode(character).length;if(size+n>L.historyTextBytes)break;value+=character;size+=n;}}
    const next=new Map(liveMessages.current);if(event.type==='writerMessage')for(const[key,item]of next)if(item.role==='writer'&&key!==event.messageId)next.delete(key);
    next.set(event.messageId,{messageId:event.messageId,role:event.type==='writerMessage'?'writer':'assistant',text:value,bytes:size,truncated:value!==raw||(event.type!=='textDelta'&&event.textStatus==='truncated')});
    // Reserve one bounded slot for the current writer even when older live replies fill the view.
    const total=[...next.values()].reduce((sum,item)=>sum+item.bytes,0),writer=event.type==='writerMessage';if(next.size>L.eventQueueItems-(writer?0:1)||total>L.eventQueueBytes-(writer?0:L.deltaBytes)){setAnnouncement('Refreshing the saved conversation after a large response.');void refresh();return;}
    liveMessages.current=next;setLive([...next.values()]);if(event.type==='writerMessage')setAnnouncement('Your message was submitted to Pi.');else if(event.type==='textFinalized')setAnnouncement('Pi sent a message.');
   }
  }
  const detach=bridge.onEvent(receive);controller.current={refresh,history:readHistory};
  void(async()=>{try{
   const result=await bridge.openPrd({contractVersion:1,requestId:requestId(),command:'OpenPrd',prdId,subscriptionId});if(!active)return;
   if(!result.ok){setError(result.error.message);return;}apply(result.value.snapshot);opening=false;for(const event of buffered)receive(event);buffered=[];bufferedBytes=0;if(overflow)await refresh();else await readHistory(null);
  }catch{if(active)setError(M.INTERNAL);}finally{if(active){opening=false;setLoading(false);}}})();
  const focus=()=>{void refresh();};window.addEventListener('focus',focus);
  return ()=>{active=false;mounted.current=false;controller.current=null;detach();window.removeEventListener('focus',focus);void bridge.detachSubscription({contractVersion:1,subscriptionId});liveMessages.current.clear();};
 },[bridge,snapshot.prd.prdId]);
 const operation=current.operation,working=operation!==null&&operation.phase!=='finished',session=current.prd.session;
 const conversationBlocked=current.prd.workspaceState!=='ready'||current.prd.document.state==='missing'||current.prd.document.state==='invalid';
 async function send(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(sending||working||conversationBlocked||!text.trim()||session.state!=='materialized')return;
  if(new TextEncoder().encode(text).length>L.inputBytes){setError('Shorten your message before sending.');return;}
  setSending(true);setError('');try{
   const expected=await callbacks.current.beforeTurn();if(!expected||!mounted.current)return;
   const result=await bridge.sendTurn({contractVersion:1,requestId:requestId(),command:'SendTurn',prdId:current.prd.prdId,sessionId:session.sessionId,text,intent:'conversation',...expected});if(!mounted.current)return;
   if(result.ok){if(result.value.snapshot.sequence>=latest.current.sequence){latest.current=result.value.snapshot;setCurrent(result.value.snapshot);callbacks.current.onSnapshot(result.value.snapshot);}setText('');}else{setError(result.error.message);await controller.current?.refresh();}
  }catch{if(mounted.current)setError(M.INTERNAL);}finally{if(mounted.current)setSending(false);}
 }
 async function answer(answer:C.UiAnswer):Promise<boolean>{
  const value=latest.current,op=value.operation,q=value.pendingQuestion,s=value.prd.session;if(!q||!op?.sessionId||!op.generationId||s.state==='notAllocated')return false;
  try{const result=await bridge.answerUiQuestion({contractVersion:1,requestId:requestId(),command:'AnswerUiQuestion',prdId:value.prd.prdId,sessionId:s.sessionId,operationId:op.operationId,generationId:op.generationId,questionId:q.questionId,expectedVersion:value.prd.version,answer});if(!result.ok){setError(result.error.message);await controller.current?.refresh();}return result.ok;}catch{setError(M.INTERNAL);return false;}
 }
 async function cancel(){if(!operation||operation.phase==='finished')return;setError('');try{const result=await bridge.cancelOperation({contractVersion:1,requestId:requestId(),command:'CancelOperation',prdId:current.prd.prdId,operationId:operation.operationId});if(!result.ok)setError(result.error.message);await controller.current?.refresh();}catch{setError(M.INTERNAL);}}
 return <>
  {activity.length>0&&<aside aria-label="Extension activity"><details className="prd-location extension-activity"><summary>Extension activity</summary><dl>{activity.map(item=><div key={item.key}><dt>{item.label}</dt><dd className="document-path">{item.text}</dd></div>)}</dl></details></aside>}
  {notices.length>0&&<aside className="extension-notices" aria-label="Extension notices">{notices.map(item=><p className="field-help" key={item.sequence} role={item.level==='warning'?'alert':'status'}>{item.level==='warning'?'Extension warning: ':'Extension notice: '}{item.text}</p>)}</aside>}
  <section className="conversation-pane" aria-labelledby="conversation-heading">
  <div className="conversation-title"><h2 id="conversation-heading" tabIndex={-1}>Conversation</h2><button type="button" className="secondary-action" disabled={loading} onClick={()=>{void controller.current?.refresh();}}>Refresh conversation</button></div>
  <p className="conversation-state">{conversationStateText(loading,session,operation,current.draftLocation)}</p>
  {(error||operation?.error)&&<p id={errorId} role="alert">{error||operation?.error?.message}</p>}
  <ol className="conversation-messages" aria-label="Saved conversation" aria-live="off">{history?.items.map(item=><li key={item.entryId}><article className={'message message-'+item.role} aria-label={item.role==='writer'?'Your message':item.role==='assistant'?'Pi message':'Extension message'}><h3>{item.role==='writer'?'You':item.role==='assistant'?'Pi':'Extension'}</h3><div className="message-text">{item.text}</div>{item.textStatus==='truncated'&&<p className="field-help">Some text is not shown in this view.</p>}</article></li>)}</ol>
  {live.length>0&&<div aria-label="Live conversation" aria-live="off">{live.filter(item=>!history?.items.some(saved=>saved.messageId===item.messageId)).map(item=><article className={'message message-'+item.role} aria-label={item.role==='writer'?'Your message':'Pi message'} key={item.messageId}><h3>{item.role==='writer'?'You':'Pi'}</h3><div className="message-text">{item.text}</div><p className="field-help">{item.role==='writer'?'Submitted to Pi':'Live response'} — not yet verified in the displayed saved page.{item.truncated?' Some text is not shown.':''}</p></article>)}</div>}
  {history&&<div className="history-controls"><button type="button" className="secondary-action" disabled={previous.length===0} onClick={()=>{const next=[...previous],target=next.pop()??null;setPrevious(next);void controller.current?.history(target);}}>Previous messages</button><button type="button" className="secondary-action" disabled={!history.nextCursor} onClick={()=>{if(history.nextCursor){setPrevious(old=>[...old,cursor.current].slice(-L.replayRequests));void controller.current?.history(history.nextCursor);}}}>Next messages</button></div>}
  <form className="conversation-compose" onSubmit={event=>{void send(event);}} aria-busy={sending}>
   <label htmlFor={inputId}>{current.prd.document.state==='available'?'Ask Pi for updates':'Your message'}</label><textarea id={inputId} data-writer-draft="" rows={4} value={text} onChange={event=>setText(event.target.value)} disabled={sending||working||session.state!=='materialized'||conversationBlocked} aria-describedby={(error||operation?.error)?errorId:undefined}/>
   <div className="compose-actions"><button type="submit" disabled={sending||working||!text.trim()||session.state!=='materialized'||conversationBlocked}>Send message</button>{working&&session.state!=='notAllocated'&&<button type="button" className="secondary-action" onClick={()=>{void cancel();}}>Cancel turn</button>}</div>
  </form>
  <p className="announcement" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
  {current.pendingQuestion&&<PrdQuestionDialog key={current.pendingQuestion.questionId} question={current.pendingQuestion} onAnswer={answer}/>}
 </section></>;
}
