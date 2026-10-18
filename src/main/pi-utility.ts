import { app, utilityProcess } from 'electron';
import type { UtilityProcess } from 'electron';
import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import type { Stats } from 'node:fs';
import path from 'node:path';
import { SHUTDOWN_TIMEOUT_MS, UTILITY_TIMEOUT_MS } from '../shared/bootstrap-contracts';
import type { BootstrapController, FixtureContext } from '../shared/bootstrap-contracts';
import { parseUtilityInit, parseUtilityResult, safeError } from '../shared/bootstrap-validation';
import { validateFixture } from './fixture-root';
import type {PrdPiPort,PortResult} from './prd-ports';
import type {PiUtilityEvent,PiUtilityCommand,PiLaunchConfig,SessionRecord,Cursor,HistoryPage} from '../shared/prd-contracts';
import {storeFailure,requireStore,StoreFault} from './prd-schema';
import {randomUUID} from 'node:crypto';
import {PRD_LIMITS as PRODUCT_LIMITS,PRD_ERROR_MESSAGES} from '../shared/prd-contracts';
import type {PiCorrelation,PrdError,PrdErrorCode,SessionId} from '../shared/prd-contracts';
import {parsePiCommand,parsePiEvent} from '../shared/prd-validation';
import {readPiCorrelation} from '../pi-utility/prd-session';
import {readPrdHistory} from '../pi-utility/prd-history';
import {verifyPackagedFile} from '../pi-utility/prd-resources';
import {verifiedDirectory} from './prd-paths';

/** Product utility: actual owned child, normal auth/resources, separate app sessions. */
export class PrdPiUtility implements PrdPiPort {
 private child?:UtilityProcess;private ownedPid:number|undefined;private config?:PiLaunchConfig;private correlation?:PiCorrelation;private sessionId:SessionId|null=null;private sequence=0;private phase:'unlaunched'|'launched'|'starting'|'ready'|'running'|'settled'|'closing'|'exited'='unlaunched';
 private readonly listeners=new Set<(event:PiUtilityEvent)=>void>();private readonly known=new Map<string,PiCorrelation>();private readonly prompted=new Set<string>();private stopping=false;private exited=false;private closingAwaited=false;private quarantined=false;private terminalCode:PrdErrorCode='INTERRUPTED';private deadline:ReturnType<typeof setTimeout>|undefined;private shutdownPromise?:Promise<PortResult<{ownedExitConfirmed:true;backgroundWriters:'unknown'}>>;
 private resolveExit:()=>void=()=>{};private readonly exit=new Promise<void>(resolve=>{this.resolveExit=resolve;});
 private error(code:PrdErrorCode):PrdError{return {code,message:PRD_ERROR_MESSAGES[code],correlationId:this.correlation?.operationId??randomUUID()} as PrdError;}
 private reject<T>(code:PrdErrorCode):PortResult<T>{return {ok:false,error:this.error(code)};}
 private clearDeadline(){if(this.deadline!==undefined)clearTimeout(this.deadline);this.deadline=undefined;}
 private publish(event:PiUtilityEvent){for(const listener of [...this.listeners])try{listener(event);}catch{/* Consumer failure cannot leak causes or change child ownership. */}}
 private kill(){if(this.child&&!this.exited)try{this.child.kill();}catch{/* Only actual exit confirms termination. */}}
 private quarantine(code:PrdErrorCode){if(this.quarantined)return;this.quarantined=true;this.terminalCode=code;this.clearDeadline();if(this.correlation){const event=parsePiEvent({contractVersion:1,...this.correlation,type:'pi.failure',sequence:++this.sequence,sessionId:this.sessionId,error:this.error(code)},this.correlation);if(event)this.publish(event);}this.kill();}
 private receive(value:unknown){
  if(this.quarantined||this.exited)return;const correlation=readPiCorrelation(value);if(!correlation)return;const expected=this.known.get(correlation.generationId);if(!expected)return;const event=parsePiEvent(value,expected);if(!event)return;
  if(event.sequence!==this.sequence+1){this.quarantine('INTERRUPTED');return;}this.sequence=event.sequence;
  if(!this.correlation||event.requestId!==this.correlation.requestId||event.operationId!==this.correlation.operationId||event.generationId!==this.correlation.generationId){if(this.correlation&&this.sessionId)try{this.child?.postMessage({contractVersion:1,...this.correlation,type:'pi.ack',sessionId:this.sessionId,throughSequence:event.sequence});}catch{this.quarantine('INTERRUPTED');}return;}
  if('record'in event){if(!this.config||event.record.prdId!==event.prdId||event.record.appSessionDir!==this.config.appSessionDir||event.record.expectedCwd!==this.config.worktreeCwd||this.sessionId&&this.sessionId!==event.record.sessionId){this.quarantine('LINK_CHANGED');return;}this.sessionId=event.record.sessionId;}
  if('sessionId'in event&&event.sessionId!==null&&this.sessionId!==event.sessionId){this.quarantine('LINK_CHANGED');return;}
  if(event.type==='pi.ready'){this.clearDeadline();this.phase='ready';}if(event.type==='pi.failure')this.clearDeadline();if(event.type==='pi.settled')this.phase='settled';if(event.type==='pi.closing'){this.phase='closing';try{this.child!.postMessage({contractVersion:1,...expected,type:'pi.ack',sessionId:event.sessionId,throughSequence:event.sequence});this.closingAwaited=event.abortAwaited;}catch{this.quarantine('INTERRUPTED');return;}}this.publish(event);
 }
 onEvent(listener:(event:PiUtilityEvent)=>void):()=>void{this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};}
 async launch(input:PiLaunchConfig):Promise<PortResult<void>>{
  try{
   requireStore(app.isReady()&&this.phase==='unlaunched','BUSY');const correlation:PiCorrelation={requestId:randomUUID() as PiCorrelation['requestId'],prdId:randomUUID() as PiCorrelation['prdId'],operationId:randomUUID() as PiCorrelation['operationId'],generationId:randomUUID() as PiCorrelation['generationId']};const parsed=parsePiCommand({contractVersion:1,...correlation,type:'pi.start',config:input,session:{mode:'create'}},correlation);requireStore(parsed?.type==='pi.start','INVALID_REQUEST');const config=parsed.config,root=app.getAppPath();requireStore(config.packagedEntry===path.join(root,'.webpack/main/pi-utility.cjs')&&config.packagedSdkRoot===path.join(root,'node_modules/@earendil-works/pi-coding-agent'),'CONFIG_INCOMPATIBLE');
   verifyPackagedFile(config.packagedEntry,root);verifyPackagedFile(path.join(config.packagedSdkRoot,'package.json'),root);verifyPackagedFile(path.join(config.packagedSdkRoot,'dist/index.js'),root);verifiedDirectory(config.worktreeCwd);verifiedDirectory(config.existingAgentDir);verifiedDirectory(config.appSessionDir);this.config=config;
   const env={...process.env};for(const key of Object.keys(env))if(['PI_PACKAGE_DIR','NODE_OPTIONS','NODE_PATH','ELECTRON_RUN_AS_NODE'].includes(key.toUpperCase()))delete env[key];env.PI_CODING_AGENT_DIR=config.existingAgentDir;env.PI_CODING_AGENT_SESSION_DIR=config.appSessionDir;
   const child=utilityProcess.fork(config.packagedEntry,['--prd-utility'],{cwd:config.worktreeCwd,env,execArgv:[],serviceName:'gabPrd Pi session',stdio:['ignore','pipe','pipe']});this.child=child;this.phase='launched';for(const stream of [child.stdout,child.stderr]){stream?.on('data',()=>{});stream?.on('error',()=>{});}child.on('message',(value:unknown)=>this.receive(value));
   return await new Promise<PortResult<void>>(resolve=>{let settled=false;const finish=(r:PortResult<void>)=>{if(settled)return;settled=true;resolve(r);};child.once('spawn',()=>{this.ownedPid=child.pid;if(this.stopping||this.quarantined)this.kill();finish({ok:true,value:undefined});});child.on('error',()=>{this.quarantine('INTERRUPTED');finish(this.reject('INTERRUPTED'));});child.once('exit',()=>{this.exited=true;this.phase='exited';this.resolveExit();this.clearDeadline();if(!this.stopping)this.quarantine('INTERRUPTED');finish(this.reject('INTERRUPTED'));});this.deadline=setTimeout(()=>{this.quarantine('UTILITY_TIMEOUT');finish(this.reject('UTILITY_TIMEOUT'));},PRODUCT_LIMITS.startupTimeoutMs);});
  }catch(error){return this.reject(error instanceof StoreFault?error.code:'CONFIG_INCOMPATIBLE');}
 }
 async send(value:PiUtilityCommand):Promise<PortResult<void>>{
  try{
   const correlation=readPiCorrelation(value),command=correlation&&parsePiCommand(value,correlation);requireStore(command,'INVALID_REQUEST');requireStore(this.child&&!this.exited&&!this.quarantined&&!this.stopping,'INTERRUPTED');
   if(command.type==='pi.start'){requireStore(!this.correlation&&this.phase==='launched'&&JSON.stringify(command.config)===JSON.stringify(this.config),'LINK_CHANGED');this.correlation=correlation;this.known.set(command.generationId,correlation);this.phase='starting';if(command.session.mode!=='create')this.sessionId=command.session.record.sessionId;}
   else{
    requireStore(this.correlation&&command.prdId===this.correlation.prdId&&(command.sessionId===this.sessionId||command.type==='pi.close'&&command.sessionId===null),'LINK_CHANGED');
    if(command.type==='pi.prompt'){requireStore(this.phase==='ready'||this.phase==='settled','BUSY');requireStore(!this.prompted.has(command.generationId),'INVALID_REQUEST');this.correlation=correlation;this.known.set(command.generationId,correlation);this.prompted.add(command.generationId);if(this.known.size>PRODUCT_LIMITS.replayRequests)this.known.delete(this.known.keys().next().value!);if(this.prompted.size>PRODUCT_LIMITS.replayRequests)this.prompted.delete(this.prompted.values().next().value!);this.phase='running';}
    else requireStore(['requestId','operationId','generationId'].every(key=>command[key as keyof PiCorrelation]===this.correlation![key as keyof PiCorrelation]),'INVALID_REQUEST');
    if(command.type==='pi.ack')requireStore(command.throughSequence<=this.sequence,'INVALID_REQUEST');if(command.type==='pi.close'){this.stopping=true;this.phase='closing';}
   }
   this.child.postMessage(command);return {ok:true,value:undefined};
  }catch(error){return this.reject(error instanceof StoreFault?error.code:'INTERRUPTED');}
 }
 async history(record:SessionRecord,cursor:Cursor|null):Promise<PortResult<HistoryPage>>{if(this.config&&(record.expectedCwd!==this.config.worktreeCwd||record.appSessionDir!==this.config.appSessionDir))return this.reject('LINK_CHANGED');return readPrdHistory(record,cursor);}
 shutdown():Promise<PortResult<{ownedExitConfirmed:true;backgroundWriters:'unknown'}>>{
  if(this.shutdownPromise)return this.shutdownPromise;this.shutdownPromise=(async()=>{
   this.stopping=true;this.clearDeadline();if(!this.child)return {ok:true,value:{ownedExitConfirmed:true,backgroundWriters:'unknown'}} as const;if(this.exited&&!this.closingAwaited)return this.reject('INTERRUPTED');
   const end=Date.now()+PRODUCT_LIMITS.shutdownTimeoutMs;
   let forced=false,force:ReturnType<typeof setTimeout>|undefined,deadline:ReturnType<typeof setTimeout>|undefined;
   try{
    if(!this.exited){if(this.correlation&&!this.quarantined)this.child.postMessage({contractVersion:1,...this.correlation,type:'pi.close',sessionId:this.sessionId});else{this.kill();this.closingAwaited=!this.correlation;}}
    force=setTimeout(()=>{forced=true;this.kill();},PRODUCT_LIMITS.shutdownTimeoutMs-1500);
    await Promise.race([this.exit,new Promise<never>((_,reject)=>{deadline=setTimeout(()=>reject(new StoreFault('UTILITY_TIMEOUT')),PRODUCT_LIMITS.shutdownTimeoutMs);})]);requireStore(this.ownedPid&&this.ownedPid>0,'INTERRUPTED');for(;;){let gone=false;try{process.kill(this.ownedPid,0);}catch(error){gone=(error as NodeJS.ErrnoException).code==='ESRCH';}if(gone)break;requireStore(Date.now()<end,'UTILITY_TIMEOUT');await new Promise(resolve=>setTimeout(resolve,20));}return !forced&&!this.quarantined&&this.closingAwaited?{ok:true,value:{ownedExitConfirmed:true,backgroundWriters:'unknown'}} as const:this.reject('INTERRUPTED');
   }catch(error){this.kill();return this.reject(error instanceof StoreFault?error.code:'INTERRUPTED');}finally{if(force!==undefined)clearTimeout(force);if(deadline!==undefined)clearTimeout(deadline);}
  })();return this.shutdownPromise;
 }
}

function reject(): never { throw new Error(safeError('INTERNAL').message); }
function same(a: Stats, b: Stats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.birthtimeMs === b.birthtimeMs;
}
function revalidate(fixture: FixtureContext): void {
  const files = [fixture.root, path.join(fixture.root, 'bootstrap-owner.json'),
    fixture.userData, fixture.sessionData, fixture.logs, fixture.piDirectory];
  const before = files.map(file => lstatSync(file));
  const fresh = validateFixture(fixture.root);
  for (const key of ['root', 'fixtureId', 'databaseExpected', 'database', 'userData', 'sessionData', 'logs', 'piDirectory'] as const) {
    if (fresh[key] !== fixture[key]) reject();
  }
  for (const [index, file] of files.entries()) {
    const stat = lstatSync(file);
    if (!same(before[index]!, stat) || stat.isSymbolicLink() || realpathSync(file) !== file
      || (index !== 1 && !stat.isDirectory())) reject();
  }
  // No config/auth/session/resources are created, read or discovered.
  if (readdirSync(fixture.piDirectory).length !== 0) reject();
}
function environment(fixture: FixtureContext): Record<string, string> {
  if (process.platform !== 'win32') reject();
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
  if (!systemRoot || /[\x00-\x1f";]/.test(systemRoot) || !path.isAbsolute(systemRoot)) reject();
  const root = realpathSync(systemRoot);
  if (!lstatSync(root).isDirectory()) reject();
  const system32 = path.join(root, 'System32');
  if (!lstatSync(system32).isDirectory() || realpathSync(system32) !== system32) reject();
  const command = path.join(system32, 'cmd.exe');
  if (!lstatSync(command).isFile() || realpathSync(command) !== command) reject();
  // Build from scratch: no credentials, global SDK overrides or Node injection flags.
  // PATH/ComSpec/PATHEXT use only the verified Windows system context, not user tools.
  return { SystemRoot: root, WINDIR: root, ComSpec: command,
    PATH: system32 + ';' + root, PATHEXT: '.COM;.EXE;.BAT;.CMD',
    TEMP: fixture.root, TMP: fixture.root,
    HOME: fixture.piDirectory, USERPROFILE: fixture.piDirectory,
    APPDATA: fixture.piDirectory, LOCALAPPDATA: fixture.piDirectory,
    PI_CODING_AGENT_DIR: fixture.piDirectory };
}

/** Main calls once, after app ready and the selected fixture's instance lock. */
export function startPiUtility(fixture: FixtureContext, runId: string, controller: BootstrapController): { shutdown(): Promise<void> } {
  let child: UtilityProcess | undefined;
  let stopping = false;
  let settled = false;
  let exited = false;
  let killAccepted = false;
  let terminating = false;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let shutdownPromise: Promise<void> | undefined;
  let resolveExit!: () => void;
  const exit = new Promise<void>(resolve => { resolveExit = resolve; });
  const cancelDeadline = (): void => { if (deadline !== undefined) clearTimeout(deadline); deadline = undefined; };
  const killOwned = (): void => {
    terminating = true;
    if (!child || exited || killAccepted) return;
    try { killAccepted = child.kill(); } catch { /* Only the bounded exit wait decides shutdown success. */ }
  };
  const fail = (code: 'UTILITY_TIMEOUT' | 'UTILITY_EXITED' | 'INTERNAL'): void => {
    settled = true;
    cancelDeadline();
    if (!stopping) controller.failUtility(code);
  };
  try {
    const init = parseUtilityInit({ contractVersion: 1, type: 'bootstrap.init', runId });
    if (!init || !app.isReady()) reject();
    revalidate(fixture);
    const env = environment(fixture);
    revalidate(fixture); // Immediately before fork; status reads never reach this operation.
    child = utilityProcess.fork(path.join(__dirname, 'pi-utility.cjs'), [], {
      cwd: fixture.piDirectory, env, execArgv: [],
      serviceName: 'gabPrd Pi bootstrap', stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Drain without forwarding unknown logs, error causes or diagnostic reports.
    child.stdout?.on('data', () => {});
    child.stderr?.on('data', () => {});
    child.stdout?.on('error', () => {});
    child.stderr?.on('error', () => {});
    child.on('error', () => { if (!stopping && !settled) fail('INTERNAL'); });
    child.once('exit', () => {
      exited = true;
      resolveExit();
      // Even a previously passed SDK check cannot survive an unexpected process exit.
      if (!stopping) fail('UTILITY_EXITED');
    });
    child.once('spawn', () => { if (stopping || terminating) killOwned(); });
    child.on('message', (value: unknown) => {
      if (stopping || settled) return;
      const result = parseUtilityResult(value, runId);
      if (!result) return; // Wrong correlation/malformed messages cannot reset the deadline.
      settled = true;
      cancelDeadline();
      controller.acceptUtility(result);
    });
    deadline = setTimeout(() => { if (!stopping && !settled) { fail('UTILITY_TIMEOUT'); killOwned(); } }, UTILITY_TIMEOUT_MS);
    child.postMessage(init); // Exactly one init; no generic operation/retry surface.
  } catch {
    fail('INTERNAL');
    if (child) killOwned();
    else { exited = true; resolveExit(); }
  }
  return { shutdown(): Promise<void> {
    if (shutdownPromise) return shutdownPromise;
    stopping = true;
    settled = true;
    cancelDeadline();
    controller.stop();
    shutdownPromise = (async () => {
      if (exited) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const budget = new Promise<never>((_, rejectWait) => {
          timer = setTimeout(() => rejectWait(new Error(safeError('INTERNAL').message)), SHUTDOWN_TIMEOUT_MS);
        });
        killOwned();
        await Promise.race([exit, budget]);
      } finally { if (timer !== undefined) clearTimeout(timer); }
    })();
    return shutdownPromise;
  } };
}
