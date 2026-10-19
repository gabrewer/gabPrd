/** Async desktop dialogs. No guessed confirm value or silent terminal no-op. */
import {randomUUID} from 'node:crypto';
import type {ExtensionUIContext,ExtensionUIDialogOptions} from '@earendil-works/pi-coding-agent';
import type {PrdEventBody,PrdErrorCode,QuestionId,UiAnswer,UiQuestion,IsoInstant,OptionId} from '../shared/prd-contracts';
import {PRD_LIMITS as L} from '../shared/prd-contracts';
import type {PortResult} from '../main/prd-ports';
import {storeFailure,requireStore,StoreFault} from '../main/prd-schema';
export interface PrdDialogHost {readonly ui:ExtensionUIContext;answer(questionId:QuestionId,answer:UiAnswer):PortResult<void>;dismiss():void}
interface Pending {question:UiQuestion;finish:(answer:UiAnswer,reason:'answered'|'cancelled'|'expired'|'operationEnded')=>void}
export function createPrdDialogs(emit:(event:PrdEventBody)=>void,stop:(code:PrdErrorCode)=>void):PortResult<PrdDialogHost>{
 const pending=new Map<QuestionId,Pending>();
 function unsupported():never{stop('CONFIG_INCOMPATIBLE');throw new StoreFault('CONFIG_INCOMPATIBLE');}
 function text(value:unknown,max=L.uiTextBytes):string{if(typeof value!=='string'||value.includes('\0')||Buffer.byteLength(value)>max)unsupported();return value;}
 function publish(body:PrdEventBody):void{if(Buffer.byteLength(JSON.stringify(body))>L.eventBytes-2048)unsupported();emit(body);}
 function ask(question:UiQuestion,opts?:ExtensionUIDialogOptions):Promise<string|boolean|undefined>{
  if(pending.size>0)unsupported();const timeout=opts?.timeout;if(timeout!==undefined&&(!Number.isSafeInteger(timeout)||timeout<0||timeout>2147483647))unsupported();
  return new Promise((resolve,reject)=>{
   let timer:ReturnType<typeof setTimeout>|undefined;let finished=false;
   const abort=()=>finish({kind:'cancel'},'cancelled');
   const finish:Pending['finish']=(answer,reason)=>{
    if(finished)return;finished=true;pending.delete(question.questionId);if(timer!==undefined)clearTimeout(timer);opts?.signal?.removeEventListener('abort',abort);
    try{publish({type:'uiQuestionDismissed',questionId:question.questionId,reason});}catch(error){reject(error);return;}
    if(answer.kind==='cancel'){if(question.kind==='confirm'){stop('INTERRUPTED');reject(new StoreFault('INTERRUPTED'));}else resolve(undefined);return;}
    if(answer.kind==='select'&&question.kind==='select'){resolve(question.options.find(o=>o.optionId===answer.optionId)!.label);return;}if(answer.kind==='confirm'){resolve(answer.confirmed);return;}if(answer.kind==='input'||answer.kind==='editor'){resolve(answer.text);return;}reject(new StoreFault('INVALID_REQUEST'));
   };
   pending.set(question.questionId,{question,finish});opts?.signal?.addEventListener('abort',abort,{once:true});if(timeout!==undefined)timer=setTimeout(()=>finish({kind:'cancel'},'expired'),timeout);
   try{publish({type:'uiQuestion',question});if(opts?.signal?.aborted)abort();}catch(error){pending.delete(question.questionId);if(timer!==undefined)clearTimeout(timer);opts?.signal?.removeEventListener('abort',abort);reject(error);}
  });
 }
 function question(title:string,opts?:ExtensionUIDialogOptions){return {questionId:randomUUID() as QuestionId,title:text(title),deadline:opts?.timeout===undefined?null:new Date(Date.now()+opts.timeout).toISOString() as IsoInstant};}
 const ui:ExtensionUIContext={
  select:async(title,choices,opts)=>{if(!Array.isArray(choices)||choices.length===0||choices.length>L.uiOptions)unsupported();const options=choices.map(label=>({optionId:randomUUID() as OptionId,label:text(label)}));return await ask({...question(title,opts),kind:'select',options},opts) as string|undefined;},
  confirm:async(title,message,opts)=>await ask({...question(title,opts),kind:'confirm',message:text(message)},opts) as boolean,
  input:async(title,placeholder,opts)=>await ask({...question(title,opts),kind:'input',placeholder:placeholder===undefined?null:text(placeholder)},opts) as string|undefined,
  editor:async(title,prefill)=>await ask({...question(title),kind:'editor',prefill:prefill===undefined?'':text(prefill)}) as string|undefined,
  notify:(message,type)=>{if(type==='error')unsupported();publish({type:'extensionUi',update:{kind:'notice',level:type==='warning'?'warning':'info',text:text(message)}});},
  setStatus:(key,value)=>publish({type:'extensionUi',update:{kind:'status',key:text(key,256),text:value===undefined?null:text(value)}}),
  setWorkingMessage:message=>publish({type:'extensionUi',update:{kind:'working',text:message===undefined?null:text(message)}}),
  setHiddenThinkingLabel:label=>publish({type:'extensionUi',update:{kind:'thinking',text:label===undefined?null:text(label)}}),
  setWidget:(key,content)=>{if(typeof content==='function')unsupported();if(content===undefined){publish({type:'extensionUi',update:{kind:'widget',key:text(key,256),text:null}});return;}if(!Array.isArray(content)||content.length>32)unsupported();publish({type:'extensionUi',update:{kind:'widget',key:text(key,256),text:text(content.map(line=>text(line)).join('\n'))}});},
  setTitle:title=>publish({type:'extensionUi',update:{kind:'title',text:text(title)}}),
  // These need terminal/editor/theme state, not a text notification claiming parity.
  onTerminalInput:unsupported,setWorkingVisible:unsupported,setWorkingIndicator:unsupported,setFooter:unsupported,setHeader:unsupported,custom:unsupported,pasteToEditor:unsupported,setEditorText:unsupported,getEditorText:unsupported,addAutocompleteProvider:unsupported,setEditorComponent:unsupported,getEditorComponent:unsupported,
  theme:new Proxy({} as ExtensionUIContext['theme'],{get:unsupported}),getAllThemes:unsupported,getTheme:unsupported,setTheme:unsupported,getToolsExpanded:unsupported,setToolsExpanded:unsupported,
 };
 return {ok:true,value:{ui,answer:(questionId,answer)=>{
  try{const current=pending.get(questionId);requireStore(current,'INVALID_REQUEST');const q=current.question;if(answer.kind!=='cancel'){requireStore(answer.kind===q.kind,'INVALID_REQUEST');if(answer.kind==='select')requireStore(q.kind==='select'&&q.options.some(o=>o.optionId===answer.optionId),'INVALID_REQUEST');if(answer.kind==='input'||answer.kind==='editor')text(answer.text);}current.finish(answer,answer.kind==='cancel'?'cancelled':'answered');return {ok:true,value:undefined};}catch(error){return storeFailure(error instanceof StoreFault?error.code:'INVALID_REQUEST');}
 },dismiss:()=>{for(const current of [...pending.values()])current.finish({kind:'cancel'},'operationEnded');}}};
}
