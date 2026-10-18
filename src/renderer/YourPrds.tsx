import type {PrdSummary,PrdId} from '../shared/prd-contracts';
const lifecycle={createPending:'Setting up',brainstormActive:'In conversation',draftAvailable:'Draft available',failed:'Needs attention',interrupted:'Interrupted'} as const;
export default function YourPrds({items,busy,loaded,hasMore,onMore,onOpen}:{
  items:readonly PrdSummary[];busy:boolean;loaded:boolean;hasMore:boolean;onMore:()=>void;onOpen:(id:PrdId)=>void;
}) {
  return <section className="your-prds" aria-labelledby="your-prds-heading">
    <h2 id="your-prds-heading">Your PRDs</h2>
    {!loaded?<p>Your saved PRDs will appear here when the workspace connection is ready.</p>:items.length===0?<div className="empty-prds"><h3>Your next product starts here</h3><p>Create your first PRD to begin a conversation. Your drafts and completed conversation turns stay with their own workspace.</p></div>:<ul className="prd-list">{items.map(prd=><li key={prd.prdId}>
      <button className="prd-card" type="button" disabled={busy} onClick={()=>onOpen(prd.prdId)}>
        <strong>{prd.displayName}</strong><span>{prd.repository.displayName} · {prd.creationDate}</span><span className="prd-state">{lifecycle[prd.lifecycle]}</span>
      </button>
    </li>)}</ul>}
    {hasMore&&<button type="button" disabled={busy} onClick={onMore}>Load more PRDs</button>}
  </section>;
}
