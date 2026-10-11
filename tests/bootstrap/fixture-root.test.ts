import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync,symlinkSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createFixture,validateFixture,prepareFixtureDirectories,reserveDatabase} from '../../src/main/fixture-root';
function owned(){const root=realpathSync(mkdtempSync(path.join(tmpdir(),'gabprd-bootstrap-test-')));writeFileSync(path.join(root,'bootstrap-owner.json'),JSON.stringify({schemaVersion:1,fixtureId:randomUUID(),canonicalRoot:root,databaseExpected:false}));return root;}
test('default fixture is marked/contained; validation is read-only and DB reservation is exclusive',()=>{
 const f=createFixture();assert.ok(path.relative(realpathSync(tmpdir()),f.root)&&!path.relative(realpathSync(tmpdir()),f.root).startsWith('..'));
 const before=readFileSync(path.join(f.root,'bootstrap-owner.json'));assert.equal(validateFixture(f.root).fixtureId,f.fixtureId);assert.deepEqual(readFileSync(path.join(f.root,'bootstrap-owner.json')),before);
 prepareFixtureDirectories(f);const reserved=reserveDatabase(f);assert.equal(reserved.databaseExpected,true);assert.equal(readFileSync(reserved.database).length,0);assert.throws(()=>reserveDatabase(f));
});
test('foreign/missing/oversized/wrong-link markers fail without reseeding or writes',()=>{
 const foreign=realpathSync(mkdtempSync(path.join(tmpdir(),'gabprd-foreign-')));const sentinel=path.join(foreign,'sentinel');writeFileSync(sentinel,'UNCHANGED');assert.throws(()=>validateFixture(foreign));assert.equal(readFileSync(sentinel,'utf8'),'UNCHANGED');
 for(const mutate of [(root:string)=>writeFileSync(path.join(root,'bootstrap-owner.json'),'x'.repeat(4097)),(root:string)=>writeFileSync(path.join(root,'bootstrap-owner.json'),JSON.stringify({schemaVersion:1,fixtureId:randomUUID(),canonicalRoot:foreign,databaseExpected:false})),(root:string)=>writeFileSync(path.join(root,'bootstrap.sqlite3'),'FOREIGN')]){const root=owned();mutate(root);const before=readFileSync(path.join(root,'bootstrap-owner.json'));assert.throws(()=>validateFixture(root));assert.deepEqual(readFileSync(path.join(root,'bootstrap-owner.json')),before);}
});
test('expected database missing or substituted between validation and mutation never creates a replacement',()=>{
 const root=owned();const f=validateFixture(root);const marker=JSON.parse(readFileSync(path.join(root,'bootstrap-owner.json'),'utf8'));writeFileSync(path.join(root,'bootstrap-owner.json'),JSON.stringify({...marker,databaseExpected:true}));
 assert.throws(()=>validateFixture(root));assert.throws(()=>reserveDatabase(f));assert.equal(readFileSync(path.join(root,'bootstrap-owner.json'),'utf8').includes('true'),true);
 const other=owned();const old=validateFixture(other);writeFileSync(path.join(other,'bootstrap.sqlite3'),'UNCHANGED');assert.throws(()=>reserveDatabase(old));assert.equal(readFileSync(path.join(other,'bootstrap.sqlite3'),'utf8'),'UNCHANGED');
});
test('root and writable-child junction escape and prefix-neighbor directories are rejected',()=>{
 const root=owned(),foreign=owned();const f=validateFixture(root);symlinkSync(foreign,f.userData,process.platform==='win32'?'junction':'dir');assert.throws(()=>prepareFixtureDirectories(f));
 const neighbor=path.join(root,'..',path.basename(root)+'-backup');mkdirSync(neighbor);const alias=path.join(root,'root-alias');symlinkSync(neighbor,alias,process.platform==='win32'?'junction':'dir');assert.throws(()=>validateFixture(alias));
});
