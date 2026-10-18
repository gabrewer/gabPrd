import {useState} from 'react';
import type {ReactNode,Ref} from 'react';
import {PRD_LIMITS} from '../shared/prd-contracts';

export default function NewPrdForm({enabled,busy,onCreate,repository,headingRef}:{
 enabled:boolean;busy:boolean;onCreate:(idea:string)=>Promise<boolean>;repository?:ReactNode;headingRef?:Ref<HTMLHeadingElement>;
}){
 const [idea,setIdea]=useState(''),[error,setError]=useState('');
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();setError('');if(!idea.trim()){setError('Describe your idea to start the brainstorm.');return;}
  if(new TextEncoder().encode(idea).length>PRD_LIMITS.inputBytes){setError('Your idea is too long. Shorten it before continuing.');return;}
  if(await onCreate(idea))setIdea('');
 }
 return <section className="new-prd" aria-labelledby="workspace-heading">
  <div className="new-prd-intro"><p className="new-prd-kicker">NEW PRD</p><h1 id="workspace-heading" ref={headingRef} tabIndex={-1}>What would you like to build?</h1><p>Start with your idea. Work through it with Pi.</p></div>
  <form onSubmit={event=>{void submit(event);}} aria-busy={busy}>
   <label htmlFor="prd-idea" className="visually-hidden">Your idea</label>
   <textarea id="prd-idea" data-writer-draft="" rows={5} value={idea} onChange={event=>setIdea(event.target.value)} disabled={busy} placeholder="Describe your idea…" required />
   {error&&<p role="alert">{error}</p>}
   <div className="new-prd-bottom">{repository}<button type="submit" disabled={!enabled||busy||!idea.trim()}>{busy?'Preparing…':'Continue'}<span aria-hidden="true"> →</span></button></div>
   {!enabled&&<p className="field-help">Choose your repository to continue.</p>}
  </form>
 </section>;
}
