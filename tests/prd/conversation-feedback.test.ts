import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrdDialogs} from '../../src/pi-utility/prd-dialogs';
import {conversationStateText} from '../../src/renderer/ConversationPane';
import {parsePrdEvent,parsePiEvent} from '../../src/shared/prd-validation';
import type * as C from '../../src/shared/prd-contracts';
const id='00000000-0000-4000-8000-000000000001';
const correlation={requestId:id,prdId:id,operationId:id,generationId:id} as C.PiCorrelation;
const context={contractVersion:1,...correlation,subscriptionId:id,sessionId:id,sequence:1,version:id};
const operation:C.OperationView={operationId:id as C.OperationId,requestId:id as C.RequestId,prdId:id as C.PrdId,sessionId:null,generationId:id as C.GenerationId,kind:'create',phase:'running',outcome:null,error:null};
const location:C.PrdSnapshot['draftLocation']={state:'unresolved',choices:[{conventionId:id as C.ConventionId,relativeFolder:'docs/design'}]};
function dialogs(){const events:C.PrdEventBody[]=[],stops:C.PrdErrorCode[]=[];const value=createPrdDialogs(e=>events.push(e),code=>stops.push(code));assert.ok(value.ok);return {events,stops,ui:value.value.ui};}

test('extension status clear is a structured removal, never a Pi chat message',()=>{
 const c=dialogs();c.ui.setStatus('gabprd-sprint','Working');c.ui.setStatus('gabprd-sprint',undefined);c.ui.setStatus('sprint-continuity',undefined);
 assert.deepEqual(c.events,[{type:'extensionUi',update:{kind:'status',key:'gabprd-sprint',text:'Working'}},{type:'extensionUi',update:{kind:'status',key:'gabprd-sprint',text:null}},{type:'extensionUi',update:{kind:'status',key:'sprint-continuity',text:null}}]);assert.deepEqual(c.stops,[]);
});
test('extension working/thinking/title/widget presentation is separate and resettable',()=>{
 const c=dialogs();c.ui.setWorkingMessage('Checking');c.ui.setWorkingMessage(undefined);c.ui.setHiddenThinkingLabel('Reasoning');c.ui.setHiddenThinkingLabel(undefined);c.ui.setTitle('A title');c.ui.setWidget('outline',['One','Two']);c.ui.setWidget('outline',undefined);
 assert.deepEqual(c.events,[{type:'extensionUi',update:{kind:'working',text:'Checking'}},{type:'extensionUi',update:{kind:'working',text:null}},{type:'extensionUi',update:{kind:'thinking',text:'Reasoning'}},{type:'extensionUi',update:{kind:'thinking',text:null}},{type:'extensionUi',update:{kind:'title',text:'A title'}},{type:'extensionUi',update:{kind:'widget',key:'outline',text:'One\nTwo'}},{type:'extensionUi',update:{kind:'widget',key:'outline',text:null}}]);
});
test('extension informational and warning notices identify extension provenance',()=>{
 const c=dialogs();c.ui.notify('Notice');c.ui.notify('Warning','warning');assert.deepEqual(c.events,[{type:'extensionUi',update:{kind:'notice',level:'info',text:'Notice'}},{type:'extensionUi',update:{kind:'notice',level:'warning',text:'Warning'}}]);
});
test('unsupported extension UI and invalid status values still fail safely',()=>{
 const c=dialogs();assert.throws(()=>c.ui.notify('Error','error'));assert.throws(()=>c.ui.setStatus('x','\0'));assert.throws(()=>c.ui.setWidget('x',()=>null as never));assert.ok(c.stops.every(code=>code==='CONFIG_INCOMPATIBLE'));
});
test('extension presentation has exact correlated public and private transport schemas',()=>{
 const body={type:'extensionUi',update:{kind:'status',key:'gabprd-sprint',text:null}};
 assert.deepEqual(parsePrdEvent({...context,...body}),{...context,...body});const privateEvent={contractVersion:1,...correlation,sequence:1,type:'pi.projection',sessionId:id,event:body};assert.deepEqual(parsePiEvent(privateEvent,correlation),privateEvent);
 for(const change of [{sessionId:null},{requestId:null},{operationId:null},{generationId:null}])assert.equal(parsePrdEvent({...context,...body,...change}),undefined);
 for(const update of [{kind:'status',key:'x',text:null,extra:true},{kind:'status',text:'Missing key'},{kind:'unknown',text:'x'},{kind:'notice',level:'error',text:'x'},{kind:'status',key:'x'.repeat(257),text:'x'},{kind:'status',key:'x',text:'x'.repeat(16*1024+1)}])assert.equal(parsePrdEvent({...context,type:'extensionUi',update}),undefined);
});
test('genuine assistant text is never filtered by a Status or Cleared prefix',()=>{
 const value={...context,type:'textFinalized',messageId:'genuine-assistant',text:'Status gabprd-sprint: Cleared',textStatus:'complete',durability:'unconfirmed'};assert.deepEqual(parsePrdEvent(value),value);
});
test('location confirmation is not Pi working while no session exists',()=>{
 assert.equal(conversationStateText(false,{state:'notAllocated'},operation,location),'Choose the document location to start brainstorming.');
 assert.equal(conversationStateText(false,{state:'notAllocated'},operation,{state:'unresolved',choices:[]}),'Preparing your PRD workspace…');
});
test('real active Pi turns and waiting questions keep correct working labels',()=>{
 const session:C.SessionView={state:'materialized',sessionId:id as C.SessionId,lastPersistedEntryId:null};assert.equal(conversationStateText(false,session,operation,location),'Pi is working…');assert.equal(conversationStateText(false,session,{...operation,phase:'awaitingUiResponse'},location),'Pi is waiting for your answer.');assert.equal(conversationStateText(false,session,null,location),'Ready for your next message.');
});
