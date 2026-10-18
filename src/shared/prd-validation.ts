/** Exact, descriptor-only, copied/frozen schemas. No filesystem/IPC/SDK authority here. */
import { PRD_ERROR_MESSAGES as ERRORS, PRD_LIMITS as L } from './prd-contracts';
import type { CloseRequest, CloseResponse, DetachSubscriptionRequest, EditorRecoveryBuffer, PiCorrelation,
  PiUtilityCommand, PiUtilityEvent, PrdEvent, PrdRequest, PrdResult, ProductLaunch } from './prd-contracts';

type Data = Record<string, any>;
type Budget = { nodes: number; bytes: number };
type Schema = (value: unknown, budget: Budget) => any;
const encoder = new TextEncoder();
const invalid = Symbol('invalid-contract');
function requireValid(condition: unknown): asserts condition { if (!condition) throw invalid; }
function descriptors(value: unknown): PropertyDescriptorMap {
  requireValid(value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype);
  const d = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(d)) {
    requireValid(typeof key === 'string');
    const p = d[key];
    requireValid(p && 'value' in p && p.enumerable);
  }
  return d;
}
function object(shape: Record<string, Schema>): Schema {
  const keys = Object.keys(shape);
  return (value, budget) => {
    requireValid(--budget.nodes >= 0);
    const d = descriptors(value);
    requireValid(Reflect.ownKeys(d).length === keys.length);
    const result: Data = {};
    for (const key of keys) {
      requireValid(Object.hasOwn(d, key));
      result[key] = shape[key]!(d[key]!.value, budget);
    }
    return Object.freeze(result);
  };
}
function refine(schema: Schema, check: (value: any) => boolean): Schema {
  return (value, budget) => { const result = schema(value, budget); requireValid(check(result)); return result; };
}
function literal(...values: readonly unknown[]): Schema {
  return value => { requireValid(values.includes(value)); return value; };
}
const nil = literal(null), bool = literal(true, false);
const integer = (max = Number.MAX_SAFE_INTEGER): Schema => value => {
  requireValid(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max); return value;
};
function text(max: number, empty = true): Schema {
  return (value, budget) => {
    requireValid(typeof value === 'string' && value.length <= max && (empty || value.trim().length > 0));
    requireValid(!value.includes('\0') && !/(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/u.test(value));
    const bytes = encoder.encode(value).length;
    requireValid(bytes <= max && (budget.bytes -= bytes) >= 0);
    return value;
  };
}
const uuid = refine(text(36, false), value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value));
const opaque = text(L.identityBytes, false), cursor = text(L.cursorBytes, false);
function nullable(schema: Schema): Schema { return (v,b) => v === null ? null : schema(v,b); }
function array(item: Schema, max: number, uniqueKey?: string): Schema {
  return (value,budget) => {
    requireValid(--budget.nodes >= 0 && Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype);
    const d = Object.getOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap;
    const length = d['length'];
    requireValid(length && 'value' in length && typeof length.value === 'number' && Number.isSafeInteger(length.value) && length.value >= 0 && length.value <= max);
    requireValid(Reflect.ownKeys(d).length === length.value + 1);
    const result: any[] = [], ids = new Set<unknown>();
    for (let n=0;n<length.value;n++) {
      const p = d[String(n)]; requireValid(p && 'value' in p && p.enumerable);
      const parsed = item(p.value,budget);
      if (uniqueKey) { requireValid(!ids.has(parsed[uniqueKey])); ids.add(parsed[uniqueKey]); }
      result.push(parsed);
    }
    return Object.freeze(result);
  };
}
function variant(key: string, variants: Record<string, Schema>): Schema {
  return (value,budget) => {
    const d=descriptors(value), tag=d[key]?.value;
    requireValid(typeof tag === 'string' && Object.hasOwn(variants,tag));
    return variants[tag]!(value,budget);
  };
}
function tagged(key: string, shapes: Record<string,Record<string,Schema>>, common: Record<string,Schema> = {}): Schema {
  return variant(key,Object.fromEntries(Object.entries(shapes).map(([tag,shape]) => [tag,object({...common,[key]:literal(tag),...shape})])));
}
function bytes(value: unknown): number { return encoder.encode(JSON.stringify(value)).length; }
function run<T>(schema: Schema, value: unknown, max = L.documentBytes + L.pageBytes): T | undefined {
  try {
    const parsed = schema(value,{nodes:32_768,bytes:max});
    requireValid(bytes(parsed) <= max);
    return parsed as T;
  } catch { return undefined; }
}
const instant = refine(text(24,false), v => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v);
const date = refine(text(10,false), v => /^\d{4}-\d\d-\d\d$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v);
function safeComponent(v: string): boolean {
  return v.length>0 && v!=='.' && v!=='..' && !/[<>:"/\\|?*\u0000-\u001f]/.test(v)
    && !/[. ]$/.test(v) && !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(v) && v.length<=255;
}
const folder = refine(text(L.relativePathBytes,false), v => v.split('/').every(safeComponent));
const markdownPath = refine(folder, v => {
  const name=v.split('/').at(-1)!;
  return /\.md$/i.test(name) && encoder.encode(name).length<=L.filenameBytes;
});
const canonicalPath = refine(text(L.displayPathBytes,false), v => {
  // Lexical transport only. Filesystem containment/identity/reparse checks belong to adapters.
  if (/^[A-Za-z]:[\\/]/.test(v)) return v.slice(3).split(/[\\/]/).every(safeComponent);
  if (/^\\\\[^\\/]+[\\/][^\\/]+[\\/]/.test(v)) return v.slice(2).split(/[\\/]/).every(safeComponent);
  return false;
});
const errorSchema = refine(object({code:literal(...Object.keys(ERRORS)),message:text(256,false),correlationId:uuid}),
  v => v.message === ERRORS[v.code as keyof typeof ERRORS]);
const repository = object({repositoryId:uuid,displayName:text(L.displayNameBytes,false),verifiedDisplayPath:text(L.displayPathBytes,false)});
const defaultRepository = object({version:uuid,repository:nullable(repository)});
const convention = object({conventionId:uuid,relativeFolder:folder});
const health = tagged('state',{initializing:{},ready:{},readOnlyRecovery:{reason:literal('missingExpectedDatabase','corruptDatabase','foreignOwnership','unsupportedSchema','incompleteInitialization')}});
const sessionView = tagged('state',Object.fromEntries([
  ['notAllocated',{}], ...['allocated','materialized','missing','corrupt','linkageMismatch'].map(s => [s,{sessionId:uuid,lastPersistedEntryId:nullable(opaque)}]),
]) as Record<string,Record<string,Schema>>);
const documentView = tagged('state',{
  notRegistered:{},available:{documentId:uuid,relativePath:markdownPath,revision:uuid,byteLength:integer(L.documentBytes)},
  missing:{documentId:uuid,relativePath:markdownPath},invalid:{documentId:uuid,relativePath:markdownPath},
});
const operationShape = {
  operationId:uuid,requestId:uuid,prdId:uuid,sessionId:nullable(uuid),generationId:nullable(uuid),
  kind:literal('create','brainstorm','send','piRevision','save','reopen','cancel','reconcile','workspaceRetry'),
  phase:literal('starting','running','awaitingUiResponse','cancelling','reconciling','finished'),
  outcome:nullable(literal('succeeded','cancelled','failed','interrupted','handledWithoutRun')),error:nullable(errorSchema),
};
const operation = refine(object(operationShape), v => {
  if (v.phase!=='finished') return v.outcome===null && v.error===null && (v.phase!=='awaitingUiResponse' || (v.sessionId!==null && v.generationId!==null));
  return v.outcome!==null && ((v.outcome==='failed' || v.outcome==='interrupted') ? v.error!==null : v.error===null);
});
const question = tagged('kind',{
  select:{options:refine(array(object({optionId:uuid,label:text(L.uiTextBytes,false)}),L.uiOptions,'optionId'),v=>v.length>0)},
  confirm:{message:text(L.uiTextBytes)},input:{placeholder:nullable(text(L.uiTextBytes))},editor:{prefill:text(L.inputBytes)},
},{questionId:uuid,title:text(L.uiTextBytes,false),deadline:nullable(instant)});
const answer = tagged('kind',{select:{optionId:uuid},confirm:{confirmed:bool},input:{text:text(L.inputBytes)},editor:{text:text(L.inputBytes)},cancel:{}});
const summary = refine(object({
  prdId:uuid,workspaceId:uuid,repository,version:uuid,displayName:text(L.displayNameBytes,false),creationDate:date,
  lifecycle:literal('createPending','brainstormActive','draftAvailable','failed','interrupted'),
  workspaceState:literal('planned','baseFetched','branchCreated','worktreeCreated','ready','recoveryRequired'),
  document:documentView,session:sessionView,publication:literal('unavailable'),
}),v=>v.lifecycle!=='draftAvailable' || v.document.state!=='notRegistered');
const snapshot = refine(object({
  prd:summary,store:health,operation:nullable(operation),pendingQuestion:nullable(question),sequence:integer(),
  workspaceLocation:nullable(object({worktreePath:canonicalPath,branchName:refine(text(1024,false),v=>/^prd\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v))})),
  draftLocation:tagged('state',{unresolved:{choices:array(convention,L.conventionItems,'conventionId')},resolved:{convention,relativePath:markdownPath}}),
  editorAccess:literal('editable','foregroundReadOnly','recoveryReadOnly'),externalWriters:literal('unknown'),
}),v=>{
  if ((v.prd.workspaceState==='worktreeCreated'||v.prd.workspaceState==='ready') !== (v.workspaceLocation!==null)) return false;
  if (v.operation && (v.operation.prdId!==v.prd.prdId || (v.operation.sessionId!==null && v.operation.sessionId!==v.prd.session.sessionId))) return false;
  if (v.pendingQuestion && (!v.operation || v.operation.phase!=='awaitingUiResponse')) return false;
  if (v.operation?.phase==='awaitingUiResponse' && !v.pendingQuestion) return false;
  const foreground=v.operation && v.operation.phase!=='finished';
  if (foreground && v.editorAccess==='editable') return false;
  if (v.editorAccess==='editable' && (v.store.state!=='ready' || v.prd.workspaceState!=='ready' || v.prd.document.state!=='available')) return false;
  if (v.draftLocation.state==='resolved' && v.prd.document.state!=='notRegistered' && v.draftLocation.relativePath!==v.prd.document.relativePath) return false;
  return true;
});
function page(item: Schema,max: number,key: string,additional: Record<string,Schema>={}): Schema {
  return refine(object({items:array(item,max,key),nextCursor:nullable(cursor),coverage:literal('complete','more','scanLimit'),...additional}),v=>
    bytes(v)<=L.pageBytes && (v.coverage!=='more' || v.nextCursor!==null) && (v.coverage!=='complete' || v.nextCursor===null));
}
const documentBody = refine(object({documentId:uuid,relativePath:markdownPath,revision:uuid,text:text(L.documentBytes),byteLength:integer(L.documentBytes)}),v=>encoder.encode(v.text).length===v.byteLength);
const candidates = page(object({candidateId:uuid,relativePath:markdownPath,conventionId:uuid,revision:uuid,byteLength:integer(L.documentBytes),observedAt:instant,
  previewText:text(L.candidatePreviewBytes),previewStatus:literal('complete','truncated')}),L.candidateItems,'candidateId',{version:uuid,conventions:array(convention,L.conventionItems,'conventionId')});
const historyPage = page(object({entryId:opaque,messageId:opaque,role:literal('writer','assistant','extension'),text:text(L.historyTextBytes),textStatus:literal('complete','truncated'),persistedAt:instant}),
  L.historyItems,'entryId',{sessionId:uuid,lastPersistedEntryId:nullable(opaque)});
const target = {prdId:uuid}, versioned = {...target,expectedVersion:uuid};
const requestShapes: Record<string,Record<string,Schema>> = {
  NativePickRepository:{},SetDefaultRepository:{repositoryId:nullable(uuid),expectedVersion:uuid},ListPrds:{cursor:nullable(cursor)},
  CreatePrd:{repositoryId:uuid,idea:text(L.inputBytes,false)},OpenPrd:{...target,subscriptionId:uuid},
  ReadHistory:{...target,sessionId:uuid,cursor:nullable(cursor)},ReadDocument:{...target,documentId:uuid},
  SaveDocument:{...versioned,documentId:uuid,expectedDocumentRevision:uuid,text:text(L.documentBytes)},ListDraftCandidates:{...target,cursor:nullable(cursor)},
  SendTurn:{...versioned,expectedDocumentRevision:nullable(uuid),sessionId:uuid,text:text(L.inputBytes,false),intent:literal('conversation','reviseDocument')},
  AnswerUiQuestion:{...versioned,sessionId:uuid,operationId:uuid,generationId:uuid,questionId:uuid,answer},
  CancelOperation:{...target,operationId:uuid},ReconcilePrd:target,RetryWorkspaceSetup:{...versioned,setupOperationId:uuid},
};
const requestCommon = {contractVersion:literal(1),requestId:uuid};
const requestVariants = Object.fromEntries(Object.entries(requestShapes).map(([name,shape])=>[name,object({...requestCommon,command:literal(name),...shape})]));
requestVariants.SelectDraft = tagged('selection',{
  convention:{conventionId:uuid,expectedDocumentRevision:nil},candidate:{candidateId:uuid,expectedDocumentRevision:uuid},
},{...requestCommon,command:literal('SelectDraft'),...versioned});
const requestSchema = variant('command',requestVariants);
const operationReply = refine(object({snapshot,operation}),v=>v.snapshot.operation!==null && JSON.stringify(v.snapshot.operation)===JSON.stringify(v.operation));
const saveReply = refine(object({snapshot,document:documentBody}),v=>v.snapshot.prd.document.state==='available'
  && v.document.documentId===v.snapshot.prd.document.documentId && v.document.revision===v.snapshot.prd.document.revision
  && v.document.relativePath===v.snapshot.prd.document.relativePath && v.document.byteLength===v.snapshot.prd.document.byteLength);
const replySchemas: Record<string,Schema> = {
  NativePickRepository:tagged('outcome',{cancelled:{},selected:{repository}}),SetDefaultRepository:defaultRepository,
  ListPrds:page(summary,L.listItems,'prdId',{defaultRepository,store:health}),CreatePrd:operationReply,
  OpenPrd:object({subscriptionId:uuid,snapshot}),ReadHistory:historyPage,ReadDocument:documentBody,SaveDocument:saveReply,ListDraftCandidates:candidates,
  SelectDraft:refine(object({snapshot,document:nullable(documentBody),operation:nullable(operation)}),v=>
    (v.document===null || (v.snapshot.prd.document.state==='available' && v.document.documentId===v.snapshot.prd.document.documentId && v.document.revision===v.snapshot.prd.document.revision && v.document.relativePath===v.snapshot.prd.document.relativePath))
    && (v.operation===null || JSON.stringify(v.operation)===JSON.stringify(v.snapshot.operation))),
  SendTurn:operationReply,AnswerUiQuestion:object({outcome:literal('answered','cancelRequested')}),
  CancelOperation:refine(object({outcome:literal('cancelRequested','alreadyFinished'),operation}),v=>v.outcome==='alreadyFinished' ? v.operation.phase==='finished' : v.operation.phase!=='finished'),
  ReconcilePrd:snapshot,RetryWorkspaceSetup:operationReply,
};
const eventShapes: Record<string,Record<string,Schema>> = {
  snapshot:{snapshot},operation:{operation},textDelta:{messageId:opaque,delta:text(L.deltaBytes)},
  textFinalized:{messageId:opaque,text:text(L.historyTextBytes),textStatus:literal('complete','truncated'),durability:literal('unconfirmed')},
  historyPersisted:{lastPersistedEntryId:opaque},uiQuestion:{question},uiQuestionDismissed:{questionId:uuid,reason:literal('answered','cancelled','expired','operationEnded')},
  documentChanged:{document:documentView,cause:literal('appSave','filesystemObserved','reconciliation')},
  resyncRequired:{reason:literal('sequenceGap','backpressure','restart')},error:{error:errorSchema},
};
const eventContext = {contractVersion:literal(1),subscriptionId:uuid,requestId:nullable(uuid),prdId:uuid,sessionId:nullable(uuid),operationId:nullable(uuid),generationId:nullable(uuid),sequence:integer(),version:uuid};
const fullEvent = refine(tagged('type',eventShapes,eventContext),v=>{
  if (['textDelta','textFinalized','historyPersisted','uiQuestion','uiQuestionDismissed'].includes(v.type)
    && [v.requestId,v.sessionId,v.operationId,v.generationId].some(x=>x===null)) return false;
  if (v.type==='operation' && (v.operation.prdId!==v.prdId || v.operation.operationId!==v.operationId || v.operation.requestId!==v.requestId || v.operation.sessionId!==v.sessionId || v.operation.generationId!==v.generationId)) return false;
  if (v.type==='snapshot') {
    const s=v.snapshot, op=s.operation;
    if (s.prd.prdId!==v.prdId || s.prd.version!==v.version || s.sequence!==v.sequence
      || (s.prd.session.sessionId ?? null)!==v.sessionId) return false;
    if (op ? (op.operationId!==v.operationId || op.generationId!==v.generationId || op.requestId!==v.requestId)
      : (v.operationId!==null || v.generationId!==null)) return false;
  }
  return true;
});
const identity = object({device:refine(text(32,false),v=>/^\d+$/.test(v)),fileId:refine(text(64,false),v=>/^\d+$/.test(v)),birthtimeNs:refine(text(32,false),v=>/^\d+$/.test(v))});
const sha256 = refine(text(64,false),v=>/^[a-f0-9]{64}$/.test(v));
const binding = object({name:literal('brainstorm'),sourcePath:canonicalPath,baseDir:canonicalPath,identity,contentSha256:sha256,
  source:literal('worktreeConfigured','worktreeDiscovered','userConfigured','userDiscovered','package','extension')});
const config = object({packagedEntry:canonicalPath,packagedSdkRoot:canonicalPath,worktreeCwd:canonicalPath,existingAgentDir:canonicalPath,appSessionDir:canonicalPath,
  resourcePolicy:literal('normalWorktreeAndUser'),capabilities:literal('normalConfigured')});
function containedPath(root: string,path: string): boolean {
  const a=root.replaceAll('\\','/').toLowerCase().split('/'),b=path.replaceAll('\\','/').toLowerCase().split('/');
  return b.length>a.length && a.every((part,n)=>b[n]===part);
}
const sessionRecord = refine(object({prdId:uuid,sessionId:uuid,exactPath:canonicalPath,appSessionDir:canonicalPath,expectedCwd:canonicalPath,
  state:literal('allocated','materialized','missing','corrupt','linkageMismatch'),headerVersion:nullable(integer(3)),lastPersistedEntryId:nullable(opaque)}),v=>
  containedPath(v.appSessionDir,v.exactPath) && /\.jsonl$/i.test(v.exactPath)
  && (v.state!=='allocated' || (v.headerVersion===null && v.lastPersistedEntryId===null))
  && (v.state!=='materialized' || v.headerVersion===3));
const correlationShape = {requestId:uuid,prdId:uuid,operationId:uuid,generationId:uuid};
const correlationSchema = object(correlationShape);
const piCommands = refine(tagged('type',{
  'pi.start':{config,session:tagged('mode',{create:{},open:{record:sessionRecord},resumeAllocated:{record:sessionRecord}})},
  'pi.prompt':{sessionId:uuid,input:tagged('kind',{
    brainstorm:{binding,idea:text(L.inputBytes,false),convention,relativePath:markdownPath,creationDate:date},literalTurn:{text:text(L.inputBytes,false)},
  })},
  'pi.answer':{sessionId:uuid,questionId:uuid,answer},'pi.abort':{sessionId:uuid},'pi.reconcile':{sessionId:uuid},
  'pi.ack':{sessionId:nullable(uuid),throughSequence:integer()},'pi.close':{sessionId:nullable(uuid)},
},{contractVersion:literal(1),...correlationShape}),v=>{
  if (v.type==='pi.start' && v.session.mode!=='create') {
    const r=v.session.record;
    if (r.prdId!==v.prdId || r.expectedCwd!==v.config.worktreeCwd || r.appSessionDir!==v.config.appSessionDir) return false;
    if (v.session.mode==='resumeAllocated' ? r.state!=='allocated' : r.state!=='materialized') return false;
  }
  if (v.type==='pi.prompt' && v.input.kind==='brainstorm' && !containedPath(v.input.convention.relativeFolder,v.input.relativePath)) return false;
  return true;
});
const projection = tagged('type',Object.fromEntries(Object.entries(eventShapes).filter(([key])=>!['snapshot','documentChanged','resyncRequired','operation'].includes(key))));
const piEventsSchema = refine(tagged('type',{
  'pi.sessionAllocated':{record:sessionRecord},'pi.ready':{sessionId:uuid,binding,capabilities:literal('normalConfigured')},
  'pi.projection':{sessionId:uuid,event:projection},'pi.documentHint':{sessionId:uuid,relativePath:markdownPath,source:literal('toolArgument','filesystemObserved')},
  'pi.settled':{sessionId:uuid,outcome:literal('succeeded','cancelled','failed','interrupted','handledWithoutRun'),foregroundIdle:literal(true),backgroundWriters:literal('unknown')},
  'pi.reconciled':{record:sessionRecord,foregroundIdle:bool,backgroundWriters:literal('unknown')},'pi.failure':{sessionId:nullable(uuid),error:errorSchema},
  'pi.closing':{sessionId:nullable(uuid),abortAwaited:bool},
},{contractVersion:literal(1),sequence:integer(),...correlationShape}),v=>
  (!v.record || v.record.prdId===v.prdId) && (v.type!=='pi.sessionAllocated' || v.record.state==='allocated'));
function correlated(value: Data | undefined,expected: PiCorrelation): boolean {
  const c=run<Data>(correlationSchema,expected,L.pageBytes);
  return !!value && !!c && Object.keys(c).every(key=>value[key]===c[key]);
}

export function parsePrdRequest(value: unknown): PrdRequest | undefined { return run(requestSchema,value); }
export function parsePrdResult(value: unknown, expected?: PrdRequest): PrdResult | undefined {
  if (expected === undefined) return run(object({contractVersion:literal(1),requestId:nil,command:nil,ok:literal(false),error:errorSchema}),value,L.pageBytes);
  const request=parsePrdRequest(expected);
  if (!request) return undefined;
  const command=request.command;
  const schema=refine(object({contractVersion:literal(1),requestId:literal(request.requestId),command:literal(command),ok:literal(true),value:replySchemas[command]!}),v=>{
    const r=request as unknown as Data, data=v.value as Data;
    const s=data.snapshot || (command==='ReconcilePrd'?data:null);
    if (s && r.prdId && s.prd.prdId!==r.prdId) return false;
    if (['CreatePrd','SendTurn','RetryWorkspaceSetup'].includes(command) && data.operation.requestId!==r.requestId) return false;
    if (command==='SendTurn' && (data.operation.sessionId!==r.sessionId || s.prd.session.sessionId!==r.sessionId)) return false;
    if (command==='SelectDraft' && data.operation!==null && data.operation.requestId!==r.requestId) return false;
    if (command==='CreatePrd' && s.prd.repository.repositoryId!==r.repositoryId) return false;
    if (command==='OpenPrd' && data.subscriptionId!==r.subscriptionId) return false;
    if (command==='ReadHistory' && data.sessionId!==r.sessionId) return false;
    if (command==='ReadDocument' && data.documentId!==r.documentId) return false;
    if (command==='SaveDocument' && data.document.documentId!==r.documentId) return false;
    if (command==='CancelOperation' && (data.operation.prdId!==r.prdId || data.operation.operationId!==r.operationId)) return false;
    if (command==='SetDefaultRepository' && (data.repository?.repositoryId ?? null)!==r.repositoryId) return false;
    return true;
  });
  const good=run<PrdResult>(schema,value);
  if (good) return good;
  return run(object({contractVersion:literal(1),requestId:literal(request.requestId),command:literal(command),ok:literal(false),error:errorSchema}),value,L.pageBytes);
}
export function parsePrdEvent(value: unknown): PrdEvent | undefined { return run(fullEvent,value,L.eventBytes); }
export function parsePiCommand(value: unknown,expected: PiCorrelation): PiUtilityCommand | undefined {
  const parsed=run<PiUtilityCommand>(piCommands,value,L.pageBytes);
  return correlated(parsed,expected) ? parsed : undefined;
}
export function parsePiEvent(value: unknown,expected: PiCorrelation): PiUtilityEvent | undefined {
  const parsed=run<PiUtilityEvent>(piEventsSchema,value,L.eventBytes);
  return correlated(parsed,expected) ? parsed : undefined;
}
export function parseDetach(value: unknown): DetachSubscriptionRequest | undefined {
  return run(object({contractVersion:literal(1),subscriptionId:uuid}),value,L.pageBytes);
}
export function parseCloseRequest(value: unknown): CloseRequest | undefined {
  return run(object({contractVersion:literal(1),closeId:uuid}),value,L.pageBytes);
}
export function parseCloseResponse(value: unknown,closeId: string): CloseResponse | undefined {
  const id=run<string>(uuid,closeId,L.pageBytes);
  return id ? run(object({contractVersion:literal(1),closeId:literal(id),decision:literal('ready','blocked')}),value,L.pageBytes) : undefined;
}
export function parseProductLaunch(value: unknown): ProductLaunch | undefined {
  return run(tagged('mode',{product:{},bootstrapFixture:{fixtureRoot:canonicalPath}}),value,L.pageBytes);
}
export function parseEditorRecovery(value: unknown): EditorRecoveryBuffer | undefined {
  return run(object({prdId:uuid,documentId:uuid,baseRevision:uuid,text:text(L.documentBytes),retainedAt:instant}),value);
}
