import { useEffect, useRef, useState } from 'react';
import RepositorySetup from './RepositorySetup';
import NewPrdForm from './NewPrdForm';
import YourPrds from './YourPrds';
import ConversationPane from './ConversationPane';
import PrdWorkbench from './PrdWorkbench';
import PrdDraftView from './PrdDraftView';
import type {TurnPreconditions} from './ConversationPane';
import type {PrdBridge,PrdSnapshot,PrdSummary,DefaultRepositoryView,RequestId,PrdId,Cursor,DocumentBody,DraftCandidatesPage,ConventionId,CandidateId,DocumentRevision} from '../shared/prd-contracts';
import {PRD_ERROR_MESSAGES} from '../shared/prd-contracts';
import type { BootstrapResult, BootstrapSnapshot, PiSdkCheck, SqliteCheck } from '../shared/bootstrap-contracts';
import { parseResult, safeError } from '../shared/bootstrap-validation';

const POLL_MS = 250;
const READ_BUDGET_MS = 20_000;
const STATE_TEXT = Object.freeze({
  starting: 'Starting: checking the temporary database and packaged Pi SDK.',
  ready: 'Ready: the bootstrap database and packaged Pi SDK checks passed.',
  failed: 'Failed: a bootstrap check could not finish. Conversations are not enabled.',
  stopping: 'Stopping: the bootstrap checks are shutting down.',
});
function checkText(check: SqliteCheck | PiSdkCheck | undefined, kind: 'sqlite' | 'piSdk'): string {
  if (!check || check.status === 'pending') return 'Pending: waiting for the startup check.';
  if (check.status === 'failed') return `Failed: ${check.error.message}`;
  if (kind === 'sqlite' && 'driverVersion' in check)
    return `Passed: SQLite driver ${check.driverVersion}; temporary database close and reopen verified.`;
  if (kind === 'piSdk' && 'sdkVersion' in check)
    return `Passed: Pi SDK ${check.sdkVersion}; import and packaged assets verified. Configured brainstorming was not checked.`;
  return safeError('INTERNAL').message;
}

export default function App() {
  const [diagnosticFixture, setDiagnosticFixture] = useState(() => document.documentElement.dataset.bootstrapFixture === 'true');
  useEffect(() => {
    const update = () => setDiagnosticFixture(document.documentElement.dataset.bootstrapFixture === 'true');
    document.addEventListener('gabprd-bootstrap-fixture', update);
    update();
    return () => document.removeEventListener('gabprd-bootstrap-fixture', update);
  }, []);
  return diagnosticFixture ? <BootstrapDiagnostics /> : <PrdWorkspace />;
}

function PrdWorkspace() {
  const bridge = (window.gabPrd as typeof window.gabPrd & {readonly prds?:PrdBridge}).prds;
  const [view,setView]=useState<'new'|'list'|'document'>('new');
  const [settings,setSettings]=useState<DefaultRepositoryView|null>(null);
  const [items,setItems]=useState<readonly PrdSummary[]>([]);
  const [cursor,setCursor]=useState<Cursor|null>(null),[loaded,setLoaded]=useState(false),[writable,setWritable]=useState(false);
  const [candidates,setCandidates]=useState<DraftCandidatesPage|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [snapshot,setSnapshot]=useState<PrdSnapshot|null>(null),[document,setDocument]=useState<DocumentBody|null>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  const requestId=()=>crypto.randomUUID() as RequestId;
  const available=!!bridge&&!!settings&&writable;
  const expectedDocument=snapshot?.prd.document;
  const verifiedDocument=expectedDocument?.state==='available'&&document?.documentId===expectedDocument.documentId&&document.revision===expectedDocument.revision&&document.relativePath===expectedDocument.relativePath?document:null;
  function applySnapshot(value:PrdSnapshot){setSnapshot(previous=>!previous||previous.prd.prdId!==value.prd.prdId||value.sequence>=previous.sequence?value:previous);}

  useEffect(()=>{
    let active=true;
    if(bridge)void bridge.listPrds({contractVersion:1,requestId:requestId(),command:'ListPrds',cursor:null}).then(result=>{
      if(!active)return;
      if(result.ok){setSettings(result.value.defaultRepository);setItems(result.value.items);setCursor(result.value.nextCursor);setLoaded(true);setWritable(result.value.store.state==='ready');if(result.value.store.state!=='ready')setError(PRD_ERROR_MESSAGES.STORE_READ_ONLY);}
      else setError(result.error.message);
    }).catch(()=>{if(active)setError(PRD_ERROR_MESSAGES.INTERNAL);});
    return ()=>{active=false;};
  },[bridge]);

  function protectWriterInput(){
    if(window.document.querySelector('dialog[open]')){setNotice('Answer or cancel the open question before leaving this screen.');return true;}
    if([...window.document.querySelectorAll<HTMLTextAreaElement>('textarea[data-writer-draft]')].some(input=>input.value.length>0)){
      setNotice('You have text that has not been submitted. Submit or clear it before leaving this screen.');return true;
    }
    return false;
  }
  useEffect(()=>bridge?.onCloseRequested(request=>{const draft=protectWriterInput();if(busy&&!draft)setNotice('An action is still finishing. Try closing again after it finishes.');void bridge.acknowledgeClose({...request,decision:busy||draft?'blocked':'ready'});}),[bridge,busy]);

  useEffect(()=>{
    let active=true;if(!bridge||!snapshot)return;
    if(snapshot.prd.document.state!=='available'){setDocument(null);return;}
    const expected=snapshot.prd.document;
    void bridge.readDocument({contractVersion:1,requestId:requestId(),command:'ReadDocument',prdId:snapshot.prd.prdId,documentId:expected.documentId}).then(result=>{if(!active)return;if(result.ok)setDocument(result.value);else setError(result.error.message);}).catch(()=>{if(active)setError(PRD_ERROR_MESSAGES.INTERNAL);});
    return ()=>{active=false;};
  },[bridge,snapshot?.prd.prdId,snapshot?.prd.document.state,snapshot?.prd.document.state==='available'?snapshot.prd.document.revision:null]);
  useEffect(()=>{
    let active=true;setCandidates(null);if(!bridge||!snapshot||snapshot.prd.document.state!=='notRegistered'||snapshot.prd.workspaceState!=='ready'||snapshot.draftLocation.state!=='resolved'||snapshot.prd.session.state==='notAllocated'||snapshot.operation?.phase!=='finished')return;
    void bridge.listDraftCandidates({contractVersion:1,requestId:requestId(),command:'ListDraftCandidates',prdId:snapshot.prd.prdId,cursor:null}).then(result=>{if(!active)return;if(result.ok)setCandidates(result.value);else setError(result.error.message);}).catch(()=>{if(active)setError(PRD_ERROR_MESSAGES.INTERNAL);});
    return ()=>{active=false;};
  },[bridge,snapshot?.prd.prdId,snapshot?.prd.document.state,snapshot?.draftLocation.state,snapshot?.prd.session.state,snapshot?.operation?.operationId,snapshot?.operation?.phase]);
  async function beforeTurn():Promise<TurnPreconditions|null>{
    if(!bridge||!snapshot)return null;const result=await bridge.reconcilePrd({contractVersion:1,requestId:requestId(),command:'ReconcilePrd',prdId:snapshot.prd.prdId});if(!result.ok){setError(result.error.message);return null;}applySnapshot(result.value);const document=result.value.prd.document;if(document.state==='missing'||document.state==='invalid'){setError(PRD_ERROR_MESSAGES.PATH_INVALID);return null;}return {expectedVersion:result.value.prd.version,expectedDocumentRevision:document.state==='available'?document.revision:null};
  }
  async function chooseLocation(conventionId:ConventionId){
    if(!bridge||!snapshot||busy)return;setBusy(true);setError('');try{const result=await bridge.selectDraft({contractVersion:1,requestId:requestId(),command:'SelectDraft',prdId:snapshot.prd.prdId,expectedVersion:snapshot.prd.version,selection:'convention',conventionId,expectedDocumentRevision:null});if(result.ok){applySnapshot(result.value.snapshot);setNotice('Starting your configured brainstorm conversation…');}else setError(result.error.message);}catch{setError(PRD_ERROR_MESSAGES.INTERNAL);}finally{setBusy(false);}
  }
  async function chooseCandidate(candidateId:CandidateId,revision:DocumentRevision){
    if(!bridge||!snapshot||!candidates||busy)return;setBusy(true);setError('');try{const result=await bridge.selectDraft({contractVersion:1,requestId:requestId(),command:'SelectDraft',prdId:snapshot.prd.prdId,expectedVersion:candidates.version,selection:'candidate',candidateId,expectedDocumentRevision:revision});if(result.ok){applySnapshot(result.value.snapshot);setDocument(result.value.document);setCandidates(null);setNotice('Draft selected. It has not been published.');}else setError(result.error.message);}catch{setError(PRD_ERROR_MESSAGES.INTERNAL);}finally{setBusy(false);}
  }
  async function retrySetup(){
    if(!bridge||!snapshot?.operation||busy)return;setBusy(true);setError('');try{const result=await bridge.retryWorkspaceSetup({contractVersion:1,requestId:requestId(),command:'RetryWorkspaceSetup',prdId:snapshot.prd.prdId,setupOperationId:snapshot.operation.operationId,expectedVersion:snapshot.prd.version});if(result.ok)applySnapshot(result.value.snapshot);else setError(result.error.message);}catch{setError(PRD_ERROR_MESSAGES.INTERNAL);}finally{setBusy(false);}
  }
  function plannedFilename(value:PrdSnapshot){const slug=value.prd.displayName.normalize('NFC').trim().toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-+|-+$/g,'');return value.prd.creationDate+'-'+slug+'.md';}

  useEffect(()=>{if(snapshot?.prd.document.state==='available')setNotice('Draft available. It has not been published.');else if(snapshot&&snapshot.prd.session.state!=='notAllocated')setNotice('');},[snapshot?.prd.document.state,snapshot?.prd.session.state]);

  function navigate(next:typeof view){if(protectWriterInput()||busy)return;setView(next);setError('');setNotice('');requestAnimationFrame(()=>heading.current?.focus());}
  async function chooseRepository(){
    if(!bridge||!settings||busy)return;setBusy(true);setError('');
    try{
      const picked=await bridge.nativePickRepository({contractVersion:1,requestId:requestId(),command:'NativePickRepository'});
      if(!picked.ok){setError(picked.error.message);return;}
      if(picked.value.outcome==='cancelled')return;
      const saved=await bridge.setDefaultRepository({contractVersion:1,requestId:requestId(),command:'SetDefaultRepository',repositoryId:picked.value.repository.repositoryId,expectedVersion:settings.version});
      if(saved.ok){setSettings(saved.value);setNotice('Repository selected. You can start a new PRD.');}else setError(saved.error.message);
    }catch{setError(PRD_ERROR_MESSAGES.INTERNAL);}finally{setBusy(false);}
  }
  async function create(idea:string):Promise<boolean>{
    if(!bridge||!settings?.repository||busy)return false;setBusy(true);setError('');setNotice('Preparing an isolated workspace for your PRD…');
    try{
      const result=await bridge.createPrd({contractVersion:1,requestId:requestId(),command:'CreatePrd',repositoryId:settings.repository.repositoryId,idea});
      if(!result.ok){setError(result.error.message);setNotice('');return false;}
      applySnapshot(result.value.snapshot);setDocument(null);setView('document');setNotice('Preparing your PRD workspace…');requestAnimationFrame(()=>heading.current?.focus());return true;
    }catch{setError(PRD_ERROR_MESSAGES.INTERNAL);setNotice('');return false;}finally{setBusy(false);}
  }
  async function more(){
    if(!bridge||!cursor||busy)return;setBusy(true);setError('');
    try{const result=await bridge.listPrds({contractVersion:1,requestId:requestId(),command:'ListPrds',cursor});if(result.ok){setItems(current=>[...current,...result.value.items.filter(item=>!current.some(previous=>previous.prdId===item.prdId))]);setCursor(result.value.nextCursor);}else setError(result.error.message);}catch{setError(PRD_ERROR_MESSAGES.INTERNAL);}finally{setBusy(false);}
  }
  async function refreshList(){
    if(!bridge||busy)return;setBusy(true);setError('');
    try{const result=await bridge.listPrds({contractVersion:1,requestId:requestId(),command:'ListPrds',cursor:null});if(result.ok){setItems(result.value.items);setCursor(result.value.nextCursor);setSettings(result.value.defaultRepository);setLoaded(true);setWritable(result.value.store.state==='ready');}else setError(result.error.message);}catch{setError(PRD_ERROR_MESSAGES.INTERNAL);}finally{setBusy(false);}
  }
  async function open(prdId:PrdId){
    if(!bridge||busy||protectWriterInput())return;setBusy(true);setError('');setDocument(null);
    try{
      // Reconcile is a read of retained work, never an automatic replay of a prompt.
      const result=await bridge.reconcilePrd({contractVersion:1,requestId:requestId(),command:'ReconcilePrd',prdId});
      if(!result.ok){setError(result.error.message);return;}
      applySnapshot(result.value);setView('document');
      requestAnimationFrame(()=>heading.current?.focus());
    }catch{setError(PRD_ERROR_MESSAGES.INTERNAL);}finally{setBusy(false);}
  }
  const canRetrySetup=!!snapshot&&snapshot.operation?.phase==='finished'&&
    (snapshot.operation.kind==='create'||snapshot.operation.kind==='workspaceRetry'||snapshot.operation.kind==='brainstorm'&&snapshot.prd.session.state==='allocated')&&
    (snapshot.prd.session.state==='notAllocated'||snapshot.prd.session.state==='allocated')&&
    (snapshot.operation.outcome==='failed'||snapshot.operation.outcome==='interrupted'||snapshot.operation.outcome==='cancelled');
  const setupStopped=canRetrySetup&&snapshot?.draftLocation.state==='unresolved';
  return <div className={'workspace-shell workspace-view-'+view}>
    <header className="workspace-sidebar" aria-label="Workspace navigation">
      <div className="workspace-brand"><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 28"><path d="M4 2h10l6 6v18H4zM14 2v7h6M8 14h8M8 19h8"/></svg></span><span>PRD Creator</span></div>
      <nav aria-label="PRD workspace">
        <button type="button" className={view==='new'?'nav-item current':'nav-item'} aria-current={view==='new'?'page':undefined} onClick={()=>navigate('new')}>New PRD</button>
        <button type="button" className={view==='list'?'nav-item current':'nav-item'} aria-current={view==='list'?'page':undefined} onClick={()=>{navigate('list');void refreshList();}}>Your PRDs</button>
      </nav>
      {items.length>0&&<div className="sidebar-recents"><h2>YOUR PRDS</h2>{items.slice(0,5).map(item=><button type="button" className="recent-prd" key={item.prdId} onClick={()=>{void open(item.prdId);}}>{item.displayName}</button>)}</div>}
      <p className="sidebar-footer">Publishing is not available in this version.</p>
    </header>
    <main className="prd-workspace" aria-labelledby="workspace-heading">
      {view!=='new'&&<header className="workspace-header"><div><h1 id="workspace-heading" ref={heading} tabIndex={-1}>{view==='list'?'Your PRDs':verifiedDocument?snapshot?.prd.displayName:'Brainstorm'}</h1></div><span className="workspace-tag">{view==='document'?(verifiedDocument?'PRD review':'Brainstorm'):'Local workspace'}</span></header>}
      {error&&<p className="workspace-error" role="alert">{error}</p>}
      <p className="workspace-notice" role="status" aria-live="polite" aria-atomic="true">{setupStopped?'Workspace setup stopped. Review the error and retry setup.':view==='document'&&snapshot?.workspaceLocation&&snapshot.draftLocation.state==='unresolved'&&snapshot.draftLocation.choices.length>0&&!canRetrySetup?'Workspace ready. Choose a document location to start brainstorming.':notice}</p>
      {view==='new'&&<div className="creation-layout"><NewPrdForm enabled={available&&!!settings?.repository} busy={busy} onCreate={create} headingRef={heading} repository={<RepositorySetup repository={settings?.repository??null} busy={busy} available={available} onChoose={()=>{void chooseRepository();}}/>}/></div>}
      {view==='list'&&<YourPrds items={items} busy={busy} loaded={loaded} hasMore={cursor!==null} onMore={()=>{void more();}} onOpen={id=>{void open(id);}}/>}
      {view==='document'&&snapshot&&<>
        <section className="active-workspace-location" aria-label="PRD workspace location"><h2>PRD workspace</h2>{snapshot.workspaceLocation?<dl><div><dt>Working folder</dt><dd className="document-path">{snapshot.workspaceLocation.worktreePath}</dd></div><div><dt>Branch</dt><dd className="document-path">{snapshot.workspaceLocation.branchName}</dd></div></dl>:<p>{canRetrySetup||snapshot.prd.workspaceState==='recoveryRequired'?'Workspace location is not available.':'Preparing the PRD workspace…'}</p>}</section>
        <details className="prd-location" open={snapshot.draftLocation.state==='unresolved'||canRetrySetup}><summary>{snapshot.draftLocation.state==='resolved'?'Document location':'Prepare the PRD workspace'}</summary>{snapshot.draftLocation.state==='resolved'?<p className="document-path">{snapshot.draftLocation.relativePath}</p>:snapshot.draftLocation.choices.length?<><p>Choose where to create this document. Pi will start after you confirm its location.</p><ul className="location-choices">{snapshot.draftLocation.choices.map(choice=><li key={choice.conventionId}><p className="document-path">{choice.relativeFolder+'/'+plannedFilename(snapshot)}</p><button type="button" disabled={busy||snapshot.operation?.phase==='finished'} onClick={()=>{void chooseLocation(choice.conventionId);}}>Use {choice.relativeFolder}</button></li>)}</ul></>:<p>{setupStopped?'A document location is not available because workspace setup stopped.':'Preparing your isolated workspace and checking document locations…'}</p>}<button type="button" className="secondary-action" disabled={busy} onClick={()=>{void open(snapshot.prd.prdId);}}>Refresh PRD</button>{canRetrySetup&&<button type="button" disabled={busy} onClick={()=>{void retrySetup();}}>Retry workspace setup</button>}</details>
        {candidates&&<>{candidates.coverage==='scanLimit'&&<p role="status">The scan is incomplete. No draft will be chosen automatically.</p>}{candidates.items.length>0&&<section aria-label="Choose the generated PRD"><h2>Choose your draft</h2><ul className="candidate-choices">{candidates.items.map(candidate=><li key={candidate.candidateId}><p className="document-path">{candidate.relativePath}</p><pre className="candidate-preview">{candidate.previewText}</pre><button type="button" disabled={busy} onClick={()=>{void chooseCandidate(candidate.candidateId,candidate.revision);}}>Open this draft</button></li>)}</ul></section>}</>}
        <PrdWorkbench key={snapshot.prd.prdId} hasVerifiedDraft={verifiedDocument!==null} documentNeedsAttention={snapshot.prd.document.state!=='notRegistered'} conversation={bridge&&<ConversationPane bridge={bridge} snapshot={snapshot} onSnapshot={applySnapshot} beforeTurn={beforeTurn}/>} document={<section aria-labelledby="draft-heading"><h2 id="draft-heading">Your PRD</h2>{verifiedDocument?<><p className="field-help">Saved document · not published</p><PrdDraftView text={verifiedDocument.text}/></>:snapshot.prd.document.state==='missing'||snapshot.prd.document.state==='invalid'?<p role="alert">The saved document could not be verified. Its existing association has been kept.</p>:<p role="status">Reading and verifying the PRD…</p>}</section>}/>
      </>}
    </main>
  </div>;
}

function BootstrapDiagnostics() {
  const [result, setResult] = useState<BootstrapResult>();
  const [announcement, setAnnouncement] = useState('');
  const refresh = useRef<() => void>(() => {});
  const lastAnnouncement = useRef('');

  useEffect(() => {
    let mounted = true;
    let generation = 0;
    let poll: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const clearTimers = () => {
      if (poll !== undefined) clearTimeout(poll);
      if (deadline !== undefined) clearTimeout(deadline);
      poll = undefined;
      deadline = undefined;
    };
    const announce = (text: string) => {
      if (lastAnnouncement.current === text) return;
      lastAnnouncement.current = text;
      setAnnouncement(text);
    };
    const startRead = () => {
      clearTimers();
      const current = ++generation;
      const unavailable = () => {
        if (!mounted || current !== generation) return;
        ++generation; // Ignore late resolutions, including a hung bridge call.
        clearTimers();
        const error = safeError('INTERNAL');
        setResult({ ok: false, error });
        announce(error.message);
      };
      deadline = setTimeout(unavailable, READ_BUDGET_MS);
      const read = async (): Promise<void> => {
        let parsed: BootstrapResult | undefined;
        try {
          const value: unknown = await window.gabPrd.bootstrap.getStatus();
          parsed = parseResult(value);
        } catch { /* Do not display or stringify transport errors. */ }
        if (!mounted || current !== generation) return;
        if (!parsed) { unavailable(); return; }
        setResult(parsed);
        if (parsed.ok && parsed.snapshot.state === 'starting') {
          poll = setTimeout(() => { void read(); }, POLL_MS);
        } else {
          clearTimers();
          announce(parsed.ok ? STATE_TEXT[parsed.snapshot.state] : parsed.error.message);
        }
      };
      void read();
    };
    refresh.current = startRead;
    startRead();
    return () => {
      mounted = false;
      ++generation;
      clearTimers();
      refresh.current = () => {};
    };
  }, []);

  const snapshot: BootstrapSnapshot | undefined = result?.ok ? result.snapshot : undefined;
  const statusText = result && !result.ok ? result.error.message : STATE_TEXT[snapshot?.state ?? 'starting'];
  return (
    <main aria-labelledby="bootstrap-heading">
      <h1 id="bootstrap-heading">PRD Creator — Bootstrap</h1>
      <p>Conversations, documents and publishing are not implemented yet.</p>
      <p>This build checks only a temporary SQLite database and the packaged Pi SDK. It does not check your configured brainstorm skill or start a conversation.</p>
      <section aria-labelledby="status-heading">
        <h2 id="status-heading">Startup status</h2>
        <p>{statusText}</p>
        <ul aria-label="Runtime checks">
          <li>
            <h3>SQLite database</h3>
            <p>{checkText(snapshot?.sqlite, 'sqlite')}</p>
          </li>
          <li>
            <h3>Pi SDK</h3>
            <p>{checkText(snapshot?.piSdk, 'piSdk')}</p>
          </li>
        </ul>
        <button type="button" onClick={() => refresh.current()}>Refresh status</button>
        <p className="hint">Refresh reads the current status only; it does not run the checks again.</p>
      </section>
      <p className="announcement" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
    </main>
  );
}
