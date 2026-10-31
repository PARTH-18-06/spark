import type * as T from "../../src/contracts/tutor";
import { HttpApiError, NetworkError, ProtocolError } from "./errors";
import { validSubmitAnswer, validators, validErrorForStatus } from "./validation";

type Operation=keyof T.TutorApi;
type Result<K extends Operation>=Awaited<ReturnType<T.TutorApi[K]>>;
export class HttpTutorApi implements T.TutorApi {
  private csrf: string|null=null;
  constructor(private baseUrl="/api/v1",private fetcher:typeof fetch=globalThis.fetch.bind(globalThis),private timeoutMs=30000) { this.baseUrl=baseUrl.replace(/\/$/,""); }
  private async request<K extends Operation>(op:K,path:string,method="GET",input?:unknown,key?:string):Promise<Result<K>> {
    if(method!=="GET"&&op!=="signIn"&&this.csrf===null) await this.getCurrentUser();
    const headers:Record<string,string>={Accept:"application/json"};
    if(input!==undefined) headers["Content-Type"]="application/json";
    if(method!=="GET"&&this.csrf)headers["X-CSRF-Token"]=this.csrf;
    if(key)headers["Idempotency-Key"]=key;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),this.timeoutMs);
    let response:Response;
    let body:string;
    try {
      response=await this.fetcher(this.baseUrl+path,{method,headers,credentials:"include",cache:"no-store",signal:controller.signal,body:input===undefined?undefined:JSON.stringify(input)});
      body=await response.text();
    }catch{throw new NetworkError();}finally{clearTimeout(timeout);}
    const id=response.headers.get("x-request-id");
    const requestId=id&&/^[\w:.-]{1,128}$/.test(id)?id:null;
    const unexpected=(reason:T.TutorProtocolError["reason"]):never=>{throw new ProtocolError(reason,response.status,method==="GET"?"not_applicable":"unknown",requestId);};
    const expected=op==="signOut"?204:op==="startSession"?201:200;
    if(response.ok&&response.status!==expected)unexpected("unexpected_status");
    if(response.ok&&op==="signOut")return undefined as Result<K>;
    if(!/^application\/(?:json|[\w.-]+\+json)(?:\s*;|$)/i.test(response.headers.get("content-type")??""))unexpected("non_json_response");
    let value:unknown;
    try{value=JSON.parse(body);}catch{unexpected("malformed_json");}
    if(!response.ok){
      if(!validErrorForStatus(value,response.status))unexpected("invalid_error_payload");
      if(response.status===401)this.csrf=null;
      throw new HttpApiError(response.status,value as T.ApiErrorBody);
    }
    let valid=false;
    try{valid=validators[op](value);}catch{valid=false;}
    if(!valid)unexpected("invalid_success_payload");
    return value as Result<K>;
  }
  async getCurrentUser(){const r=await this.request("getCurrentUser","/auth/me");this.csrf=r.csrfToken;return r;}
  async signIn(input:T.SignInInput){const r=await this.request("signIn","/auth/sign-in","POST",input);this.csrf=r.csrfToken;return r;}
  async signOut(){await this.request("signOut","/auth/sign-out","POST");this.csrf=null;}
  saveStudentProfile(input:T.SaveStudentProfileInput){
    if(input.displayName.trim()!==input.displayName||input.displayName.length<1||input.displayName.length>80) this.invalid("displayName","Use a trimmed display name between 1 and 80 characters.");
    if(input.examDate!==null&&(!/^\d{4}-\d\d-\d\d$/.test(input.examDate)||!Number.isFinite(Date.parse(`${input.examDate}T00:00:00Z`))||new Date(`${input.examDate}T00:00:00Z`).toISOString().slice(0,10)!==input.examDate))this.invalid("examDate","Use a valid calendar date.");
    try{new Intl.DateTimeFormat("en",{timeZone:input.timeZone});}catch{this.invalid("timeZone","Use a valid IANA time zone.");}
    return this.request("saveStudentProfile","/me/profile","PUT",input);
  }
  getStudentDashboard(){return this.request("getStudentDashboard","/student/dashboard");}
  getConcepts(){return this.request("getConcepts","/concepts");}
  startSession({idempotencyKey,...input}:T.StartSessionInput){
    this.key(idempotencyKey);
    const valid=input.mode==="diagnostic"
      ? input.conceptId===undefined&&input.revisionItemIds===undefined
      : input.mode==="practice"
        ? input.revisionItemIds===undefined
        : input.conceptId===undefined&&(input.revisionItemIds===undefined||(input.revisionItemIds.length>0&&input.revisionItemIds.every(Boolean)));
    if(!valid)this.invalid("mode","Session options do not match the selected mode.");
    return this.request("startSession","/sessions","POST",input,idempotencyKey);
  }
  getSession(id:string){return this.request("getSession",`/sessions/${encodeURIComponent(id)}`);}
  submitAttempt({idempotencyKey,...input}:T.SubmitAttemptInput){
    this.key(idempotencyKey);
    if(!validSubmitAnswer(input))this.invalid("finalAnswerText","Provide exactly one authoritative answer in the format assigned by the question.");
    return this.request("submitAttempt",`/sessions/${encodeURIComponent(input.sessionId)}/attempts`,"POST",input,idempotencyKey);
  }
  advanceSession({idempotencyKey,...input}:T.AdvanceSessionInput){this.key(idempotencyKey);return this.request("advanceSession",`/sessions/${encodeURIComponent(input.sessionId)}/advance`,"POST",input,idempotencyKey);}
  endSession({idempotencyKey,...input}:T.EndSessionInput){this.key(idempotencyKey);return this.request("endSession",`/sessions/${encodeURIComponent(input.sessionId)}/end`,"POST",input,idempotencyKey);}
  getRevisionQueue(){return this.request("getRevisionQueue","/revision");}
  private query(input?:T.PageInput){const p=new URLSearchParams();if(input?.cursor)p.set("cursor",input.cursor);if(input?.limit)p.set("limit",String(input.limit));return p.size?"?"+p.toString():"";}
  getProgress(input?:T.PageInput){return this.request("getProgress","/progress"+this.query(input));}
  getAttemptHistory(input?:T.PageInput){return this.request("getAttemptHistory","/attempts"+this.query(input));}
  getClasses(){return this.request("getClasses","/teacher/classes");}
  getClassDashboard(id:string){return this.request("getClassDashboard",`/teacher/classes/${encodeURIComponent(id)}`);}
  getStudentDetail(cid:string,sid:string){return this.request("getStudentDetail",`/teacher/classes/${encodeURIComponent(cid)}/students/${encodeURIComponent(sid)}`);}

  private key(value:string){if(!value.trim())this.invalid("idempotencyKey","An idempotency key is required.");}
  private invalid(field:string,message:string):never{
    throw new HttpApiError(400,{error:{code:"VALIDATION_ERROR",message:"Check the request before retrying.",retryable:false,requestId:"client-validation",fieldErrors:{[field]:message}}});
  }
}
