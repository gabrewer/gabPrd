import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import Database from 'better-sqlite3';

test('P02 actual pinned Electron ABI/native SQLite create-close-reopen',()=>{
 assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');
 assert.equal(process.versions.electron,'44.7.0');assert.equal(process.versions.modules,'149');
 assert.ok(process.env.PRD_NATIVE_FIXTURE_ROOT);
 const file=path.join(process.env.PRD_NATIVE_FIXTURE_ROOT,randomUUID()+'.sqlite3');
 let db=new Database(file);db.exec('CREATE TABLE probe (value INTEGER NOT NULL); INSERT INTO probe VALUES (42)');db.close();
 db=new Database(file,{fileMustExist:true});try{assert.deepEqual(db.prepare('SELECT value FROM probe').get(),{value:42});}finally{db.close();}
});
