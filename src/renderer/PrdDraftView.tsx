import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
/** Read-only actual-file view. No raw HTML, remote media, external navigation, or editing authority. */
export default function PrdDraftView({text}:{readonly text:string}){
 return <article className="prd-rendered" aria-label="PRD document"><Markdown skipHtml remarkPlugins={[remarkGfm]} urlTransform={()=>''} components={{a:({children})=><span>{children}</span>,img:({alt})=><span className="field-help">[Image not loaded{alt?': '+alt:''}]</span>}}>{text}</Markdown></article>;
}
