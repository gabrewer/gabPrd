/** P01: private implementation seams. No adapter is implemented here; never preload this module. */
import type {
  CandidateRecord, CanonicalPath, CloseRequest, CloseResponse, CommandName, ConventionRecord,
  DefaultRepositoryRecord, DiskRevisionRecord, DocumentBody, DocumentId, DocumentRecord,
  DraftCandidatesPage, FilesystemIdentity, HistoryPage, OperationId, OperationRecord,
  PiLaunchConfig, PiUtilityCommand, PiUtilityEvent, PrdId, PrdRecord, PrdRequest, PrdResult,
  ProductOwnerMarker, RecordVersion, RepositoryId, RepositoryRecord, RequestId, SaveRecoveryRecord,
  SessionRecord, SkillBinding, StoreHealth, WorkspaceId, WorkspaceRecord,
} from '../shared/prd-contracts';
import type { ExpectedCaller, CallerIdentity } from '../shared/bootstrap-contracts';

/** Ports return fixed errors, not arbitrary thrown causes. Parent maps unexpected exceptions. */
export type PortResult<T> = Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: import('../shared/prd-contracts').PrdError }>;
export interface ProductRoots {
  readonly marker: ProductOwnerMarker; readonly database: CanonicalPath;
  readonly workspaces: CanonicalPath; readonly sessions: CanonicalPath; readonly recovery: CanonicalPath;
}
/** Synchronous transaction callback; no Git/provider/file effects or await across a DB transaction.
 * Implementations enforce both-direction linkage and expected versions before commit. */
export interface StoreTransaction {
  repository(id: RepositoryId): RepositoryRecord | null;
  workspace(id: WorkspaceId): WorkspaceRecord | null;
  prd(id: PrdId): PrdRecord | null;
  document(id: DocumentId): DocumentRecord | null;
  session(prdId: PrdId): SessionRecord | null;
  operation(id: OperationId): OperationRecord | null;
  operationByRequest(id: RequestId): OperationRecord | null;
  /** Most recently admitted operation for the PRD, including finished work after restart. */
  latestOperation(id: PrdId): OperationRecord | null;
  conventions(workspaceId: WorkspaceId): readonly ConventionRecord[];
  candidates(prdId: PrdId): readonly CandidateRecord[];
  skill(prdId: PrdId): SkillBinding | null;
  recovery(id: OperationId): SaveRecoveryRecord | null;
  settings(): DefaultRepositoryRecord;
  putRepository(record: RepositoryRecord): void;
  putWorkspace(record: WorkspaceRecord): void;
  putPrd(record: PrdRecord, expected: RecordVersion | null): void;
  putDocument(record: DocumentRecord): void;
  putSession(record: SessionRecord): void;
  putOperation(record: OperationRecord): void;
  putConvention(record: ConventionRecord): void;
  putCandidate(record: CandidateRecord): void;
  putSkill(prdId: PrdId, record: SkillBinding): void;
  putRecovery(record: SaveRecoveryRecord): void;
  putSettings(record: DefaultRepositoryRecord, expected: RecordVersion): void;
}
export interface PrdStorePort {
  open(userData: CanonicalPath): Promise<PortResult<Readonly<{ roots: ProductRoots; health: StoreHealth }>>>;
  transaction<T>(work: (tx: StoreTransaction) => PortResult<T>): PortResult<T>;
  list(cursor: import('../shared/prd-contracts').Cursor | null): PortResult<import('../shared/prd-contracts').PrdListPage>;
  /** Mark unfinished admissions interrupted, never replay effects. */
  recoverInterrupted(): PortResult<readonly OperationRecord[]>;
  close(): Promise<void>;
}
export interface VerifiedPath {
  readonly path: CanonicalPath; readonly identity: FilesystemIdentity;
}
export interface PrdPathsPort {
  verifyRoot(root: CanonicalPath): Promise<PortResult<VerifiedPath>>;
  verifyChild(root: VerifiedPath, relative: string, expected: FilesystemIdentity | null): Promise<PortResult<VerifiedPath>>;
  verifyLinks(repository: RepositoryRecord, workspace: WorkspaceRecord): Promise<PortResult<VerifiedPath>>;
}
export interface WorkspaceStepResult {
  readonly workspace: WorkspaceRecord; readonly operation: OperationRecord;
}
export interface PrdWorkspacePort {
  register(selectedCheckout: CanonicalPath): Promise<PortResult<RepositoryRecord>>;
  /** Read-only snapshot and immutable idea-derived branch, before durable provisioning admission. */
  plan(repository: RepositoryRecord, prdId: PrdId, workspaceId: WorkspaceId, operationId: OperationId, initialIdea: string): Promise<PortResult<WorkspaceRecord>>;
  /** Intent is already durable. Each step verifies previous links and records observed effects. */
  provision(repository: RepositoryRecord, workspace: WorkspaceRecord, operation: OperationRecord): Promise<PortResult<WorkspaceStepResult>>;
  retry(repository: RepositoryRecord, workspace: WorkspaceRecord, operation: OperationRecord): Promise<PortResult<WorkspaceStepResult>>;
  verify(repository: RepositoryRecord, workspace: WorkspaceRecord): Promise<PortResult<WorkspaceRecord>>;
  conventions(workspace: WorkspaceRecord): Promise<PortResult<readonly ConventionRecord[]>>;
  location(title: string, date: import('../shared/prd-contracts').CreationDate, convention: ConventionRecord): PortResult<import('../shared/prd-contracts').RelativeMarkdownPath>;
}
export interface DocumentSaveInput {
  readonly prd: PrdRecord; readonly workspace: WorkspaceRecord; readonly document: DocumentRecord;
  readonly operation: OperationRecord; readonly text: string;
}
export interface PrdDocumentsPort {
  inventory(prd: PrdRecord, workspace: WorkspaceRecord): Promise<PortResult<DraftCandidatesPage>>;
  candidates(prd: PrdRecord, workspace: WorkspaceRecord): Promise<PortResult<DraftCandidatesPage>>;
  register(prd: PrdRecord, workspace: WorkspaceRecord, candidate: CandidateRecord): Promise<PortResult<DocumentRecord>>;
  read(workspace: WorkspaceRecord, document: DocumentRecord): Promise<PortResult<DocumentBody>>;
  save(input: DocumentSaveInput): Promise<PortResult<Readonly<{ document: DocumentRecord; body: DocumentBody; recovery: SaveRecoveryRecord }>>>;
  reconcile(workspace: WorkspaceRecord, document: DocumentRecord): Promise<PortResult<Readonly<{ document: DocumentRecord; body: DocumentBody | null }>>>;
  recover(record: SaveRecoveryRecord): Promise<PortResult<SaveRecoveryRecord>>;
  fingerprint(path: VerifiedPath): Promise<PortResult<DiskRevisionRecord>>;
}
export interface PrdPiPort {
  /** Subscribe before start; main persists allocation before sending prompt. */
  onEvent(listener: (event: PiUtilityEvent) => void): () => void;
  launch(config: PiLaunchConfig): Promise<PortResult<void>>;
  send(command: PiUtilityCommand): Promise<PortResult<void>>;
  history(record: SessionRecord, cursor: import('../shared/prd-contracts').Cursor | null): Promise<PortResult<HistoryPage>>;
  /** Await foreground cancellation/dispose and owned exit; no global-writer-quiescence claim. */
  shutdown(): Promise<PortResult<Readonly<{ ownedExitConfirmed: true; backgroundWriters: 'unknown' }>>>;
}
/** Services receive current validated caller ownership, never renderer paths. */
export interface ProductCaller {
  readonly identity: CallerIdentity; readonly expected: ExpectedCaller;
  readonly destroyed: boolean;
}
export interface PrdServicePort {
  request<C extends CommandName>(caller: ProductCaller, request: PrdRequest<C>): Promise<PrdResult<C>>;
  detach(caller: ProductCaller, request: import('../shared/prd-contracts').DetachSubscriptionRequest): void;
  /** Register once per live frame; teardown detaches all subscriptions, not foreground work. */
  attach(caller: ProductCaller, listener: (event: import('../shared/prd-contracts').PrdEvent) => void): () => void;
  beginClose(caller: ProductCaller): CloseRequest;
  acknowledgeClose(caller: ProductCaller, response: CloseResponse): PortResult<void>;
  shutdown(): Promise<PortResult<void>>;
}
/** Correlation passed into fixed errors; error text is never a thrown cause. */
export type ErrorCorrelation = RequestId | OperationId;
