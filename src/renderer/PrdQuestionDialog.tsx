import {useEffect,useId,useRef,useState} from 'react';
import type {UiQuestion,UiAnswer,OptionId} from '../shared/prd-contracts';
import {PRD_LIMITS} from '../shared/prd-contracts';
export default function PrdQuestionDialog({question,onAnswer}:{question:UiQuestion;onAnswer:(answer:UiAnswer)=>Promise<boolean>}){
 const dialog=useRef<HTMLDialogElement>(null),titleId=useId(),inputId=useId(),errorId=useId();
 const [text,setText]=useState(question.kind==='editor'?question.prefill:''),[option,setOption]=useState(''),[sending,setSending]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const previous=document.activeElement,element=dialog.current;if(element&&!element.open)element.showModal();return ()=>{if(element?.open)element.close();if(previous instanceof HTMLElement&&previous.isConnected&&previous!==document.body&&!previous.hasAttribute('disabled'))previous.focus({preventScroll:true});else document.getElementById('conversation-heading')?.focus({preventScroll:true});};},[]);
 async function answer(value:UiAnswer){if(sending)return;setError('');if((value.kind==='input'||value.kind==='editor')&&new TextEncoder().encode(value.text).length>PRD_LIMITS.uiTextBytes){setError('Shorten your answer before sending.');return;}setSending(true);try{if(!await onAnswer(value)){setError('Your answer could not be sent. Refresh this PRD and try again.');setSending(false);}}catch{setError('Your answer could not be sent.');setSending(false);}}
 return <dialog ref={dialog} className="prd-question" aria-labelledby={titleId} aria-describedby={error?errorId:undefined} onCancel={event=>{event.preventDefault();void answer({kind:'cancel'});}}>
  <h2 id={titleId}>{question.title}</h2>{sending&&<p role="status">Sending your answer…</p>}
  <form onSubmit={event=>{event.preventDefault();if(question.kind==='select'&&option)void answer({kind:'select',optionId:option as OptionId});if(question.kind==='input'||question.kind==='editor')void answer({kind:question.kind,text});}} aria-busy={sending}>
   {question.kind==='confirm'?<><p>{question.message}</p><div className="question-actions"><button type="button" disabled={sending} onClick={()=>{void answer({kind:'confirm',confirmed:true});}}>Yes</button><button type="button" disabled={sending} onClick={()=>{void answer({kind:'confirm',confirmed:false});}}>No</button></div></>:question.kind==='select'?<><label htmlFor={inputId}>Your choice</label><select id={inputId} value={option} disabled={sending} required onChange={event=>setOption(event.target.value)}><option value="" disabled>Choose an answer</option>{question.options.map(item=><option key={item.optionId} value={item.optionId}>{item.label}</option>)}</select><button type="submit" disabled={sending||!option}>Send answer</button></>:<><label htmlFor={inputId}>{question.kind==='editor'?'Your text':'Your answer'}</label>{question.kind==='editor'?<textarea id={inputId} rows={9} value={text} disabled={sending} onChange={event=>setText(event.target.value)}/>:<input id={inputId} value={text} disabled={sending} placeholder={question.placeholder??undefined} onChange={event=>setText(event.target.value)}/>}<button type="submit" disabled={sending}>Send answer</button></>}
   {error&&<p id={errorId} role="alert">{error}</p>}
   {question.deadline&&<p className="field-help">This question expires at <time dateTime={question.deadline}>{new Date(question.deadline).toLocaleTimeString()}</time>.</p>}
   <button type="button" className="secondary-action" disabled={sending} onClick={()=>{void answer({kind:'cancel'});}}>Cancel question</button>
  </form>
 </dialog>;
}
