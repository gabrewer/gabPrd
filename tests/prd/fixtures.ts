import path from 'node:path';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export {fixture,launch,waitReady,packageRoot,executable} from '../bootstrap/fixtures';
export const projectRoot=process.cwd();
export async function makeTestTree(files:Record<string,string>){
  const parent=path.join(projectRoot,'.pi/tmp/prd-runner-fixtures');await mkdir(parent,{recursive:true});
  const root=await mkdtemp(path.join(parent,'case-'));await mkdir(path.join(root,'tests/prd'),{recursive:true});
  for(const [name,text] of Object.entries(files))await writeFile(path.join(root,'tests/prd',name),text,{flag:'wx'});
  return root;
}
export async function hash(file:string){return createHash('sha256').update(await readFile(file)).digest('hex');}
export interface RendererHarness {
  executable:string; owner:string; originalArchive:string; originalArchiveSha256:string;
  archive:string; mainSha256:string; preloadSha256:string; htmlSha256:string; cssSha256:string;
}
