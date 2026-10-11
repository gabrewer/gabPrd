import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ERROR_MESSAGES, SDK_VERSION, SQLITE_DRIVER_VERSION } from '../../src/shared/bootstrap-contracts';
import { safeError, isRequest, isTrustedCaller, parseResult, parseUtilityInit, parseUtilityResult } from '../../src/shared/bootstrap-validation';

const secret = 'BOOTSTRAP_SENTINEL_SECRET_DO_NOT_EMIT';
test('request schema is exact and rejects malformed/extra/version/path/SQL inputs', () => {
  assert.equal(isRequest({ contractVersion: 1 }), true);
  for (const v of [null, undefined, [], 1, {}, { contractVersion: 2 }, { contractVersion: 1, path: secret }, { contractVersion: 1, sql: 'DELETE' }]) assert.equal(isRequest(v), false);
  assert.equal(isRequest(Object.create({ contractVersion: 1 })), false);
  assert.equal(isRequest({ get contractVersion() { throw new Error(secret); } }), false);
});
test('authority is actual owned sender AND current main frame AND exact URL', () => {
  const sender = {}, mainFrame = {}, url = 'gabprd://app/main_window/index.html';
  const expected = { sender, mainFrame, url };
  assert.equal(isTrustedCaller({ sender, frame: mainFrame, url }, expected), true);
  for (const candidate of [{sender:{},frame:mainFrame,url}, {sender,frame:{},url}, {sender,frame:null,url}, {sender,frame:mainFrame,url:url+'#other'}, {sender,frame:mainFrame,url:'https://example.invalid'}]) assert.equal(isTrustedCaller(candidate,expected),false);
});
test('all safe error texts are fixed; returned errors cannot carry secrets or paths', () => {
  for (const code of Object.keys(ERROR_MESSAGES) as (keyof typeof ERROR_MESSAGES)[]) {
    assert.deepEqual(safeError(code), { code, message: ERROR_MESSAGES[code] });
    assert.equal(JSON.stringify(safeError(code)).includes(secret), false);
  }
  assert.equal(parseResult({ok:false,error:{code:'INTERNAL',message:secret}}),undefined);
  assert.equal(parseResult({ok:false,error:{...safeError('INTERNAL'),stack:secret}}),undefined);
});
test('public result schema validates check fields/versions/aggregate state, no free-text extras', () => {
  const snapshot = {contractVersion:1,state:'ready',sqlite:{status:'passed',driverVersion:SQLITE_DRIVER_VERSION,reopenVerified:true},piSdk:{status:'passed',sdkVersion:SDK_VERSION,assetsVerified:true}};
  assert.deepEqual(parseResult({ok:true,snapshot}),{ok:true,snapshot});
  assert.equal(parseResult({ok:true,snapshot:{...snapshot,root:secret}}),undefined);
  assert.equal(parseResult({ok:true,snapshot:{...snapshot,sqlite:{status:'pending'}}}),undefined);
  assert.equal(parseResult({ok:true,snapshot:{...snapshot,piSdk:{status:'passed',sdkVersion:'other',assetsVerified:true}}}),undefined);
  assert.deepEqual(parseResult({ok:false,error:safeError('INVALID_REQUEST')}),{ok:false,error:safeError('INVALID_REQUEST')});
});
test('utility message schemas are bounded, versioned and correlated; no arbitrary SDK commands', () => {
  const runId=randomUUID();
  const init={contractVersion:1,type:'bootstrap.init',runId};
  const result={contractVersion:1,type:'bootstrap.result',runId,ok:true,sdkVersion:SDK_VERSION,assetsVerified:true};
  assert.deepEqual(parseUtilityInit(init),init);
  assert.equal(parseUtilityInit({...init,prompt:secret}),undefined);
  assert.equal(parseUtilityInit({...init,runId:'not-a-run-id'}),undefined);
  assert.deepEqual(parseUtilityResult(result,runId),result);
  assert.equal(parseUtilityResult({...result,runId:randomUUID()},runId),undefined);
  assert.equal(parseUtilityResult({...result,error:secret},runId),undefined);
  assert.equal(parseUtilityResult({contractVersion:1,type:'bootstrap.result',runId,ok:false,errorCode:'UNAUTHORIZED_CALLER'},runId),undefined);
  assert.deepEqual(parseUtilityResult({contractVersion:1,type:'bootstrap.result',runId,ok:false,errorCode:'SDK_UNAVAILABLE'},runId),{contractVersion:1,type:'bootstrap.result',runId,ok:false,errorCode:'SDK_UNAVAILABLE'});
});
