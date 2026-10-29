/** Fail-closed full automated milestone gate. Human/live evidence is always separate. */
import path from 'node:path';
import {existsSync,realpathSync,lstatSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {projectRoot} from './prd-test.mjs';
const suites=['contracts.test.ts','runner.test.ts','native-runner.test.ts','runner.spec.ts',
 'store.integration.test.ts','workspace.integration.test.ts','pi.integration.test.ts','documents.integration.test.ts',
 'service.integration.test.ts','startup.spec.ts','conversation.spec.ts','workflow.spec.ts','editor-reopen.integration.test.ts','editor.spec.ts'];
const missing=suites.filter(name=>{const file=path.join(projectRoot,'tests/prd',name);return !existsSync(file)||!lstatSync(file).isFile()||lstatSync(file).isSymbolicLink();});
const npmCli=process.env.npm_execpath;
if(missing.length){console.error('Product milestone verification BLOCKED: required suites not delivered: '+missing.join(', '));process.exitCode=1;}
else if(realpathSync(process.cwd())!==realpathSync(projectRoot)||!npmCli||!path.isAbsolute(npmCli)||!existsSync(npmCli)||!/npm-cli\.js$/i.test(npmCli)){
 console.error('Run npm run verify:prd from the repository root using installed npm.');process.exitCode=1;
}else{
 for(const name of ['typecheck','test:unit','test:prd:unit','rebuild:sqlite','package','inspect:package','test:prd:integration','test:prd:runtime']){
  const result=spawnSync(process.execPath,[npmCli,'run',name],{cwd:projectRoot,stdio:'inherit',shell:false,windowsHide:true});
  if(result.error||result.signal||result.status!==0){console.error('Product automated gate stopped; no remediation or acceptance inferred.');process.exitCode=1;break;}
 }
 if(!process.exitCode)console.log('Required automated product suites executed successfully. Live brainstorm, Windows human accessibility and acceptance evidence remain separate; this is not human acceptance.');
}
