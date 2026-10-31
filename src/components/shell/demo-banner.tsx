"use client";
import { useState } from "react";
import { useTutorRuntime } from "@/lib/tutor-api/context";
import { errorText } from "@/lib/tutor-api/errors";
import type { EvaluationStatus } from "@/src/contracts/tutor";
export function DemoBanner({compact=false}:{compact?:boolean}){
  const r=useTutorRuntime();
  const [accountError,setAccountError]=useState<unknown>(null);
  async function signOut(){setAccountError(null);try{await r.signOut();}catch(error){setAccountError(error);}}
  if(r.mode==="http")return <div className="border-b border-line bg-surface px-4 py-2 text-center text-xs font-bold">Connected mode · learning results supplied by your service {r.auth?.authenticated&&<button className="ml-3 underline underline-offset-2" onClick={()=>void signOut()}>Sign out</button>}{accountError!==null&&<span className="ml-3 text-danger" role="alert">{errorText(accountError)}</span>}</div>;
  return <div className="border-b border-[#e6c466] bg-[#fff1ba] px-4 py-2 text-xs text-[#60460e]">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-3"><strong>Demo · sample data saved on this device</strong>
      <label>Persona <select aria-label="Demo persona" value={r.persona} onChange={e=>r.choosePersona(e.target.value as typeof r.persona)} className="rounded-lg border border-[#c8ac57] bg-white px-2 py-1"><option value="student-new">New student</option><option value="student-returning">Returning student</option><option value="teacher">Teacher</option></select></label>
      <label>Scripted feedback <select aria-label="Demo feedback" value={r.outcome} onChange={e=>r.setOutcome(e.target.value as EvaluationStatus)} className="rounded-lg border border-[#c8ac57] bg-white px-2 py-1"><option value="correct">Correct</option><option value="partial">Partial</option><option value="incorrect">Incorrect</option><option value="needs_clarification">Clarification</option></select></label>
      <button className="rounded px-1 underline" onClick={r.failNext}>Fail next request</button><button className="rounded px-1 underline" onClick={r.resetDemo}>Reset demo</button>{r.auth?.authenticated&&<button className="rounded px-1 underline" onClick={()=>void signOut()}>Sign out</button>}
    </div>{accountError!==null&&<p className="mt-1 text-center text-danger" role="alert">{errorText(accountError)}</p>}{!compact&&<p className="mt-1 text-center">Feedback follows the selected demo scenario. Persona selection changes sample fixtures only and never grants real permissions.</p>}
  </div>;
}
