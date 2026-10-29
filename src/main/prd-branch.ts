/** Creation-only name; persisted associations are never renamed when a title changes. */
import type {PrdId} from '../shared/prd-contracts';
export function prdBranchName(initialIdea:string,prdId:PrdId):string{
 const slug=initialIdea.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48).replace(/-+$/,'')||'idea';
 return 'prd/'+slug+'-'+prdId.slice(0,8);
}
