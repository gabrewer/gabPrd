import test from 'node:test';
import assert from 'node:assert/strict';
import { PRD_ERROR_MESSAGES, PRD_LIMITS as L } from '../../src/shared/prd-contracts';
import type { PiCorrelation, PrdRequest } from '../../src/shared/prd-contracts';
import { parsePrdRequest, parsePrdResult, parsePrdEvent, parsePiCommand, parsePiEvent,
  parseDetach, parseCloseRequest, parseCloseResponse, parseProductLaunch, parseEditorRecovery } from '../../src/shared/prd-validation';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [requestId, prdId, workspaceId, repositoryId, version, documentId, revision, sessionId,
  operationId, generationId, subscriptionId, questionId, optionId, conventionId, candidateId] =
  Array.from({length: 15}, (_, n) => id(n + 1)) as [string,string,string,string,string,string,string,string,string,string,string,string,string,string,string];
const secret = 'PRD_SENTINEL_SECRET_NEVER_IN_ERRORS';
const now = '2026-10-16T12:00:00.000Z';
const error = {code:'INTERNAL', message:PRD_ERROR_MESSAGES.INTERNAL, correlationId:requestId};
const repository = {repositoryId, displayName:'My repository', verifiedDisplayPath:'X:/owned/repository'};
const convention = {conventionId, relativeFolder:'docs/design'};
const body = {documentId, relativePath:'docs/design/2026-10-16-idea.md', revision, text:'# Idea', byteLength:6};
const document = {state:'available', documentId, relativePath:body.relativePath, revision, byteLength:6};
const operation = {operationId, requestId, prdId, sessionId, generationId, kind:'send', phase:'running', outcome:null, error:null};
const question = {questionId, title:'Choose', deadline:null, kind:'select', options:[{optionId,label:'First'}]};
const snapshot = {prd:{prdId, workspaceId, repository, version, displayName:'Idea', creationDate:'2026-10-16',
  lifecycle:'draftAvailable',workspaceState:'ready',document,session:{state:'materialized',sessionId,lastPersistedEntryId:'entry-1'},publication:'unavailable'},
  store:{state:'ready'},operation,pendingQuestion:null,sequence:1,
  workspaceLocation:{worktreePath:'X:/owned/appdata/workspaces/'+workspaceId,branchName:'prd/idea-00000000'},
  draftLocation:{state:'resolved',convention,relativePath:body.relativePath},editorAccess:'foregroundReadOnly',externalWriters:'unknown'};
const page = {items:[],nextCursor:null,coverage:'complete'};
const candidate = {candidateId,relativePath:body.relativePath,conventionId,revision,byteLength:6,observedAt:now,previewText:'# Idea',previewStatus:'complete'};
const history = {entryId:'entry-1',messageId:'msg-1',role:'assistant',text:'Question?',textStatus:'complete',persistedAt:now};
const requests: Record<string, object> = {
  NativePickRepository:{}, SetDefaultRepository:{repositoryId,expectedVersion:version}, ListPrds:{cursor:null},
  CreatePrd:{repositoryId,idea:'Make it useful'}, OpenPrd:{prdId,subscriptionId},
  ReadHistory:{prdId,sessionId,cursor:null},ReadDocument:{prdId,documentId},
  SaveDocument:{prdId,documentId,expectedVersion:version,expectedDocumentRevision:revision,text:'# Idea'},
  ListDraftCandidates:{prdId,cursor:null},SelectDraft:{prdId,expectedVersion:version,selection:'candidate',candidateId,expectedDocumentRevision:revision},
  SendTurn:{prdId,expectedVersion:version,expectedDocumentRevision:revision,sessionId,text:'Improve it',intent:'reviseDocument'},
  AnswerUiQuestion:{prdId,expectedVersion:version,sessionId,operationId,generationId,questionId,answer:{kind:'select',optionId}},
  CancelOperation:{prdId,operationId}, ReconcilePrd:{prdId},RetryWorkspaceSetup:{prdId,expectedVersion:version,setupOperationId:operationId},
};
const replies: Record<string, object> = {
  NativePickRepository:{outcome:'selected',repository}, SetDefaultRepository:{version,repository},
  ListPrds:{...page,items:[snapshot.prd],defaultRepository:{version,repository},store:{state:'ready'}},
  CreatePrd:{snapshot,operation},OpenPrd:{subscriptionId,snapshot},ReadHistory:{...page,items:[history],sessionId,lastPersistedEntryId:'entry-1'},
  ReadDocument:body,SaveDocument:{snapshot,document:body},ListDraftCandidates:{...page,items:[candidate],version,conventions:[convention]},
  SelectDraft:{snapshot,document:body,operation:null},SendTurn:{snapshot,operation},AnswerUiQuestion:{outcome:'answered'},
  CancelOperation:{outcome:'cancelRequested',operation},ReconcilePrd:snapshot,RetryWorkspaceSetup:{snapshot,operation},
};
const req = (command: string, fields = requests[command]) => ({contractVersion:1,requestId,command,...fields});
const result = (command: string, value = replies[command]) => ({contractVersion:1,requestId,command,ok:true,value});
const context = {requestId,prdId,sessionId,operationId,generationId};
const privateContext = {requestId,prdId,operationId,generationId};
const correlation = privateContext as unknown as PiCorrelation;
const event = (fields: object) => ({contractVersion:1,subscriptionId,...context,sequence:1,version,...fields});
const events = [
  {type:'snapshot',snapshot},{type:'operation',operation},{type:'extensionUi',update:{kind:'status',key:'sprint-continuity',text:null}},{type:'writerMessage',messageId:'writer-1',text:'My submitted idea',textStatus:'complete',durability:'unconfirmed'},{type:'textDelta',messageId:'msg-1',delta:'hello'},
  {type:'textFinalized',messageId:'msg-1',text:'hello',textStatus:'complete',durability:'unconfirmed'},
  {type:'historyPersisted',lastPersistedEntryId:'entry-1'},{type:'uiQuestion',question},
  {type:'uiQuestionDismissed',questionId,reason:'answered'},{type:'documentChanged',document,version,cause:'appSave'},
  {type:'resyncRequired',reason:'backpressure'},{type:'error',error},
];
const identity = {device:'1',fileId:'2',birthtimeNs:'3'};
const binding = {name:'brainstorm',sourcePath:'X:/owned/.pi/skills/brainstorm/SKILL.md',baseDir:'X:/owned/.pi/skills/brainstorm',identity,contentSha256:'a'.repeat(64),source:'worktreeConfigured'};
const config = {packagedEntry:'X:/app/pi-utility.cjs',packagedSdkRoot:'X:/app/node_modules/pi',worktreeCwd:'X:/owned/worktree',existingAgentDir:'X:/user/pi',appSessionDir:'X:/data/sessions',resourcePolicy:'normalWorktreeAndUser',capabilities:'normalConfigured'};
const record = {prdId,sessionId,exactPath:'X:/data/sessions/exact.jsonl',appSessionDir:'X:/data/sessions',expectedCwd:config.worktreeCwd,state:'materialized',headerVersion:3,lastPersistedEntryId:'entry-1'};
const pi = (fields: object) => ({contractVersion:1,...privateContext,...fields});
const commands = [
  {type:'pi.start',config,session:{mode:'create'}}, {type:'pi.start',config,session:{mode:'open',record}},
  {type:'pi.start',config,session:{mode:'resumeAllocated',record:{...record,state:'allocated',headerVersion:null,lastPersistedEntryId:null}}},
  {type:'pi.prompt',sessionId,input:{kind:'brainstorm',binding,idea:'Initial idea',convention,relativePath:body.relativePath,creationDate:'2026-10-16'}},
  {type:'pi.prompt',sessionId,input:{kind:'literalTurn',text:'literal $1'}},
  {type:'pi.answer',sessionId,questionId,answer:{kind:'cancel'}},{type:'pi.abort',sessionId},
  {type:'pi.reconcile',sessionId},{type:'pi.ack',sessionId,throughSequence:1},{type:'pi.ack',sessionId:null,throughSequence:1},{type:'pi.close',sessionId:null},
];
const piEvents = [
  {type:'pi.sessionAllocated',record:{...record,state:'allocated',headerVersion:null,lastPersistedEntryId:null}},
  {type:'pi.ready',sessionId,binding,capabilities:'normalConfigured'},
  ...events.filter(e => !['snapshot','documentChanged','resyncRequired','operation'].includes(e.type)).map(e => ({type:'pi.projection',sessionId,event:e})),
  {type:'pi.documentHint',sessionId,relativePath:body.relativePath,source:'toolArgument'},
  {type:'pi.settled',sessionId,outcome:'succeeded',foregroundIdle:true,backgroundWriters:'unknown'},
  {type:'pi.reconciled',record,foregroundIdle:false,backgroundWriters:'unknown'},
  {type:'pi.failure',sessionId:null,error},{type:'pi.closing',sessionId,abortAwaited:true},
];
for (const command of Object.keys(requests)) {
  test(`valid command ${command} is accepted and copied/frozen`, () => {
    const input = req(command), parsed = parsePrdRequest(input);
    assert.deepEqual(parsed,input); assert.notEqual(parsed,input); assert.ok(Object.isFrozen(parsed));
  });
  test(`reply ${command} is exact and correlated`, () => {
    assert.deepEqual(parsePrdResult(result(command),req(command) as PrdRequest),result(command));
    for (const bad of [{...result(command),requestId:id(90)},{...result(command),command:'Publish'},
      {...result(command),root:secret}]) assert.equal(parsePrdResult(bad,req(command) as PrdRequest),undefined);
  });
}
for (const e of events) test(`public event ${e.type}`, () => {
  assert.deepEqual(parsePrdEvent(event(e)),event(e));
});
for (const [n,c] of commands.entries()) test(`private command ${c.type} variant ${n}`, () => {
  assert.deepEqual(parsePiCommand(pi(c),correlation),pi(c));
  assert.equal(parsePiCommand(pi({...c,generationId:id(91)}),correlation),undefined);
});
for (const [n,e] of piEvents.entries()) test(`private event ${e.type} variant ${n}`, () => {
  const input = {...pi(e),sequence:1};
  assert.deepEqual(parsePiEvent(input,correlation),input);
  assert.equal(parsePiEvent({...input,operationId:id(92)},correlation),undefined);
});

test('writer messages are correlated, bounded, exact and never claim saved durability',()=>{
 const body={type:'writerMessage',messageId:'writer-1',text:'Original $1 ${HOME}',textStatus:'complete',durability:'unconfirmed'};assert.deepEqual(parsePrdEvent(event(body)),event(body));
 for(const change of [{durability:'saved'},{text:'a'.repeat(L.deltaBytes+1)},{role:'writer'},{requestId:null},{sessionId:null},{operationId:null},{generationId:null}])assert.equal(parsePrdEvent(event({...body,...change})),undefined);
});
const parsedWorkspace=(value:object)=>parsePrdResult(result('ReconcilePrd',value),req('ReconcilePrd') as PrdRequest);
test('workspace location is exact display data for created worktrees and never source repository authority',()=>{
 const legacy={...snapshot,workspaceLocation:{...snapshot.workspaceLocation,branchName:'prd/'+prdId}};assert.deepEqual(parsedWorkspace(legacy),result('ReconcilePrd',legacy));
 for(const workspaceState of ['worktreeCreated','ready']){const value={...snapshot,prd:{...snapshot.prd,workspaceState}};assert.deepEqual(parsedWorkspace(value),result('ReconcilePrd',value));assert.equal(parsedWorkspace({...value,workspaceLocation:null}),undefined);}
 for(const workspaceState of ['planned','baseFetched','branchCreated','recoveryRequired']){const value={...snapshot,prd:{...snapshot.prd,workspaceState,lifecycle:'createPending',document:{state:'notRegistered'},session:{state:'notAllocated'}},operation:null,workspaceLocation:null,draftLocation:{state:'unresolved',choices:[]},editorAccess:'recoveryReadOnly'};assert.deepEqual(parsedWorkspace(value),result('ReconcilePrd',value));assert.equal(parsedWorkspace({...value,workspaceLocation:snapshot.workspaceLocation}),undefined);}
});
test('workspace location rejects missing fields, extras, unsafe paths, oversized or non-PRD branches',()=>{
 assert.ok(parsedWorkspace(snapshot));
 for(const workspaceLocation of [{worktreePath:'../outside',branchName:'prd/idea-00000000'},{...snapshot.workspaceLocation,branchName:'main'},{...snapshot.workspaceLocation,branchName:'prd/a'.repeat(L.displayPathBytes)},{...snapshot.workspaceLocation,extra:secret},{worktreePath:snapshot.workspaceLocation.worktreePath}])assert.equal(parsedWorkspace({...snapshot,workspaceLocation}),undefined);
 const missing={...snapshot} as Partial<typeof snapshot>;delete missing.workspaceLocation;assert.equal(parsedWorkspace(missing),undefined);
});
test('all requests reject root and nested getters, symbols, prototypes, nonenumerables and missing/extra keys without invocation or mutation', () => {
  let touched=0;
  for (const command of Object.keys(requests)) {
    const value = req(command);
    const before = structuredClone(value);
    const invalid: unknown[] = [null,undefined,[],1,{},Object.create(value),{...value,path:secret},
      {...value,[Symbol('secret')]:secret},Object.defineProperty({...value},'secret',{value:secret})];
    for (const key of Object.keys(value)) {
      const missing = {...value} as Record<string,unknown>; delete missing[key]; invalid.push(missing);
      invalid.push(Object.defineProperty({...value},key,{get(){ touched++; throw new Error(secret); },enumerable:true}));
    }
    for (const bad of invalid) assert.equal(parsePrdRequest(bad),undefined);
    assert.deepEqual(value,before);
  }
  const nested = req('AnswerUiQuestion',{...requests.AnswerUiQuestion,answer:{get kind(){touched++;throw new Error(secret);}}});
  assert.equal(parsePrdRequest(nested),undefined); assert.equal(touched,0);
});

test('every nested public/private record rejects missing/extra properties, array holes/accessors and symbols', () => {
  const fixtures: [unknown,(v:unknown)=>unknown][] = [
    ...Object.keys(requests).map(c => [req(c),(v:unknown)=>parsePrdRequest(v)] as [unknown,(v:unknown)=>unknown]),
    ...Object.keys(replies).map(c => [result(c),(v:unknown)=>parsePrdResult(v,req(c) as PrdRequest)] as [unknown,(v:unknown)=>unknown]),
    ...events.map(e => [event(e),(v:unknown)=>parsePrdEvent(v)] as [unknown,(v:unknown)=>unknown]),
    ...commands.map(c => [pi(c),(v:unknown)=>parsePiCommand(v,correlation)] as [unknown,(v:unknown)=>unknown]),
    ...piEvents.map(e => [{...pi(e),sequence:1},(v:unknown)=>parsePiEvent(v,correlation)] as [unknown,(v:unknown)=>unknown]),
  ];
  let touched=0;
  for (const [fixture,parse] of fixtures) {
    function walk(value:unknown,path:(string|number)[]=[]):void {
      if (!value || typeof value!=='object') return;
      const mutations:unknown[]=[];
      if (Array.isArray(value)) {
        mutations.push(Object.assign([...value],{extra:secret}));
        if (value.length) { const hole=[...value]; delete hole[0]; mutations.push(hole); }
      } else {
        mutations.push({...value,extra:secret},{...value,[Symbol()]:secret});
        for (const key of Object.keys(value)) {
          const missing={...value} as Record<string,unknown>;delete missing[key];mutations.push(missing);
          mutations.push(Object.defineProperty({...value},key,{get(){touched++;return secret;},enumerable:true}));
        }
      }
      for (const mutation of mutations) {
        const copy=structuredClone(fixture) as any;
        let target=copy;
        for (const key of path.slice(0,-1)) target=target[key];
        if (path.length) target[path.at(-1)!]=mutation;
        assert.equal(parse(path.length?copy:mutation),undefined,`accepted mutation at ${path.join('.')}`);
      }
      for (const [key,item] of Object.entries(value)) walk(item,[...path,key]);
    }
    walk(fixture);
  }
  assert.equal(touched,0);
});

test('request unions, literal cancel, nullable conventions/defaults and Unicode byte limits', () => {
  for (const answer of [{kind:'confirm',confirmed:false},{kind:'input',text:''},{kind:'editor',text:'draft'},{kind:'cancel'}])
    assert.ok(parsePrdRequest(req('AnswerUiQuestion',{...requests.AnswerUiQuestion,answer})));
  for (const answer of [{kind:'confirm',confirmed:'false'},{kind:'cancel',confirmed:false},{kind:'input',text:'\0'},{}])
    assert.equal(parsePrdRequest(req('AnswerUiQuestion',{...requests.AnswerUiQuestion,answer})),undefined);
  assert.ok(parsePrdRequest(req('SelectDraft',{prdId,expectedVersion:version,selection:'convention',conventionId,expectedDocumentRevision:null})));
  assert.ok(parsePrdRequest(req('SetDefaultRepository',{repositoryId:null,expectedVersion:version})));
  for (const bad of ['x'.repeat(L.inputBytes+1),'é'.repeat(L.inputBytes/2+1),'\0','\ud800',''])
    assert.equal(parsePrdRequest(req('CreatePrd',{repositoryId,idea:bad})),undefined);
  assert.ok(parsePrdRequest(req('CreatePrd',{repositoryId,idea:'x'.repeat(L.inputBytes)})));
  assert.equal(parsePrdRequest(req('CreatePrd',{repositoryId,displayName:'Not a writer input',idea:'idea'})),undefined);
  for (const bad of ['../outside.md','C:/outside.md','docs/CON.md','docs/a.md:secret','docs/a. /x.md','docs/a.txt','docs//a.md'])
    assert.equal(parsePrdResult(result('ReadDocument',{...body,relativePath:bad}),req('ReadDocument') as PrdRequest),undefined);
  assert.equal(parsePrdResult(result('ReadDocument',{...body,byteLength:7}),req('ReadDocument') as PrdRequest),undefined);
});

test('fixed error literals cannot tunnel causes, sentinels or invalid correlations', () => {
  for (const [code,message] of Object.entries(PRD_ERROR_MESSAGES)) {
    const value={contractVersion:1,ok:false,command:'ReadDocument',requestId,error:{code,message,correlationId:requestId}};
    assert.deepEqual(parsePrdResult(value,req('ReadDocument') as PrdRequest),value);
    assert.equal(parsePrdResult({...value,error:{...value.error,message:secret}},req('ReadDocument') as PrdRequest),undefined);
    assert.equal(parsePrdResult({...value,error:{...value.error,stack:secret}},req('ReadDocument') as PrdRequest),undefined);
  }
  assert.equal(parsePrdResult({contractVersion:1,ok:false,command:null,requestId,error},req('ReadDocument') as PrdRequest),undefined);
  assert.equal(parsePrdResult({contractVersion:1,ok:false,command:null,requestId:null,error},req('ReadDocument') as PrdRequest),undefined);
});

test('snapshot, replies and events reject contradictory IDs/lifecycle/phase/correlation', () => {
  const badSnapshots=[
    {...snapshot,operation:{...operation,prdId:id(88)}},
    {...snapshot,operation:{...operation,sessionId:id(88)}},
    {...snapshot,pendingQuestion:question},
    {...snapshot,operation:{...operation,phase:'finished'}},
    {...snapshot,prd:{...snapshot.prd,document:{state:'notRegistered'}}},
    {...snapshot,editorAccess:'editable'},
  ];
  for (const bad of badSnapshots) assert.equal(parsePrdEvent(event({type:'snapshot',snapshot:bad})),undefined);
  for (const bad of [{...body,documentId:id(88)}]) assert.equal(parsePrdResult(result('ReadDocument',bad),req('ReadDocument') as PrdRequest),undefined);
  assert.equal(parsePrdResult(result('OpenPrd',{snapshot,subscriptionId:id(88)}),req('OpenPrd') as PrdRequest),undefined);
  for (const delta of [event({type:'textDelta',messageId:'msg',delta:'a',generationId:null}),event({type:'textDelta',messageId:'msg',delta:'a',sequence:-1}),event({type:'textDelta',messageId:'msg',delta:'x'.repeat(L.deltaBytes+1)})]) assert.equal(parsePrdEvent(delta),undefined);
  assert.equal(parsePrdEvent(event({type:'operation',operation:{...operation,operationId:id(88)}})),undefined);
  assert.equal(parsePrdEvent(event({type:'snapshot',snapshot:{...snapshot,sequence:2}})),undefined);
});

test('private start/recovery and projection reject mismatched links and public authority injection', () => {
  for (const bad of [
    pi({type:'pi.start',config,session:{mode:'resumeAllocated',record}}),
    pi({type:'pi.start',config,session:{mode:'open',record:{...record,prdId:id(88)}}}),
    pi({type:'pi.start',config,session:{mode:'open',record:{...record,expectedCwd:'X:/other'}}}),
    pi({type:'pi.start',config,session:{mode:'open',record:{...record,exactPath:'X:/neighbor/session.jsonl'}}}),
    pi({type:'pi.start',config:{...config,capabilities:'restricted'},session:{mode:'create'}}),
  ]) assert.equal(parsePiCommand(bad,correlation),undefined);
  assert.equal(parsePiEvent({...pi({type:'pi.projection',sessionId,event:{type:'snapshot',snapshot}}),sequence:1},correlation),undefined);
  assert.equal(parsePiEvent({...pi({type:'pi.sessionAllocated',record}),sequence:1},correlation),undefined);
});

test('bounded pages/options/sequences, unique IDs and exact byte accounting', () => {
  assert.equal(parsePrdResult(result('ListPrds',{...replies.ListPrds,items:Array(51).fill(snapshot.prd)}),req('ListPrds') as PrdRequest),undefined);
  assert.equal(parsePrdResult(result('ListPrds',{...replies.ListPrds,items:[snapshot.prd,snapshot.prd]}),req('ListPrds') as PrdRequest),undefined);
  assert.equal(parsePrdResult(result('ListPrds',{...replies.ListPrds,coverage:'more',nextCursor:null}),req('ListPrds') as PrdRequest),undefined);
  assert.equal(parsePrdEvent(event({type:'uiQuestion',question:{...question,options:[...question.options,...question.options]}})),undefined);
  const largeText='x'.repeat(L.documentBytes);
  assert.ok(parsePrdResult(result('ReadDocument',{...body,text:largeText,byteLength:largeText.length}),req('ReadDocument') as PrdRequest));
  assert.equal(parsePrdResult(result('ReadDocument',{...body,text:largeText+'x',byteLength:largeText.length+1}),req('ReadDocument') as PrdRequest),undefined);
  assert.equal(parsePrdEvent(event({type:'textFinalized',messageId:'msg',text:'x'.repeat(L.historyTextBytes),textStatus:'complete',durability:'unconfirmed'})),undefined);
});

test('adversarial: pre-correlation rejection has a supported exact parsing path, without loosening correlated replies', () => {
  const rejected={contractVersion:1,ok:false,command:null,requestId:null,error};
  assert.deepEqual(Reflect.apply(parsePrdResult,null,[rejected]),rejected);
  for (const bad of [{...rejected,requestId}, {...rejected,command:'ReadDocument'},
    {...rejected,error:{...error,message:secret}}, {...rejected,cause:secret}, result('ReadDocument')])
    assert.equal(Reflect.apply(parsePrdResult,null,[bad]),undefined);
  assert.equal(parsePrdResult(rejected,req('ReadDocument') as PrdRequest),undefined);
});

test('adversarial: snapshot envelope cannot substitute session, operation, generation or originating request', () => {
  for (const key of ['sessionId','operationId','generationId','requestId']) {
    assert.equal(parsePrdEvent({...event({type:'snapshot',snapshot}),[key]:id(99)}),undefined,`foreign ${key}`);
  }
});

test('adversarial: admitted operation belongs to this request and SendTurn session', () => {
  for (const command of ['CreatePrd','SendTurn','RetryWorkspaceSetup']) {
    const foreign={...operation,requestId:id(99)};
    const response=result(command,{snapshot:{...snapshot,operation:foreign},operation:foreign});
    assert.equal(parsePrdResult(response,req(command) as PrdRequest),undefined,command);
  }
  const foreign={...operation,sessionId:id(99)};
  const response=result('SendTurn',{snapshot:{...snapshot,operation:foreign,prd:{...snapshot.prd,session:{...snapshot.prd.session,sessionId:id(99)}}},operation:foreign});
  assert.equal(parsePrdResult(response,req('SendTurn') as PrdRequest),undefined);
});

test('close/launch/detach/recovery are exact, copied, bounded and do not grant arbitrary work', () => {
  const close={contractVersion:1,closeId:requestId};
  assert.deepEqual(parseCloseRequest(close),close);
  for (const decision of ['ready','blocked']) assert.deepEqual(parseCloseResponse({...close,decision},requestId),{...close,decision});
  assert.equal(parseCloseResponse({...close,decision:'ready'},id(88)),undefined);
  assert.equal(parseCloseResponse({...close,decision:'ready',save:{path:secret}},requestId),undefined);
  assert.deepEqual(parseProductLaunch({mode:'product'}),{mode:'product'});
  assert.deepEqual(parseProductLaunch({mode:'bootstrapFixture',fixtureRoot:'X:/owned/fixture'}),{mode:'bootstrapFixture',fixtureRoot:'X:/owned/fixture'});
  assert.equal(parseProductLaunch({mode:'product',fixtureRoot:secret}),undefined);
  assert.equal(parseProductLaunch({mode:'bootstrapFixture',fixtureRoot:'../outside'}),undefined);
  assert.deepEqual(parseDetach({contractVersion:1,subscriptionId}),{contractVersion:1,subscriptionId});
  const recovery={prdId,documentId,baseRevision:revision,text:'unsaved',retainedAt:now};
  assert.deepEqual(parseEditorRecovery(recovery),recovery);
  assert.equal(parseEditorRecovery({...recovery,metadataJson:secret}),undefined);
});
