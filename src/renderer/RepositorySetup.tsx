import type {RepositoryView} from '../shared/prd-contracts';
export default function RepositorySetup({repository,busy,available,onChoose}:{repository:RepositoryView|null;busy:boolean;available:boolean;onChoose:()=>void}){
 return <section className="repository-setup" aria-label="Repository">
  <button className="repository-picker" type="button" disabled={busy||!available} onClick={onChoose} aria-label={repository?'Change repository':'Choose repository'}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h7l2 2h9v12H3z"/></svg><span>{repository?.displayName??'Choose repository'}</span><span aria-hidden="true">⌄</span></button>
  {repository&&<details className="repository-details"><summary>Location</summary><p>{repository.verifiedDisplayPath}</p></details>}
  {!available&&<p className="connection-note">Repository access is unavailable.</p>}
 </section>;
}
