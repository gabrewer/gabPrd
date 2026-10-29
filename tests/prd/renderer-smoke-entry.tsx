import {createRoot} from 'react-dom/client';
import {useEffect,useState} from 'react';
function Smoke(){
 const [state,setState]=useState('starting');
 useEffect(()=>{let active=true;let timer:ReturnType<typeof setTimeout>|undefined;
  const read=async()=>{try{const result=await window.gabPrd.bootstrap.getStatus();if(!active)return;
   if(result.ok){setState(result.snapshot.state);if(result.snapshot.state==='starting')timer=setTimeout(()=>{void read();},100);}
   else setState('failed');}catch{if(active)setState('failed');}};void read();return()=>{active=false;if(timer)clearTimeout(timer);};},[]);
 return <main><h1>P02 renderer smoke mounted</h1><p role="status">Real bootstrap service: {state}</p></main>;
}
const root=document.getElementById('root');if(!root)throw new Error('Owned smoke mount unavailable');
createRoot(root).render(<Smoke/>);
