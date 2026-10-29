import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {rename,symlink} from 'node:fs/promises';
import {buildRendererHarness} from '../../scripts/prd-renderer-harness.mjs';
import {discoverTests,runTests,isolatedEnvironment} from '../../scripts/prd-test.mjs';
import {makeTestTree} from './fixtures';
const passing="import test from 'node:test';import assert from 'node:assert/strict';test('owned pass',()=>assert.equal(2+2,4));";
const failing="import test from 'node:test';import assert from 'node:assert/strict';test('owned deliberately wrong assertion',()=>assert.equal(2+2,5));";
test('unit discovery selects actual host-safe suites, native discovery remains separate',async()=>{
 const root=await makeTestTree({'alpha.test.ts':passing,'boundary.integration.test.ts':passing,'native-runner.test.ts':passing,'not-a-test.ts':'','runtime.spec.ts':''});
 assert.deepEqual(discoverTests({root,kind:'unit'}).map((f:string)=>path.basename(f)),['alpha.test.ts']);
 assert.deepEqual(discoverTests({root,kind:'native'}).map((f:string)=>path.basename(f)),['boundary.integration.test.ts','native-runner.test.ts']);
 for(const selection of [['tests/prd/missing.test.ts'],['../outside.test.ts'],['tests/prd/runtime.spec.ts'],['tests/prd/alpha.test.ts','tests/prd/alpha.test.ts']])
  assert.throws(()=>discoverTests({root,kind:'unit',selection}));
 const empty=await makeTestTree({});assert.throws(()=>discoverTests({root:empty,kind:'unit'}));
});
test('unit runner propagates positive execution, deliberate assertion failure, crash and hard timeout',async()=>{
 const root=await makeTestTree({'pass.test.ts':passing,'fail.test.ts':failing,'crash.test.ts':'process.exit(13);','hang.test.ts':"import test from 'node:test';test('hang',async()=>{setInterval(()=>{},1000);await new Promise(()=>{});});"});
 const pass=await runTests({root,kind:'unit',selection:['tests/prd/pass.test.ts'],timeoutMs:10000});assert.equal(pass.exitCode,0);assert.match(pass.output,/owned pass/);
 const fail=await runTests({root,kind:'unit',selection:['tests/prd/fail.test.ts'],timeoutMs:10000});assert.notEqual(fail.exitCode,0);assert.match(fail.output,/ERR_ASSERTION|AssertionError/);
 const crash=await runTests({root,kind:'unit',selection:['tests/prd/crash.test.ts'],timeoutMs:10000});assert.notEqual(crash.exitCode,0);
 const timeout=await runTests({root,kind:'unit',selection:['tests/prd/hang.test.ts'],timeoutMs:1000});assert.notEqual(timeout.exitCode,0);assert.equal(timeout.timedOut,true);
});
test('adversarial: host runner rejects native-mode dispatch without running a native suite in host Node',async()=>{
 const root=await makeTestTree({'host-risk.integration.test.ts':"console.log('NATIVE_SUITE_MUST_NOT_RUN_ON_HOST');"});
 const result=await runTests({root,kind:'native',selection:['tests/prd/host-risk.integration.test.ts']});
 assert.notEqual(result.exitCode,0);assert.doesNotMatch(result.output,/NATIVE_SUITE_MUST_NOT_RUN_ON_HOST/);
});
test('adversarial: canonical discovery rejects redirected test directories',async()=>{
 const root=await makeTestTree({'alpha.test.ts':passing});
 const directory=path.join(root,'tests/prd'),saved=path.join(root,'tests/retained-prd');await rename(directory,saved);await symlink(saved,directory,'junction');
 assert.throws(()=>discoverTests({root,kind:'unit'}));
});
test('adversarial: renderer fixture cannot select source modules, traversal or non-entry paths',async()=>{
 for(const entry of ['../outside-entry.tsx','src/renderer/App.tsx','tests/prd/runner.spec.ts','tests/prd/../renderer-smoke-entry.tsx'])
  await assert.rejects(buildRendererHarness(entry));
});
test('test environments cannot inherit real provider/config credentials or Node injection',()=>{
 const env=isolatedEnvironment('X:/owned/fixture');
 for(const name of ['OPENAI_API_KEY','ANTHROPIC_API_KEY','GH_TOKEN','GITHUB_TOKEN','NODE_OPTIONS','PI_PACKAGE_DIR'])assert.equal(Reflect.get(env,name),undefined);
 assert.equal(env.HOME,'X:/owned/fixture');assert.equal(env.USERPROFILE,'X:/owned/fixture');
 assert.equal(Reflect.get(env,'PI_CODING_AGENT_DIR'),'X:/owned/fixture/pi');
});
