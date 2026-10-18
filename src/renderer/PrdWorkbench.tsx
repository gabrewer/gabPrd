import {useState} from 'react';
import type {ReactNode} from 'react';
export interface PrdWorkbenchProps {readonly hasVerifiedDraft:boolean;readonly documentNeedsAttention:boolean;readonly conversation:ReactNode;readonly document:ReactNode}
/** Presentation only. A parent must establish an identity/revision-matched document read. */
export default function PrdWorkbench({hasVerifiedDraft,documentNeedsAttention,conversation,document}:PrdWorkbenchProps){
 const [view,setView]=useState(()=>({review:hasVerifiedDraft||documentNeedsAttention,primary:hasVerifiedDraft||documentNeedsAttention?'document':'conversation',announcement:''}));
 // Adjust before commit: first verified arrival changes emphasis, never DOM ownership or keyboard focus.
 if(hasVerifiedDraft&&!view.review)setView({review:true,primary:'document',announcement:'The PRD is ready to review. The conversation remains available for updates.'});
 const showDocument=view.review||hasVerifiedDraft||documentNeedsAttention;
 return <section className="prd-workbench" aria-label="PRD workbench" data-primary={view.primary} data-stage={view.review?'review':'brainstorm'}>
  <header className="workbench-toolbar"><span className="workbench-phase">{view.review?'PRD review':'Brainstorm'}</span>
   <div className="workbench-view-controls" role="group" aria-label="Workspace emphasis"><button type="button" className="secondary-action" aria-pressed={view.primary==='conversation'} onClick={()=>setView(old=>({...old,primary:'conversation'}))}>Focus conversation</button><button type="button" className="secondary-action" disabled={!showDocument} aria-pressed={view.primary==='document'} onClick={()=>setView(old=>({...old,primary:'document'}))}>Focus PRD</button></div>
  </header>
  <div className={'workbench-panes'+(!showDocument?' conversation-only':'')}>
   <div className="workbench-conversation">{conversation}</div>
   <div className="workbench-document" hidden={!showDocument}>{document}</div>
  </div>
  <p className="workbench-announcement" role="status" aria-live="polite" aria-atomic="true">{view.announcement}</p>
 </section>;
}
