import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdirSync,writeFileSync,readFileSync,unlinkSync,utimesSync,statSync,renameSync,symlinkSync} from 'node:fs';
import {PrdDocuments} from '../../src/main/prd-documents';
import {PrdWorkspace} from '../../src/main/prd-workspace';
import {PRD_LIMITS as L} from '../../src/shared/prd-contracts';
import {fixture,value,id} from './documents.fixture';

for(const replace of [false,true])test(replace?'P06 replacing a Windows case alias cannot disguise a pre-existing pathname collision':'P06 case-only rename cannot disguise a pre-existing Windows file as a newly generated draft',async t=>{
 const f=await fixture(t),original=f.produce(),alias=path.join(path.dirname(original.path),path.basename(original.path).toUpperCase());renameSync(original.path,alias);const identity=statSync(alias,{bigint:true});value(await f.docs.inventory(f.prd(),f.workspace));renameSync(alias,original.path);if(replace){unlinkSync(original.path);writeFileSync(original.path,original.text);}const after=statSync(original.path,{bigint:true});assert.equal(after.dev,identity.dev);if(replace)assert.ok(after.ino!==identity.ino||after.birthtimeNs!==identity.birthtimeNs);else{assert.equal(after.ino,identity.ino);assert.equal(after.birthtimeNs,identity.birthtimeNs);}const before=f.snapshot();const candidates=value(await f.docs.candidates(f.prd(),f.workspace));assert.equal(candidates.coverage,'complete');assert.deepEqual(candidates.items,[],'a case-only spelling change is still the pre-existing Windows file');assert.deepEqual(f.snapshot(),before);assert.equal(f.prd().documentId,null);assert.equal(readFileSync(original.path,'utf8'),original.text);
});

test('P06 pre-existing collisions and incomplete scans cannot become a verified draft',async t=>{
 const f=await fixture(t),original=f.produce();value(await f.docs.inventory(f.prd(),f.workspace));
 const before=f.snapshot(),empty=value(await f.docs.candidates(f.prd(),f.workspace));assert.equal(empty.coverage,'complete');assert.deepEqual(empty.items,[]);assert.equal(f.prd().documentId,null);assert.deepEqual(f.snapshot(),before);assert.equal(readFileSync(original.path,'utf8'),original.text);
 const generated=f.produce(1),flood=path.join(f.workspace.worktreePath,'scan-bound');mkdirSync(flood);for(let i=0;i<=L.candidateScanFiles;i++)writeFileSync(path.join(flood,String(i)+'.txt'),'');
 const limited=value(await f.docs.candidates(f.prd(),f.workspace));assert.equal(limited.coverage,'scanLimit');assert.ok(limited.items.length<=L.candidateItems);assert.equal(f.prd().documentId,null);assert.equal(readFileSync(generated.path,'utf8'),generated.text);assert.equal(readFileSync(original.path,'utf8'),original.text);
 const fresh=new PrdDocuments(f.store,f.roots,f.workspacePort),incomplete=value(await fresh.inventory(f.prd(),f.workspace));assert.equal(incomplete.coverage,'scanLimit');const rejectedAuto=value(await fresh.candidates(f.prd(),f.workspace));assert.equal(rejectedAuto.coverage,'scanLimit');assert.deepEqual(rejectedAuto.items,[]);assert.equal(f.prd().documentId,null);
});
test('P06 real Windows junction replacement rejects reads and saves without touching the outside target',async t=>{
 const f=await fixture(t);value(await f.docs.inventory(f.prd(),f.workspace));const generated=f.produce();await f.register();const input=f.saveIntent('# Writer buffer must not escape\n'),before=f.snapshot(),directory=path.dirname(generated.path),retained=directory+'.original',outside=path.join(f.base,'P06_SENTINEL_PRIVATE_OUTSIDE');mkdirSync(outside);const target=path.join(outside,path.basename(generated.path)),outsideText='# Outside writer data stays untouched\n';writeFileSync(target,outsideText);renameSync(directory,retained);symlinkSync(outside,directory,'junction');
 const read=await f.docs.read(f.workspace,input.document),save=await f.docs.save(input);assert.equal(read.ok,false);assert.equal(save.ok,false);assert.doesNotMatch(JSON.stringify([read,save]),/P06_SENTINEL_PRIVATE_OUTSIDE|document-case-/);assert.deepEqual(f.snapshot(),before);assert.equal(readFileSync(target,'utf8'),outsideText);assert.equal(readFileSync(path.join(retained,path.basename(generated.path)),'utf8'),generated.text);assert.equal(f.prd().documentId,input.document.documentId);
});
test('P06 document byte/NUL limits reject without mutation and a verified H1 changes only the listing label',async t=>{
 const f=await fixture(t);value(await f.docs.inventory(f.prd(),f.workspace));const generated=f.produce(),before=f.snapshot();const oversized=Buffer.alloc(L.documentBytes+1,0x61);writeFileSync(generated.path,oversized);const large=await f.docs.candidates(f.prd(),f.workspace);assert.equal(large.ok,false);if(!large.ok)assert.equal(large.error.code,'LIMIT_EXCEEDED');assert.deepEqual(f.snapshot(),before);assert.deepEqual(readFileSync(generated.path),oversized);
 const nul=Buffer.from('# P06_SENTINEL_DO_NOT_EMIT\n\0');writeFileSync(generated.path,nul);const invalid=await f.docs.candidates(f.prd(),f.workspace);assert.equal(invalid.ok,false);assert.doesNotMatch(JSON.stringify(invalid),/P06_SENTINEL_DO_NOT_EMIT|document-case-/);assert.deepEqual(f.snapshot(),before);assert.deepEqual(readFileSync(generated.path),nul);
 const text='```markdown\n# Not the product title\n```\n\n# Interactive PRD Creator\n\nVerified text.\n';writeFileSync(generated.path,text);const document=await f.register();assert.equal(f.prd().displayName,'Interactive PRD Creator');assert.equal(document.relativePath,generated.relative);assert.equal(value(await f.docs.read(f.workspace,document)).text,text);
});
test('P06 differing observations and overlapping writes reject BUSY while the real save retains exclusive ownership',async t=>{
 let release!:()=>void,signal!:()=>void;const entered=new Promise<void>(resolve=>{signal=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});const f=await fixture(t,{beforeReplace:async()=>{signal();await gate;}});value(await f.docs.inventory(f.prd(),f.workspace));const generated=f.produce(),document=await f.register();
 const first=f.docs.read(f.workspace,document),different=await f.docs.read(f.workspace,{...document,documentId:id()});assert.equal(different.ok,false);if(!different.ok)assert.equal(different.error.code,'BUSY');value(await first);
 const input=f.saveIntent('# Only the admitted writer saves\n'),pending=f.docs.save(input);
 try{await Promise.race([entered,pending.then(()=>{throw new Error('Save must reach controlled replacement barrier');})]);const before=f.snapshot();const overlapping=await Promise.all([f.docs.read(f.workspace,document),f.docs.reconcile(f.workspace,document),f.docs.save(input)]);for(const result of overlapping){assert.equal(result.ok,false);if(!result.ok)assert.equal(result.error.code,'BUSY');}assert.deepEqual(f.snapshot(),before);assert.equal(readFileSync(generated.path,'utf8'),generated.text);}finally{release();}
 const saved=value(await pending);assert.equal(saved.recovery.phase,'verified');assert.equal(readFileSync(generated.path,'utf8'),input.text);assert.equal(saved.body.text,input.text);
});
