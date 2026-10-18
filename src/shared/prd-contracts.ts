/** PRD-001 v1 declarations only. See docs/design/prd-creation-contracts.md.
 * No runtime validation, SDK imports, filesystem authority or publication API. */
export const PRD_CONTRACT_VERSION = 1 as const;
export const PRD_CHANNELS = {
  request: 'gabprd.product.v1.request', event: 'gabprd.product.v1.event',
  detach: 'gabprd.product.v1.detach',
  closeRequest: 'gabprd.product.v1.close-request', closeResponse: 'gabprd.product.v1.close-response',
} as const;
export const PRD_LIMITS = {
  listItems: 50, historyItems: 100, candidateItems: 32, conventionItems: 32,
  pageBytes: 512 * 1024, documentBytes: 2 * 1024 * 1024,
  inputBytes: 64 * 1024, skillBytes: 256 * 1024, displayNameBytes: 160, filenameBytes: 200,
  displayPathBytes: 4096, relativePathBytes: 1024, cursorBytes: 256, identityBytes: 128,
  historyTextBytes: 64 * 1024, eventBytes: 64 * 1024, deltaBytes: 8 * 1024,
  uiOptions: 32, uiTextBytes: 16 * 1024, candidatePreviewBytes: 8 * 1024, candidateScanFiles: 4096,
  sessionBytes: 64 * 1024 * 1024, sessionLineBytes: 2 * 1024 * 1024,
  eventQueueItems: 256, eventQueueBytes: 512 * 1024, replayRequests: 256,
  startupTimeoutMs: 30_000, shutdownTimeoutMs: 10_000,
} as const;
export const PRD_ERROR_MESSAGES = {
  INVALID_REQUEST: 'This request is not valid.',
  UNAUTHORIZED_CALLER: 'This window cannot request this action.',
  NOT_FOUND: 'The requested item is not available.',
  LINK_CHANGED: 'The workspace association changed. Your existing work was kept.',
  PATH_INVALID: 'The document location could not be verified.',
  BASE_UNAVAILABLE: 'The latest origin/main could not be fetched. No older base was used.',
  WORKSPACE_PARTIAL: 'Workspace setup needs recovery. Existing files were kept.',
  SKILL_UNAVAILABLE: 'The configured brainstorm skill is missing or unreadable.',
  CONFIG_INCOMPATIBLE: 'The configured Pi resources cannot be supported by this build.',
  SESSION_MISSING: 'The saved conversation is missing. It was not replaced.',
  SESSION_CORRUPT: 'The saved conversation could not be verified. It was not reset.',
  STORE_READ_ONLY: 'Application data needs recovery. Changes are unavailable.',
  STALE_VERSION: 'This view is out of date. Refresh before trying again.',
  REVISION_CONFLICT: 'The file changed. Your unsaved text was kept; review both versions.',
  BUSY: 'Another application action is still finishing.',
  LIMIT_EXCEEDED: 'This item exceeds the supported size. Existing work was kept.',
  PROVIDER_UNAVAILABLE: 'Pi could not complete this turn. Saved work was kept.',
  UTILITY_TIMEOUT: 'Pi startup or shutdown did not finish within its time limit.',
  INTERRUPTED: 'The action was interrupted. Review saved work before trying again.',
  INTERNAL: 'The action could not finish safely. Existing work was kept.',
} as const;
export type PrdErrorCode = keyof typeof PRD_ERROR_MESSAGES;
export type PrdError = { readonly [C in PrdErrorCode]: Readonly<{
  code: C; message: (typeof PRD_ERROR_MESSAGES)[C]; correlationId: RequestId | OperationId;
}> }[PrdErrorCode];

declare const prdBrand: unique symbol;
export type Opaque<T extends string> = string & { readonly [prdBrand]: T };
export type RepositoryId = Opaque<'RepositoryId'>;
export type WorkspaceId = Opaque<'WorkspaceId'>;
export type PrdId = Opaque<'PrdId'>;
export type DocumentId = Opaque<'DocumentId'>;
export type SessionId = Opaque<'SessionId'>;
export type RequestId = Opaque<'RequestId'>;
export type OperationId = Opaque<'OperationId'>;
export type GenerationId = Opaque<'GenerationId'>;
export type SubscriptionId = Opaque<'SubscriptionId'>;
export type CandidateId = Opaque<'CandidateId'>;
export type ConventionId = Opaque<'ConventionId'>;
export type QuestionId = Opaque<'QuestionId'>;
export type OptionId = Opaque<'OptionId'>;
export type MessageId = Opaque<'MessageId'>;
export type HistoryEntryId = Opaque<'HistoryEntryId'>;
export type Cursor = Opaque<'Cursor'>;
export type RecordVersion = Opaque<'RecordVersion'>;
export type DocumentRevision = Opaque<'DocumentRevision'>;
export type EventSequence = number & { readonly [prdBrand]: 'EventSequence' };
export type IsoInstant = Opaque<'IsoInstant'>;
export type CreationDate = Opaque<'CreationDate'>;
export type RelativeMarkdownPath = Opaque<'RelativeMarkdownPath'>;
export type PrdLifecycle = 'createPending' | 'brainstormActive' | 'draftAvailable' | 'failed' | 'interrupted';
export type WorkspaceState = 'planned' | 'baseFetched' | 'branchCreated' | 'worktreeCreated' | 'ready' | 'recoveryRequired';
export type StoreHealth = Readonly<{ state: 'initializing' | 'ready' }> | Readonly<{
  state: 'readOnlyRecovery'; reason: 'missingExpectedDatabase' | 'corruptDatabase'
    | 'foreignOwnership' | 'unsupportedSchema' | 'incompleteInitialization';
}>;
export type SessionView = Readonly<{ state: 'notAllocated' }> | Readonly<{
  state: 'allocated' | 'materialized' | 'missing' | 'corrupt' | 'linkageMismatch'; sessionId: SessionId;
  lastPersistedEntryId: HistoryEntryId | null;
}>;
export type DocumentView = Readonly<{ state: 'notRegistered' }> | Readonly<{
  state: 'available'; documentId: DocumentId; relativePath: RelativeMarkdownPath;
  revision: DocumentRevision; byteLength: number;
}> | Readonly<{
  state: 'missing' | 'invalid'; documentId: DocumentId; relativePath: RelativeMarkdownPath;
}>;
export type OperationKind = 'create' | 'brainstorm' | 'send' | 'piRevision' | 'save' | 'reopen' | 'cancel' | 'reconcile' | 'workspaceRetry';
export type OperationPhase = 'starting' | 'running' | 'awaitingUiResponse' | 'cancelling' | 'reconciling' | 'finished';
export type OperationOutcome = 'succeeded' | 'cancelled' | 'failed' | 'interrupted' | 'handledWithoutRun';
export type OperationView = Readonly<{
  operationId: OperationId; requestId: RequestId; prdId: PrdId;
  sessionId: SessionId | null; generationId: GenerationId | null; kind: OperationKind;
}> & (
  Readonly<{ phase: Exclude<OperationPhase, 'finished'>; outcome: null; error: null }>
  | Readonly<{ phase: 'finished'; outcome: 'succeeded' | 'cancelled' | 'handledWithoutRun'; error: null }>
  | Readonly<{ phase: 'finished'; outcome: 'failed' | 'interrupted'; error: PrdError }>
);
export interface RepositoryView {
  readonly repositoryId: RepositoryId; readonly displayName: string; readonly verifiedDisplayPath: string;
}
export interface DefaultRepositoryView {
  readonly version: RecordVersion; readonly repository: RepositoryView | null;
}
export interface ConventionView {
  readonly conventionId: ConventionId; readonly relativeFolder: string;
}
export interface PrdSummary {
  readonly prdId: PrdId; readonly workspaceId: WorkspaceId; readonly repository: RepositoryView;
  readonly version: RecordVersion; readonly displayName: string; readonly creationDate: CreationDate;
  readonly lifecycle: PrdLifecycle; readonly workspaceState: WorkspaceState;
  readonly document: DocumentView; readonly session: SessionView;
  readonly publication: 'unavailable';
}
export interface PrdSnapshot {
  readonly prd: PrdSummary; readonly store: StoreHealth; readonly operation: OperationView | null;
  readonly pendingQuestion: UiQuestion | null; readonly sequence: EventSequence;
  readonly draftLocation: Readonly<{ state: 'unresolved'; choices: readonly ConventionView[] }>
    | Readonly<{ state: 'resolved'; convention: ConventionView; relativePath: RelativeMarkdownPath }>;
  readonly editorAccess: 'editable' | 'foregroundReadOnly' | 'recoveryReadOnly';
  readonly externalWriters: 'unknown';
}
export interface Page<T> {
  readonly items: readonly T[]; readonly nextCursor: Cursor | null;
  readonly coverage: 'complete' | 'more' | 'scanLimit';
}
export interface PrdListPage extends Page<PrdSummary> {
  readonly defaultRepository: DefaultRepositoryView; readonly store: StoreHealth;
}
export interface DraftCandidate {
  readonly candidateId: CandidateId; readonly relativePath: RelativeMarkdownPath;
  readonly conventionId: ConventionId; readonly revision: DocumentRevision;
  readonly byteLength: number; readonly observedAt: IsoInstant;
  readonly previewText: string; readonly previewStatus: 'complete' | 'truncated';
}
export interface DraftCandidatesPage extends Page<DraftCandidate> {
  readonly version: RecordVersion; readonly conventions: readonly ConventionView[];
}
export interface DocumentBody {
  readonly documentId: DocumentId; readonly relativePath: RelativeMarkdownPath;
  readonly revision: DocumentRevision; readonly text: string; readonly byteLength: number;
}
/** Renderer-local structured recovery only; not an IPC payload or an SDK transcript. */
export interface EditorRecoveryBuffer {
  readonly prdId: PrdId; readonly documentId: DocumentId;
  readonly baseRevision: DocumentRevision; readonly text: string; readonly retainedAt: IsoInstant;
}
export interface HistoryItem {
  readonly entryId: HistoryEntryId; readonly messageId: MessageId;
  readonly role: 'writer' | 'assistant' | 'extension'; readonly text: string;
  readonly textStatus: 'complete' | 'truncated'; readonly persistedAt: IsoInstant;
}
export interface HistoryPage extends Page<HistoryItem> {
  readonly sessionId: SessionId; readonly lastPersistedEntryId: HistoryEntryId | null;
}
export type UiQuestion = Readonly<{ questionId: QuestionId; title: string; deadline: IsoInstant | null }> & (
  Readonly<{ kind: 'select'; options: readonly Readonly<{ optionId: OptionId; label: string }>[] }>
  | Readonly<{ kind: 'confirm'; message: string }>
  | Readonly<{ kind: 'input'; placeholder: string | null }>
  | Readonly<{ kind: 'editor'; prefill: string }>
);
export type UiAnswer = Readonly<{ kind: 'select'; optionId: OptionId }>
  | Readonly<{ kind: 'confirm'; confirmed: boolean }>
  | Readonly<{ kind: 'input' | 'editor'; text: string }>
  | Readonly<{ kind: 'cancel' }>;
export interface PrdTarget { readonly prdId: PrdId }
export interface VersionedPrdTarget extends PrdTarget { readonly expectedVersion: RecordVersion }
export interface DocumentTarget extends PrdTarget { readonly documentId: DocumentId }
export interface DocumentExpectation {
  readonly expectedDocumentRevision: DocumentRevision | null;
}

/** Exact fields per command. No arbitrary renderer paths/options/environment/SQL. */
export interface PrdCommandBodies {
  NativePickRepository: Readonly<Record<never, never>>;
  SetDefaultRepository: Readonly<{ repositoryId: RepositoryId | null; expectedVersion: RecordVersion }>;
  ListPrds: Readonly<{ cursor: Cursor | null }>;
  CreatePrd: Readonly<{ repositoryId: RepositoryId; idea: string }>;
  OpenPrd: PrdTarget & Readonly<{ subscriptionId: SubscriptionId }>;
  ReadHistory: PrdTarget & Readonly<{ sessionId: SessionId; cursor: Cursor | null }>;
  ReadDocument: DocumentTarget;
  SaveDocument: DocumentTarget & VersionedPrdTarget & Readonly<{
    expectedDocumentRevision: DocumentRevision; text: string;
  }>;
  ListDraftCandidates: PrdTarget & Readonly<{ cursor: Cursor | null }>;
  SelectDraft: VersionedPrdTarget & (
    Readonly<{ selection: 'convention'; conventionId: ConventionId; expectedDocumentRevision: null }>
    | Readonly<{ selection: 'candidate'; candidateId: CandidateId; expectedDocumentRevision: DocumentRevision }>
  );
  SendTurn: VersionedPrdTarget & DocumentExpectation & Readonly<{
    sessionId: SessionId; text: string; intent: 'conversation' | 'reviseDocument';
  }>;
  AnswerUiQuestion: VersionedPrdTarget & Readonly<{
    sessionId: SessionId; operationId: OperationId; generationId: GenerationId;
    questionId: QuestionId; answer: UiAnswer;
  }>;
  CancelOperation: PrdTarget & Readonly<{ operationId: OperationId }>;
  ReconcilePrd: PrdTarget;
  RetryWorkspaceSetup: VersionedPrdTarget & Readonly<{ setupOperationId: OperationId }>;
}
export type CommandName = keyof PrdCommandBodies;
export type PrdRequest<K extends CommandName = CommandName> = {
  readonly [C in K]: Readonly<{ contractVersion: typeof PRD_CONTRACT_VERSION; requestId: RequestId; command: C }>
    & PrdCommandBodies[C]
}[K];
export interface PrdCommandReplies {
  NativePickRepository: Readonly<{ outcome: 'cancelled' }> | Readonly<{ outcome: 'selected'; repository: RepositoryView }>;
  SetDefaultRepository: DefaultRepositoryView;
  ListPrds: PrdListPage;
  CreatePrd: Readonly<{ snapshot: PrdSnapshot; operation: OperationView }>;
  OpenPrd: Readonly<{ subscriptionId: SubscriptionId; snapshot: PrdSnapshot }>;
  ReadHistory: HistoryPage;
  ReadDocument: DocumentBody;
  SaveDocument: Readonly<{ snapshot: PrdSnapshot; document: DocumentBody }>;
  ListDraftCandidates: DraftCandidatesPage;
  SelectDraft: Readonly<{ snapshot: PrdSnapshot; document: DocumentBody | null; operation: OperationView | null }>;
  SendTurn: Readonly<{ snapshot: PrdSnapshot; operation: OperationView }>;
  AnswerUiQuestion: Readonly<{ outcome: 'answered' | 'cancelRequested' }>;
  CancelOperation: Readonly<{ outcome: 'cancelRequested' | 'alreadyFinished'; operation: OperationView }>;
  ReconcilePrd: PrdSnapshot;
  RetryWorkspaceSetup: Readonly<{ snapshot: PrdSnapshot; operation: OperationView }>;
}
export type PrdResult<K extends CommandName = CommandName> = {
  readonly [C in K]: Readonly<{ contractVersion: typeof PRD_CONTRACT_VERSION }> & (
    Readonly<{ ok: true; command: C; requestId: RequestId; value: PrdCommandReplies[C] }>
    | Readonly<{ ok: false; command: C | null; requestId: RequestId | null; error: PrdError }>
  )
}[K];
export interface EventContext {
  readonly subscriptionId: SubscriptionId; readonly requestId: RequestId | null;
  readonly prdId: PrdId; readonly sessionId: SessionId | null;
  readonly operationId: OperationId | null; readonly generationId: GenerationId | null;
  readonly sequence: EventSequence; readonly version: RecordVersion;
}
export type PrdEventBody = Readonly<{ type: 'snapshot'; snapshot: PrdSnapshot }>
  | Readonly<{ type: 'operation'; operation: OperationView }>
  | Readonly<{ type: 'textDelta'; messageId: MessageId; delta: string }>
  | Readonly<{ type: 'textFinalized'; messageId: MessageId; text: string; textStatus: 'complete' | 'truncated'; durability: 'unconfirmed' }>
  | Readonly<{ type: 'historyPersisted'; lastPersistedEntryId: HistoryEntryId }>
  | Readonly<{ type: 'uiQuestion'; question: UiQuestion }>
  | Readonly<{ type: 'uiQuestionDismissed'; questionId: QuestionId; reason: 'answered' | 'cancelled' | 'expired' | 'operationEnded' }>
  | Readonly<{ type: 'documentChanged'; document: DocumentView; version: RecordVersion; cause: 'appSave' | 'filesystemObserved' | 'reconciliation' }>
  | Readonly<{ type: 'resyncRequired'; reason: 'sequenceGap' | 'backpressure' | 'restart' }>
  | Readonly<{ type: 'error'; error: PrdError }>;
export type PrdEvent = Readonly<{ contractVersion: typeof PRD_CONTRACT_VERSION }> & EventContext & PrdEventBody;
export interface DetachSubscriptionRequest {
  readonly contractVersion: typeof PRD_CONTRACT_VERSION; readonly subscriptionId: SubscriptionId;
}
/** Proposed sibling window.gabPrd.prds, not a replacement for bootstrap.
 * Functions are bound separately by preload; this is not a generic invoke API. */
export type PrdBridge = {
  readonly [C in CommandName as Uncapitalize<C>]: (request: PrdRequest<C>) => Promise<PrdResult<C>>
} & {
  readonly onEvent: (listener: (event: PrdEvent) => void) => (() => void);
  readonly detachSubscription: (request: DetachSubscriptionRequest) => Promise<void>;
  readonly onCloseRequested: (listener: (request: CloseRequest) => void) => (() => void);
  readonly acknowledgeClose: (response: CloseResponse) => Promise<void>;
};
/** Main initiates; acknowledgement grants no mutation authority. Save uses SaveDocument. */
export interface CloseRequest {
  readonly contractVersion: typeof PRD_CONTRACT_VERSION; readonly closeId: RequestId;
}
export interface CloseResponse extends CloseRequest { readonly decision: 'ready' | 'blocked' }

// PRIVATE MAIN/UTILITY/STORE ONLY BELOW. Never expose these records as renderer DTOs.
export type CanonicalPath = Opaque<'CanonicalPath'>;
export type FilesystemIdentity = Readonly<{ device: string; fileId: string; birthtimeNs: string }>;
export type GitSha = Opaque<'GitSha'>;
export type InstallationId = Opaque<'InstallationId'>;
/** Main-only launch discrimination. Fixture mode is explicitly opted in, never the default. */
export type ProductLaunch = Readonly<{ mode: 'product' }>
  | Readonly<{ mode: 'bootstrapFixture'; fixtureRoot: CanonicalPath }>;
export interface ConventionRecord extends ConventionView {
  readonly workspaceId: WorkspaceId; readonly source: 'instructions' | 'existing' | 'fallback';
  readonly selected: boolean;
}
export interface CandidateRecord extends DraftCandidate {
  readonly prdId: PrdId; readonly scanOperationId: OperationId;
  readonly fingerprint: DiskRevisionRecord; readonly preexisting: boolean;
}
export interface SaveRecoveryRecord {
  readonly operationId: OperationId; readonly documentId: DocumentId;
  readonly baseRevision: DocumentRevision; readonly intendedSha256: Opaque<'Sha256'>;
  readonly preimagePath: CanonicalPath; readonly intendedPath: CanonicalPath;
  readonly phase: 'reserved' | 'prepared' | 'replaced' | 'verified' | 'uncertain';
}
export interface ProductOwnerMarker {
  readonly schemaVersion: 1; readonly installationId: InstallationId;
  readonly canonicalRoot: CanonicalPath; readonly initializationState: 'initializing' | 'ready';
  readonly databaseExpected: boolean;
}
export interface RepositoryRecord {
  readonly repositoryId: RepositoryId; readonly checkoutRoot: CanonicalPath;
  readonly commonGitDir: CanonicalPath; readonly checkoutIdentity: FilesystemIdentity;
  readonly commonGitIdentity: FilesystemIdentity; readonly originFingerprint: Opaque<'OriginFingerprint'>;
}
export interface WorkspaceRecord {
  readonly workspaceId: WorkspaceId; readonly repositoryId: RepositoryId;
  readonly worktreePath: CanonicalPath; readonly gitDir: CanonicalPath | null;
  readonly worktreeIdentity: FilesystemIdentity | null; readonly gitDirIdentity: FilesystemIdentity | null;
  readonly originalHeadSha: GitSha; readonly originalBranchRef: string | null;
  readonly originalIndexHash: Opaque<'Sha256'>; readonly originalTrackedChangesHash: Opaque<'Sha256'>;
  readonly branchRef: string; readonly baseRef: 'refs/remotes/origin/main'; readonly baseSha: GitSha | null;
  readonly creationOperationId: OperationId; readonly state: WorkspaceState;
}
export interface DiskRevisionRecord {
  readonly token: DocumentRevision; readonly identity: FilesystemIdentity;
  readonly sha256: Opaque<'Sha256'>; readonly byteLength: number; readonly mtimeNs: string;
}
export interface DocumentRecord {
  readonly documentId: DocumentId; readonly prdId: PrdId; readonly relativePath: RelativeMarkdownPath;
  readonly conventionId: ConventionId; readonly revision: DiskRevisionRecord;
  readonly state: 'available' | 'missing' | 'invalid';
}
export interface SessionRecord {
  readonly prdId: PrdId; readonly sessionId: SessionId; readonly exactPath: CanonicalPath;
  readonly appSessionDir: CanonicalPath; readonly expectedCwd: CanonicalPath;
  readonly state: Exclude<SessionView['state'], 'notAllocated'>;
  readonly headerVersion: number | null; readonly lastPersistedEntryId: HistoryEntryId | null;
}
export interface PrdRecord {
  readonly prdId: PrdId; readonly workspaceId: WorkspaceId; readonly displayName: string;
  readonly creationDate: CreationDate; readonly version: RecordVersion; readonly lifecycle: PrdLifecycle;
  readonly initialIdea: string; readonly conventionId: ConventionId | null;
  readonly plannedRelativePath: RelativeMarkdownPath | null; readonly eventSequence: EventSequence;
  readonly documentId: DocumentId | null; readonly sessionId: SessionId | null;
}
export type ExternalStep = 'fetchBase' | 'createBranch' | 'createWorktree' | 'allocateSession'
  | 'prompt' | 'saveDocument' | 'reconcile' | 'closeUtility';
export type OperationRecord = OperationView & DocumentExpectation & Readonly<{
  expectedVersion: RecordVersion; lastSequence: EventSequence;
  step: ExternalStep; stepState: 'intent' | 'effectVerified' | 'uncertain';
  recoveryDirectory: CanonicalPath | null;
}>;
export interface DefaultRepositoryRecord {
  readonly version: RecordVersion; readonly repositoryId: RepositoryId | null;
  readonly lastRequestId: RequestId | null;
}
export interface SkillBinding {
  readonly name: 'brainstorm'; readonly sourcePath: CanonicalPath; readonly baseDir: CanonicalPath;
  readonly identity: FilesystemIdentity; readonly contentSha256: Opaque<'Sha256'>;
  readonly source: 'worktreeConfigured' | 'worktreeDiscovered' | 'userConfigured' | 'userDiscovered' | 'package' | 'extension';
}
export interface PiLaunchConfig {
  readonly packagedEntry: CanonicalPath; readonly packagedSdkRoot: CanonicalPath;
  readonly worktreeCwd: CanonicalPath; readonly existingAgentDir: CanonicalPath;
  readonly appSessionDir: CanonicalPath; readonly resourcePolicy: 'normalWorktreeAndUser';
  readonly capabilities: 'normalConfigured';
}
export interface PiCorrelation {
  readonly requestId: RequestId; readonly prdId: PrdId;
  readonly operationId: OperationId; readonly generationId: GenerationId;
}
export type PiUtilityCommand = Readonly<{ contractVersion: typeof PRD_CONTRACT_VERSION }> & PiCorrelation & (
  Readonly<{ type: 'pi.start'; config: PiLaunchConfig; session:
    Readonly<{ mode: 'create' }> | Readonly<{ mode: 'open' | 'resumeAllocated'; record: SessionRecord }> }>
  | Readonly<{ type: 'pi.prompt'; sessionId: SessionId; input:
    Readonly<{ kind: 'brainstorm'; binding: SkillBinding; idea: string; convention: ConventionView; relativePath: RelativeMarkdownPath; creationDate: CreationDate }>
    | Readonly<{ kind: 'literalTurn'; text: string }> }>
  | Readonly<{ type: 'pi.answer'; sessionId: SessionId; questionId: QuestionId; answer: UiAnswer }>
  | Readonly<{ type: 'pi.abort'; sessionId: SessionId }>
  | Readonly<{ type: 'pi.reconcile'; sessionId: SessionId }>
  | Readonly<{ type: 'pi.ack'; sessionId: SessionId | null; throughSequence: EventSequence }>
  | Readonly<{ type: 'pi.close'; sessionId: SessionId | null }>
);
export type PiUtilityEvent = Readonly<{ contractVersion: typeof PRD_CONTRACT_VERSION; sequence: EventSequence }>
  & PiCorrelation & (
    Readonly<{ type: 'pi.sessionAllocated'; record: SessionRecord }>
    | Readonly<{ type: 'pi.ready'; sessionId: SessionId; binding: SkillBinding; capabilities: 'normalConfigured' }>
    | Readonly<{ type: 'pi.projection'; sessionId: SessionId; event: Exclude<PrdEventBody,
        { type: 'snapshot' | 'documentChanged' | 'resyncRequired' | 'operation' }> }>
    | Readonly<{ type: 'pi.documentHint'; sessionId: SessionId; relativePath: RelativeMarkdownPath; source: 'toolArgument' | 'filesystemObserved' }>
    | Readonly<{ type: 'pi.settled'; sessionId: SessionId; outcome: OperationOutcome; foregroundIdle: true; backgroundWriters: 'unknown' }>
    | Readonly<{ type: 'pi.reconciled'; record: SessionRecord; foregroundIdle: boolean; backgroundWriters: 'unknown' }>
    | Readonly<{ type: 'pi.failure'; sessionId: SessionId | null; error: PrdError }>
    | Readonly<{ type: 'pi.closing'; sessionId: SessionId | null; abortAwaited: boolean }>
  );
