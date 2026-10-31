"use client";
import Link from "next/link";
import { useEffect,useRef,useState,type ReactNode } from "react";
import { Button,ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { SparkMascot } from "@/components/brand/spark-mascot";
import { useTutorRuntime } from "@/lib/tutor-api/context";
import { errorText } from "@/lib/tutor-api/errors";
import type { ConceptProgress } from "@/src/contracts/tutor";

export const field="mt-2 min-h-12 w-full rounded-2xl border-2 border-line bg-white px-4 py-3 text-base focus:border-primary focus:outline-none";
export const title=(text:string)=> <h1 className="font-display text-3xl font-black tracking-tight sm:text-4xl">{text}</h1>;
export function DateText({value}:{value:string|null}){return <span>{value?new Date(value).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"}):"Not scheduled"}</span>;}
export function Failure({error,retry}:{error:unknown;retry?:()=>void}){if(!error)return null;return <div className="rounded-2xl border-2 border-danger bg-red-50 p-4 text-sm" role="alert"><p>{errorText(error)}</p>{retry&&<Button variant="secondary" size="sm" onClick={retry} className="mt-3">Retry</Button>}</div>;}
export function useLoad<T>(load:()=>Promise<T>,deps:unknown[]=[]){
  const [data,setData]=useState<T|null>(null),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(true),[tick,setTick]=useState(0);
  const loadRef=useRef(load);loadRef.current=load;
  useEffect(()=>{let active=true;setBusy(true);setError(null);setData(null);loadRef.current().then(x=>{if(active)setData(x);}).catch(e=>{if(active)setError(e);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[...deps,tick]);
  return {data,error,busy,reload:()=>setTick(t=>t+1),setData};
}
export function Access({teacher=false,children}:{teacher?:boolean;children:ReactNode}){
  const r=useTutorRuntime();const {auth}=r;
  if(r.authError)return <Failure error={r.authError} retry={()=>void r.refreshAuth()}/>;
  if(!auth)return <p role="status">Loading your account…</p>;
  if(!auth.authenticated)return <Card className="p-8">{title("Sign in to continue")}<ButtonLink href="/sign-in" className="mt-5">Sign in</ButtonLink></Card>;
  if(!auth.user.roles.includes(teacher?"teacher":"student"))return <Card className="p-8">{title("This workspace needs another role")}<p className="mt-3">{r.mode==="mock"?"Use the labeled demo persona selector above to explore the other workspace.":"Your account does not have access to this workspace."}</p></Card>;
  if(!teacher&&!auth.studentProfile?.onboardingComplete)return <Card className="p-8">{title("Make Spark yours")}<p className="mt-3">Add your name to start your chapter.</p><ButtonLink href="/onboarding" className="mt-5">Set up your profile</ButtonLink></Card>;
  return <div key={auth.user.id}>{children}</div>;
}
export function Mastery({progress}:{progress:ConceptProgress}){return <div><Progress label="Mastery estimate" value={progress.mastery===null?null:progress.mastery*100}/><p className="mt-2 text-xs text-muted">{progress.evidenceCount} assessed question{progress.evidenceCount!==1?"s":""} · {progress.state.replaceAll("_"," ")}</p></div>;}
export function StartButton({action,label="Start practice"}:{action:()=>Promise<{id:string}>;label?:string}){
  const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null);const lock=useRef(false);
  async function run(){if(lock.current)return;lock.current=true;setBusy(true);setError(null);try{const result=await action();window.location.assign(`/learn/session/${encodeURIComponent(result.id)}`);}catch(e){setError(e);}finally{lock.current=false;setBusy(false);}}
  return <div><Button onClick={()=>void run()} disabled={busy}>{busy?"Preparing…":label}</Button><Failure error={error}/></div>;
}
export function FinishedMascot(){return <SparkMascot state="celebrating" className="mx-auto w-28"/>;}
export function SessionLink({id,children}:{id:string;children:ReactNode}){return <Link className="font-bold text-primary-dark underline underline-offset-4" href={`/learn/session/${encodeURIComponent(id)}`}>{children}</Link>;}
