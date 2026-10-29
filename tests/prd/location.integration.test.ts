/** Real filesystem convention discovery; this does not claim a provider/Git/session test. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,realpathSync,symlinkSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {discoverPrdConventions} from '../../src/main/prd-location';
import {canonicalStat,identityOf} from '../../src/main/prd-paths';
import type {WorkspaceRecord} from '../../src/shared/prd-contracts';
function fixture(){
 const root=realpathSync(mkdtempSync(path.join(process.env.PRD_NATIVE_FIXTURE_ROOT!,'location-')));
 // Discovery only reads these fields; their directory and identity are real, not mocked.
 const workspace={workspaceId:randomUUID(),worktreePath:root,worktreeIdentity:identityOf(canonicalStat(root))} as WorkspaceRecord;
 return {root,workspace};
}
test('location discovery accepts this repository actual AGENTS file references without treating files as folders',async()=>{
 const f=fixture(),instructions=readFileSync(path.resolve('AGENTS.md'));
 mkdirSync(path.join(f.root,'docs/design'),{recursive:true});
 writeFileSync(path.join(f.root,'AGENTS.md'),instructions);
 const existing=path.join(f.root,'docs/design/2026-10-09-prd-creator-prd.md');writeFileSync(existing,'# Existing authority\n');
 const result=await discoverPrdConventions(f.workspace);assert.equal(result.ok,true);
 if(result.ok){assert.deepEqual(result.value.map(c=>c.relativeFolder),['docs/design']);assert.ok(result.value.every(c=>c.selected));}
 assert.deepEqual(readFileSync(path.join(f.root,'AGENTS.md')),instructions);assert.equal(readFileSync(existing,'utf8'),'# Existing authority\n');
});
test('Markdown references, including not-yet-existing documents, do not become future directories or mask explicit folder choices',async()=>{
 const f=fixture();writeFileSync(path.join(f.root,'AGENTS.md'),'Product PRD: `docs/missing-plan.md`.\nSave PRDs in `specifications/` or `requirements/`.\n');
 const result=await discoverPrdConventions(f.workspace);assert.equal(result.ok,true);
 if(result.ok){assert.deepEqual(result.value.map(c=>c.relativeFolder),['requirements','specifications']);assert.ok(result.value.every(c=>c.source==='instructions'&&!c.selected));}
});
test('ignoring document references does not allow unsafe folders or junction escape',async()=>{
 const f=fixture();writeFileSync(path.join(f.root,'AGENTS.md'),'Product PRD: `docs/plan.md`.\nSave PRDs in `../outside/`.\n');
 assert.equal((await discoverPrdConventions(f.workspace)).ok,false);
 const outside=realpathSync(mkdtempSync(path.join(process.env.PRD_NATIVE_FIXTURE_ROOT!,'location-outside-')));writeFileSync(path.join(outside,'keep.md'),'KEEP\n');
 symlinkSync(outside,path.join(f.root,'docs'),'junction');writeFileSync(path.join(f.root,'AGENTS.md'),'Product PRD: `docs/plan.md`.\nSave PRDs in `docs/design/`.\n');
 assert.equal((await discoverPrdConventions(f.workspace)).ok,false);assert.equal(readFileSync(path.join(outside,'keep.md'),'utf8'),'KEEP\n');
});
