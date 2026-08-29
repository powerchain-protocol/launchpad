"use client";

import { useState } from "react";

type RpcState = "idle" | "checking" | "ok" | "error";
const TIMEOUT_MS = 8_000;

export function RpcHealthCard(){
  const [url,setUrl]=useState("https://api.mainnet-beta.solana.com");
  const [state,setState]=useState<RpcState>("idle");
  const [latency,setLatency]=useState<number>();
  const [message,setMessage]=useState("No check run yet.");
  async function check(){
    setState("checking");setLatency(undefined);setMessage("Checking read RPC…");
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);const started=performance.now();
    try{
      const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"getHealth"}),signal:controller.signal,cache:"no-store"});
      const elapsed=Math.round(performance.now()-started);setLatency(elapsed);
      const text=await response.text();let payload:unknown;try{payload=JSON.parse(text)}catch{throw new Error("RPC returned malformed JSON.")}
      if(!response.ok)throw new Error(`RPC returned HTTP ${response.status}.`);
      const object=payload as {result?:unknown;error?:{message?:string}};if(object.error)throw new Error(object.error.message??"RPC returned an error.");
      setState("ok");setMessage(`Read RPC responded successfully in ${elapsed} ms.`);
    }catch(error){setState("error");setMessage(error instanceof DOMException&&error.name==="AbortError"?"RPC check exceeded the strict 8-second timeout.":error instanceof Error?error.message:"RPC check failed.")}
    finally{clearTimeout(timer)}
  }
  return <section className="card stack" aria-busy={state==="checking"}>
    <div><div className="label">Network / RPC</div><h2>Read endpoint health</h2><p className="muted">This selector affects only read diagnostics. Changing the selected read network or RPC cannot alter escrow, treasury, launch-program, or settlement authority.</p></div>
    <label className="field"><span>Solana read RPC</span><input value={url} onChange={(e)=>setUrl(e.target.value)} inputMode="url"/></label>
    <button className="button secondary" type="button" disabled={state==="checking"} onClick={()=>void check()}>{state==="checking"?"Checking…":"Check RPC"}</button>
    <div className="rpc-state" role="status"><span className={`dot ${state}`}/><strong>{state}</strong>{latency!==undefined?<span>· latency {latency} ms</span>:null}</div>
    <p className={state==="error"?"danger":"muted"}>{message}</p>
  </section>
}
