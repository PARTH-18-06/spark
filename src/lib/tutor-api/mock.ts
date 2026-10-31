import * as T from "../../contracts/tutor";
import { demoQuestion, unassessed } from "../../mocks/questions";
import { apiError, NetworkError } from "./errors";
import { answerMatches, canonical } from "./validation";

export type Persona="student-new"|"student-returning"|"teacher";
export interface StoreLike { getItem(key:string):string|null; setItem(key:string,value:string):void; removeItem(key:string):void }
interface Learner { profile:T.StudentProfile|null; concepts:T.ConceptProgress[]; revision:T.RevisionItem[]; sessions:Record<string,T.SessionSnapshot>; attempts:T.AttemptHistoryItem[]; selections:Record<string,string[]> }
interface DemoStore { version:"1.1.0"; sequence:number; clock:string; learners:Record<string,Learner>; signedIn:Record<Persona,boolean>; replay:Record<string,{hash:string;value:unknown}> }
const emptyRewards=():T.Rewards=>({account:null,grants:[]});
const DEMO_EPOCH="2026-10-31T09:00:00.000Z";
const day=(offset:number)=>new Date(Date.parse(DEMO_EPOCH)+offset*86400000).toISOString();
const conceptName=(cid:T.ConceptId)=>T.ELECTRICITY_CONCEPTS.find(c=>c.id===cid)!.title;
function fresh():DemoStore {
  const blank=():Learner=>({profile:null,concepts:unassessed(),revision:[],sessions:{},attempts:[],selections:{}});
  const returning=blank();
  returning.profile={displayName:"Asha",chapterId:T.CHAPTER_ID,examDate:null,timeZone:"Asia/Calcutta",onboardingComplete:true};
  const p=returning.concepts[2];
  Object.assign(p,{mastery:0.45,state:"developing",evidenceCount:2,lastAssessedAt:day(-2),nextReviewAt:day(-1),recentMisconceptions:[{misconceptionCode:T.MISCONCEPTION_CODES.VOLTAGE_CHANGES_FIXED_RESISTANCE,label:"Assumes voltage changes fixed resistance",evidence:"higher voltage increases resistance",observedAt:day(-2)}]});
  returning.revision=[{id:"seed-ohm-review",conceptId:p.conceptId,status:"due",dueAt:p.nextReviewAt!,reason:"Sample scheduled review after a reasoning misconception.",completedAt:null,completedSessionId:null}];
  const sid="seed-session";
  const old:T.SessionSnapshot={id:sid,mode:"practice",conceptId:p.conceptId,status:"completed",phase:"completed",version:5,progress:{answeredCount:2,targetQuestionCount:2},currentQuestion:null,lastAttempt:null,endedAt:day(-2),updatedAt:day(-2),summary:{sessionId:sid,mode:"practice",completedAt:day(-2),answeredCount:2,correctCount:1,partialCount:0,incorrectCount:1,conceptProgress:structuredClone(returning.concepts),recommendedConceptIds:[p.conceptId],feedback:"Sample historical session. Review reasoning about fixed resistance.",rewards:emptyRewards()}};
  old.summary!.completedAt=old.endedAt!;
  returning.sessions[sid]=old;
  const q=demoQuestion(p.conceptId,0);
  returning.attempts=[{sessionId:sid,conceptId:p.conceptId,question:q,feedback:{attemptId:"seed-attempt",questionId:q.id,clarificationOfAttemptId:null,submittedAt:day(-2),finalAnswerText:"Current halves.",reasoningText:"Current halves because higher voltage increases resistance.",selectedOptionId:null,status:"incorrect",finalAnswerCorrect:false,reasoningStatus:"misconception",feedback:"Current doubles: I = V/R and R is fixed.",misconception:p.recentMisconceptions[0],clarificationPrompt:null,mastery:{conceptId:p.conceptId,before:null,after:0.25,evidenceCount:1},nextReviewAt:p.nextReviewAt} }];
  // Preserve only the wire misconception fields, not observation metadata.
  const m=returning.attempts[0].feedback.misconception!;
  returning.attempts[0].feedback.misconception={misconceptionCode:m.misconceptionCode,label:m.label,evidence:m.evidence};
  return {version:"1.1.0",sequence:0,clock:DEMO_EPOCH,learners:{"student-new":blank(),"student-returning":returning},signedIn:{"student-new":true,"student-returning":true,teacher:true},replay:{}};
}
export class MockTutorApi implements T.TutorApi {
  outcome:T.EvaluationStatus="correct";
  failNext=false;
  constructor(readonly persona:Persona="student-new",private storage?:StoreLike,private storageKey="spark-demo-1.1.0",private latency=220){}
  reset(){this.storage?.removeItem(this.storageKey);this.memory=fresh();}
  private memory=fresh();
  private load():DemoStore {const raw=this.storage?.getItem(this.storageKey);if(raw){try{const value=JSON.parse(raw);if(value.version==="1.1.0"&&Number.isInteger(value.sequence)&&typeof value.clock==="string")return value;}catch{/* Explicit demo reset is safe for corrupted fixtures. */}}return structuredClone(this.memory);}
  private save(s:DemoStore){this.storage?.setItem(this.storageKey,JSON.stringify(s));this.memory=structuredClone(s);}
  private timestamp(s:DemoStore){s.clock=new Date(Date.parse(s.clock)+60000).toISOString();return s.clock;}
  private peekTime(s:DemoStore){return s.clock;}
  private future(s:DemoStore,days:number){return new Date(Date.parse(s.clock)+days*86400000).toISOString();}
  private nextId(s:DemoStore,prefix:string){s.sequence+=1;return `demo-${prefix}-${String(s.sequence).padStart(4,"0")}`;}
  private async pause(){await new Promise(r=>setTimeout(r,this.latency));if(this.failNext){this.failNext=false;throw new NetworkError();}}
  private authorized(s:DemoStore,teacher=false){if(!s.signedIn[this.persona])apiError("AUTH_REQUIRED","Sign in to continue.",401);if(teacher?(this.persona!=="teacher"):(this.persona==="teacher"))apiError("FORBIDDEN","This account cannot access that workspace.",403);}
  private learner(s:DemoStore,onboard=true){this.authorized(s);const l=s.learners[this.persona];if(onboard&&!l.profile?.onboardingComplete)apiError("ONBOARDING_REQUIRED","Complete your student setup first.");return l;}
  private history(l:Learner):T.SessionHistoryItem[]{return Object.values(l.sessions).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.id.localeCompare(a.id)).map(s=>({id:s.id,mode:s.mode,status:s.status,answeredCount:s.progress.answeredCount,updatedAt:s.updatedAt,completedAt:s.summary?.completedAt??null,endedAt:s.endedAt}));}
  private queue(s:DemoStore,l:Learner):T.RevisionQueue {const at=this.peekTime(s);return {generatedAt:at,items:l.revision.map(i=>({...i,status:i.status==="completed"?"completed":i.dueAt<=at?"due":"upcoming"}))};}
  private async mutate<I extends {idempotencyKey:string;sessionId?:string},R>(op:string,input:I,action:(s:DemoStore,l:Learner)=>R):Promise<R>{
    await this.pause();const s=this.load();const l=this.learner(s);
    if(!input.idempotencyKey)apiError("VALIDATION_ERROR","A request identity is required.",400);
    const key=`${this.persona}:${op}:${input.sessionId??"start"}:${input.idempotencyKey}`;const hash=canonical(input);
    if(s.replay[key]){if(s.replay[key].hash!==hash)apiError("IDEMPOTENCY_CONFLICT","This request key was used with different content.");return structuredClone(s.replay[key].value) as R;}
    const result=action(s,l);s.replay[key]={hash,value:structuredClone(result)};this.save(s);return structuredClone(result);
  }
  private active(l:Learner,input:{sessionId:string;expectedSessionVersion:number}){const s=l.sessions[input.sessionId];if(!s)apiError("NOT_FOUND","Session not found.",404);if(s.version!==input.expectedSessionVersion)apiError("SESSION_VERSION_CONFLICT","Session changed. Reload it before acting.");if(s.status!=="active")apiError("INVALID_SESSION_STATE","This session has ended.");return s;}
  async getCurrentUser():Promise<T.AuthState>{await this.pause();const s=this.load();if(!s.signedIn[this.persona])return {authenticated:false,user:null,studentProfile:null,csrfToken:null,expiresAt:null};return {authenticated:true,user:{id:this.persona,displayName:this.persona==="teacher"?"Ms. Rao":s.learners[this.persona].profile?.displayName??"New learner",roles:[this.persona==="teacher"?"teacher":"student"]},studentProfile:this.persona==="teacher"?null:s.learners[this.persona].profile,csrfToken:"demo-only-token",expiresAt:this.future(s,1)};}
  async signIn(input:T.SignInInput){if(!input.email.trim()||!input.password)apiError("INVALID_CREDENTIALS","Enter the pre-created demo account credentials.",401);const s=this.load();s.signedIn[this.persona]=true;this.save(s);return await this.getCurrentUser() as T.AuthenticatedState;}
  async signOut(){await this.pause();const s=this.load();s.signedIn[this.persona]=false;this.save(s);}
  async saveStudentProfile(input:T.SaveStudentProfileInput){await this.pause();const s=this.load();const l=this.learner(s,false);let validZone=true;try{new Intl.DateTimeFormat("en",{timeZone:input.timeZone});}catch{validZone=false;}const validDate=input.examDate===null||/^\d{4}-\d\d-\d\d$/.test(input.examDate)&&Number.isFinite(Date.parse(`${input.examDate}T00:00:00Z`))&&new Date(`${input.examDate}T00:00:00Z`).toISOString().slice(0,10)===input.examDate;if(input.displayName.trim()!==input.displayName||input.displayName.length<1||input.displayName.length>80||!validZone||!validDate)apiError("VALIDATION_ERROR","Check the profile fields.",400,{fieldErrors:{profile:"Use a trimmed name, valid date, and IANA time zone."}});l.profile={...input,onboardingComplete:true};this.save(s);return structuredClone(l.profile);}
  async getStudentDashboard(){await this.pause();const store=this.load();const l=this.learner(store);const h=this.history(l);return {profile:l.profile!,activeSession:h.find(s=>s.status==="active")??null,dueRevisionCount:this.queue(store,l).items.filter(i=>i.status==="due").length,recommendedConceptId:l.concepts.find(c=>c.state==="needs_practice")?.conceptId??l.concepts.find(c=>c.state==="unassessed")?.conceptId??null,concepts:l.concepts,recentSessions:h.slice(0,5),rewards:emptyRewards()};}
  async getConcepts(){await this.pause();const l=this.learner(this.load(),false);return {chapterId:T.CHAPTER_ID,concepts:T.ELECTRICITY_CONCEPTS.map(c=>({...c,prerequisiteIds:[...c.prerequisiteIds]})),progress:l.concepts};}
  startSession(input:T.StartSessionInput){return this.mutate("start",input,(store,l)=>{
    const validOptions=input.mode==="diagnostic"?input.conceptId===undefined&&input.revisionItemIds===undefined:input.mode==="practice"?input.revisionItemIds===undefined:input.conceptId===undefined&&(input.revisionItemIds===undefined||input.revisionItemIds.length>0&&new Set(input.revisionItemIds).size===input.revisionItemIds.length);
    if(!validOptions)apiError("VALIDATION_ERROR","Session options do not match the selected mode.",400);
    const active=Object.values(l.sessions).find(s=>s.status==="active");if(active)apiError("ACTIVE_SESSION_EXISTS","Resume or end your current session first.",409,{activeSessionId:active.id});
    let selected:T.RevisionItem[]=[];
    if(input.mode==="revision"){selected=this.queue(store,l).items.filter(i=>i.status==="due"&&(!input.revisionItemIds||input.revisionItemIds.includes(i.id)));if(!selected.length||input.revisionItemIds&&selected.length!==input.revisionItemIds.length)apiError("VALIDATION_ERROR","Choose due revision items.",400);}
    const cid=input.mode==="diagnostic"?T.ELECTRICITY_CONCEPTS[0].id:input.conceptId??selected[0]?.conceptId??T.ELECTRICITY_CONCEPTS[2].id;
    const sid=this.nextId(store,"session");const session:T.SessionSnapshot={id:sid,mode:input.mode,conceptId:input.mode==="diagnostic"?null:cid,status:"active",phase:"answering",version:1,progress:{answeredCount:0,targetQuestionCount:input.mode==="diagnostic"?8:input.mode==="revision"?2:3},currentQuestion:demoQuestion(cid,0),lastAttempt:null,summary:null,endedAt:null,updatedAt:this.timestamp(store)};l.sessions[sid]=session;l.selections[sid]=selected.map(i=>i.id);return session;
  });}
  async getSession(sid:string){await this.pause();const l=this.learner(this.load());const s=l.sessions[sid];if(!s)apiError("NOT_FOUND","Session not found.",404);return structuredClone(s);}
  submitAttempt(input:T.SubmitAttemptInput){return this.mutate("submit",input,(store,l)=>{
    const s=this.active(l,input);const q=s.currentQuestion!;
    if(!q||q.id!==input.questionId||!["answering","clarification"].includes(s.phase))apiError("INVALID_SESSION_STATE","This question is not awaiting an answer.");
    if(s.phase==="clarification"?input.clarificationOfAttemptId!==s.lastAttempt?.attemptId:input.clarificationOfAttemptId!==undefined)apiError("VALIDATION_ERROR","Clarification does not match the current attempt.",400);
    if(input.finalAnswerText.length>2000||input.reasoningText.length>8000||q.format==="free_response"&&input.selectedOptionId!==undefined||!answerMatches(q,input))apiError("VALIDATION_ERROR","Use the answer field required by this question format.",400);
    const p=l.concepts.find(p=>p.conceptId===q.conceptId)!;
    const status=input.clarificationOfAttemptId&&this.outcome==="needs_clarification"?"correct":this.outcome;
    const before=p.mastery;const at=this.timestamp(store);
    const misconception=status==="incorrect"&&q.conceptId==="resistance-and-ohms-law"&&input.reasoningText.includes("higher voltage increases resistance")?{misconceptionCode:T.MISCONCEPTION_CODES.VOLTAGE_CHANGES_FIXED_RESISTANCE,label:"Assumes voltage changes fixed resistance",evidence:"higher voltage increases resistance"}:null;
    if(status!=="needs_clarification"){
      // CANNED DEMO snapshots only; never used by HTTP mode or presented as grading.
      p.mastery=status==="correct"?0.7:status==="partial"?0.45:0.25;p.state=status==="incorrect"?"needs_practice":"developing";p.evidenceCount++;p.lastAssessedAt=at;
      if(misconception)p.recentMisconceptions=[{...misconception,observedAt:at},...p.recentMisconceptions].slice(0,5);
      if(!l.revision.some(i=>i.conceptId===p.conceptId&&i.status!=="completed"))l.revision.push({id:this.nextId(store,"revision"),conceptId:p.conceptId,status:"upcoming",dueAt:this.future(store,1),reason:"Sample next-day review (demo fixture, not a learning algorithm).",completedAt:null,completedSessionId:null});
      p.nextReviewAt=l.revision.filter(i=>i.conceptId===p.conceptId&&i.status!=="completed").map(i=>i.dueAt).sort()[0]??null;
    }
    const f:T.AttemptFeedback={attemptId:this.nextId(store,"attempt"),questionId:q.id,clarificationOfAttemptId:input.clarificationOfAttemptId??null,submittedAt:at,finalAnswerText:input.finalAnswerText,reasoningText:input.reasoningText,selectedOptionId:input.selectedOptionId??null,status,finalAnswerCorrect:status==="needs_clarification"?null:status!=="incorrect",reasoningStatus:misconception?"misconception":status==="correct"?"sound":input.reasoningText?"unclear":"not_provided",feedback:status==="needs_clarification"?"Please name the quantity that changes and explain the relationship.":misconception?"Current doubles: I = V/R. Resistance stays constant; higher voltage does not increase it in this question.":`Scripted ${status.replaceAll("_"," ")} feedback for ${conceptName(q.conceptId)}. Live mode will supply the backend's explanation of your reasoning.`,misconception,clarificationPrompt:status==="needs_clarification"?"Which quantity changes, and what equation supports your answer?":null,mastery:{conceptId:p.conceptId,before,after:p.mastery,evidenceCount:p.evidenceCount},nextReviewAt:p.nextReviewAt};
    const session:T.SessionSnapshot={...s,phase:status==="needs_clarification"?"clarification":"feedback",version:s.version+1,lastAttempt:f,progress:{...s.progress,answeredCount:s.progress.answeredCount+(status==="needs_clarification"?0:1)},updatedAt:at};l.sessions[s.id]=session;l.attempts.unshift({sessionId:s.id,conceptId:q.conceptId,question:q,feedback:f});return {...f,session,rewards:emptyRewards()};
  });}
  advanceSession(input:T.AdvanceSessionInput){return this.mutate("advance",input,(store,l)=>{
    const s=this.active(l,input);if(s.phase!=="feedback")apiError("INVALID_SESSION_STATE","Review a graded answer before continuing.");
    const at=this.timestamp(store);let session:T.SessionSnapshot;
    if(s.progress.answeredCount>=(s.progress.targetQuestionCount??3)){
      if(s.mode==="revision"){
        const selected=l.revision.filter(i=>l.selections[s.id]?.includes(i.id));
        for(const item of selected){item.status="completed";item.completedAt=at;item.completedSessionId=s.id;l.revision.push({id:this.nextId(store,"revision"),conceptId:item.conceptId,status:"upcoming",dueAt:this.future(store,1),reason:"Sample next revision after completion.",completedAt:null,completedSessionId:null});}
        for(const p of l.concepts)p.nextReviewAt=l.revision.filter(i=>i.conceptId===p.conceptId&&i.status!=="completed").map(i=>i.dueAt).sort()[0]??null;
      }
      const attempts=l.attempts.filter(a=>a.sessionId===s.id&&a.feedback.status!=="needs_clarification");
      session={...s,status:"completed",phase:"completed",version:s.version+1,currentQuestion:null,endedAt:at,updatedAt:at,summary:{sessionId:s.id,mode:s.mode,completedAt:at,answeredCount:attempts.length,correctCount:attempts.filter(a=>a.feedback.status==="correct").length,partialCount:attempts.filter(a=>a.feedback.status==="partial").length,incorrectCount:attempts.filter(a=>a.feedback.status==="incorrect").length,conceptProgress:structuredClone(l.concepts),recommendedConceptIds:l.concepts.filter(c=>c.state==="needs_practice"||c.state==="unassessed").map(c=>c.conceptId),feedback:"Session complete. These are sample learner results; continue with a recommended concept.",rewards:emptyRewards()}};
    }else{const cid=s.mode==="diagnostic"?T.ELECTRICITY_CONCEPTS[s.progress.answeredCount%8].id:s.conceptId!;session={...s,phase:"answering",version:s.version+1,currentQuestion:demoQuestion(cid,s.mode==="diagnostic"?0:s.progress.answeredCount),lastAttempt:null,updatedAt:at};}
    l.sessions[s.id]=session;return session;
  });}
  endSession(input:T.EndSessionInput){return this.mutate("end",input,(store,l)=>{const s=this.active(l,input);const at=this.timestamp(store);const ended:T.SessionSnapshot={...s,status:"abandoned",phase:"abandoned",version:s.version+1,currentQuestion:null,endedAt:at,updatedAt:at};l.sessions[s.id]=ended;return ended;});}
  async getRevisionQueue(){await this.pause();const store=this.load();return this.queue(store,this.learner(store));}
  private page<X>(items:X[],input?:T.PageInput):T.Page<X>{const limit=input?.limit??20;const offset=input?.cursor?Number(input.cursor):0;if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>50)apiError("VALIDATION_ERROR","Invalid history page.",400);return {items:items.slice(offset,offset+limit),nextCursor:offset+limit<items.length?String(offset+limit):null};}
  async getProgress(input?:T.PageInput){await this.pause();const l=this.learner(this.load());return {concepts:l.concepts,sessions:this.page(this.history(l),input),rewards:emptyRewards()};}
  async getAttemptHistory(input?:T.PageInput){await this.pause();return this.page(this.learner(this.load()).attempts,input);}
  async getClasses(){await this.pause();this.authorized(this.load(),true);return [{id:"sample-class-10a",name:"Class 10A · sample class",studentCount:2}];}
  async getClassDashboard(cid:string){await this.pause();const s=this.load();this.authorized(s,true);if(cid!=="sample-class-10a")apiError("NOT_FOUND","Class not found.",404);
    const students:T.TeacherStudentRow[]=Object.entries(s.learners).map(([sid,l])=>({id:sid,displayName:l.profile?.displayName??"New learner",concepts:l.concepts,dueRevisionCount:this.queue(s,l).items.filter(i=>i.status==="due").length,lastActiveAt:this.history(l)[0]?.updatedAt??null}));
    const groups=new Map<string,{conceptId:T.ConceptId;misconceptionCode:string;label:string;students:Set<string>}>();
    for(const student of students)for(const p of student.concepts)for(const m of p.recentMisconceptions){const key=`${p.conceptId}:${m.misconceptionCode}`;const g=groups.get(key)??{conceptId:p.conceptId,misconceptionCode:m.misconceptionCode,label:m.label,students:new Set<string>()};g.students.add(student.id);groups.set(key,g);}
    return {class:{id:cid,name:"Class 10A · sample class",studentCount:students.length},generatedAt:this.peekTime(s),students,commonMisconceptions:[...groups.values()].map(({students,...g})=>({...g,affectedStudentCount:students.size})),revisionPriorities:T.ELECTRICITY_CONCEPTS.map(c=>({conceptId:c.id,affectedStudentCount:students.filter(s=>s.concepts.some(p=>p.conceptId===c.id&&p.state==="needs_practice")).length,reason:"Sample learners needing practice."})).filter(x=>x.affectedStudentCount>0)};
  }
  async getStudentDetail(cid:string,sid:string){await this.pause();const s=this.load();this.authorized(s,true);if(cid!=="sample-class-10a"||!s.learners[sid])apiError("NOT_FOUND","Student not found in this class.",404);const dashboard=await this.getClassDashboard(cid);const l=s.learners[sid];return {classId:cid,student:dashboard.students.find(s=>s.id===sid)!,recentSessions:this.history(l).slice(0,10),recentAttempts:l.attempts.slice(0,20)};}
}
