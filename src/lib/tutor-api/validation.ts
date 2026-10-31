import {
  CHAPTER_ID,
  ELECTRICITY_CONCEPTS,
  MISCONCEPTION_CODES,
  type AttemptFeedback,
  type Question,
  type SessionSnapshot,
  type SubmitAttemptInput,
  type TutorApi,
} from "../../contracts/tutor";

type Guard = (value: unknown) => boolean;
const record = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str: Guard = x => typeof x === "string";
const nonempty: Guard = x => typeof x === "string" && x.length > 0;
const bool: Guard = x => typeof x === "boolean";
const num: Guard = x => typeof x === "number" && Number.isFinite(x);
const count: Guard = x => num(x) && Number.isInteger(x) && (x as number) >= 0;
const mastery: Guard = x => num(x) && (x as number) >= 0 && (x as number) <= 1;
const instant: Guard = x => typeof x === "string" && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(x) && Number.isFinite(Date.parse(x));
const date: Guard = x => typeof x === "string" && /^\d{4}-\d\d-\d\d$/.test(x) && Number.isFinite(Date.parse(x+"T00:00:00Z")) && new Date(x+"T00:00:00Z").toISOString().slice(0,10) === x;
const zone: Guard = x => { try { if (typeof x !== "string") return false; new Intl.DateTimeFormat("en", { timeZone:x }); return true; } catch { return false; } };
const literal = (...values: unknown[]): Guard => x => values.includes(x);
const nullable = (g: Guard): Guard => x => x === null || g(x);
const optional = (g: Guard): Guard => x => x === undefined || g(x);
const array = (g: Guard): Guard => x => Array.isArray(x) && x.every(g);
const object = (shape: Record<string, Guard>): Guard => x => record(x) && Object.keys(x).every(k => k in shape) && Object.entries(shape).every(([k,g])=>g(x[k]));
const conceptId = literal(...ELECTRICITY_CONCEPTS.map(c=>c.id));
const stableMisconceptionCodes = new Set<string>(Object.values(MISCONCEPTION_CODES));
const code: Guard = x => typeof x === "string" && stableMisconceptionCodes.has(x);
const misconception = object({ misconceptionCode:code, label:nonempty, evidence:nullable(str) });
const recent = object({ misconceptionCode:code, label:nonempty, evidence:nullable(str), observedAt:instant });
const concept = object({ conceptId, mastery:nullable(mastery), state:literal("unassessed","needs_practice","developing","strong"), evidenceCount:count, lastAssessedAt:nullable(instant), nextReviewAt:nullable(instant), recentMisconceptions:array(recent) });
const conceptProgress: Guard = x => concept(x) && record(x) && ((x.mastery === null) === (x.state === "unassessed"));
const fullProgress: Guard = x => Array.isArray(x) && x.length===8 && x.every(conceptProgress) && new Set(x.map(p=>p.conceptId)).size===8;
const definition = object({ id:conceptId,title:nonempty,description:str,prerequisiteIds:array(conceptId) });
const profile = object({ displayName:nonempty, chapterId:literal(CHAPTER_ID), examDate:nullable(date), timeZone:zone, onboardingComplete:bool });
const user = object({ id:nonempty,displayName:nonempty,roles:array(literal("student","teacher")) });
const authShape = object({ authenticated:bool,user:nullable(user),studentProfile:nullable(profile),csrfToken:nullable(nonempty),expiresAt:nullable(instant) });
const auth: Guard = x => authShape(x) && record(x) && (x.authenticated ? x.user!==null && x.csrfToken!==null && x.expiresAt!==null : x.user===null && x.studentProfile===null && x.csrfToken===null && x.expiresAt===null);
const option = object({id:nonempty,text:nonempty});
const questionShape = object({id:nonempty,conceptId,format:literal("free_response","multiple_choice"),prompt:nonempty,difficulty:literal("easy","medium","hard"),options:optional(array(option)),hint:optional(str),expectedUnit:optional(str)});
export const validQuestion: Guard = x => {
  if (!questionShape(x)) return false;
  const q=x as Question;
  return q.format === "free_response" ? q.options===undefined : q.options.length>0 && new Set(q.options.map(o=>o.id)).size===q.options.length;
};
const rewards = object({account:literal(null),grants:x=>Array.isArray(x)&&x.length===0});
const change = object({conceptId,before:nullable(mastery),after:nullable(mastery),evidenceCount:count});
const feedbackShape = object({attemptId:nonempty,questionId:nonempty,clarificationOfAttemptId:nullable(nonempty),submittedAt:instant,finalAnswerText:str,reasoningText:str,selectedOptionId:nullable(nonempty),status:literal("correct","partial","incorrect","needs_clarification"),finalAnswerCorrect:nullable(bool),reasoningStatus:literal("sound","misconception","unclear","not_provided"),feedback:str,misconception:nullable(misconception),clarificationPrompt:nullable(nonempty),mastery:change,nextReviewAt:nullable(instant)});
export const validFeedback: Guard = x => {
  if (!feedbackShape(x)) return false;
  const f=x as AttemptFeedback;
  if (f.misconception?.evidence && !f.reasoningText.includes(f.misconception.evidence)) return false;
  if (f.status === "needs_clarification") {
    return f.finalAnswerCorrect === null
      && f.reasoningStatus === "unclear"
      && f.misconception === null
      && !!f.clarificationPrompt
      && f.mastery.before === f.mastery.after;
  }
  return f.clarificationPrompt === null && f.finalAnswerCorrect !== null;
};
const summaryShape = object({sessionId:nonempty,mode:literal("diagnostic","practice","revision"),completedAt:instant,answeredCount:count,correctCount:count,partialCount:count,incorrectCount:count,conceptProgress:fullProgress,recommendedConceptIds:array(conceptId),feedback:str,rewards});
const summary: Guard = x => summaryShape(x) && record(x) && x.answeredCount === (x.correctCount as number)+(x.partialCount as number)+(x.incorrectCount as number);
const sessionShape = object({id:nonempty,mode:literal("diagnostic","practice","revision"),conceptId:nullable(conceptId),status:literal("active","completed","abandoned"),phase:literal("answering","feedback","clarification","completed","abandoned"),version:x=>count(x)&&(x as number)>=1,progress:object({answeredCount:count,targetQuestionCount:nullable(count)}),currentQuestion:nullable(validQuestion),lastAttempt:nullable(validFeedback),summary:nullable(summary),endedAt:nullable(instant),updatedAt:instant});
export const validSession: Guard = x => {
  if (!sessionShape(x)) return false;
  const s=x as SessionSnapshot;
  if (s.mode === "diagnostic" && s.conceptId !== null) return false;
  if (s.progress.targetQuestionCount !== null && s.progress.answeredCount > s.progress.targetQuestionCount) return false;
  if(s.status==="completed") return s.phase==="completed" && s.currentQuestion===null && !!s.summary && s.endedAt===s.summary.completedAt && s.summary.sessionId===s.id && s.summary.mode===s.mode && s.progress.answeredCount===s.summary.answeredCount;
  if(s.status==="abandoned") return s.phase==="abandoned" && s.currentQuestion===null && s.summary===null && s.endedAt!==null;
  if(s.summary!==null || s.endedAt!==null || !s.currentQuestion) return false;
  if(s.phase==="answering") return s.lastAttempt===null;
  if(s.phase!=="feedback" && s.phase!=="clarification") return false;
  return !!s.lastAttempt && s.lastAttempt.questionId===s.currentQuestion.id && s.lastAttempt.mastery.conceptId===s.currentQuestion.conceptId && ((s.phase==="clarification")===(s.lastAttempt.status==="needs_clarification")) && answerMatches(s.currentQuestion,s.lastAttempt);
};
export function answerMatches(q: Question, a: { finalAnswerText:string; selectedOptionId?:string|null }) {
  return q.format==="multiple_choice" ? a.finalAnswerText==="" && q.options.some(o=>o.id===a.selectedOptionId) : a.finalAnswerText.trim().length>0 && a.selectedOptionId==null;
}

/** Validate the wire-level authoritative answer fields before any HTTP request. */
export function validSubmitAnswer(input: Pick<SubmitAttemptInput, "finalAnswerText" | "reasoningText" | "selectedOptionId">): boolean {
  if (typeof input.finalAnswerText !== "string" || input.finalAnswerText.length > 2_000) return false;
  if (typeof input.reasoningText !== "string" || input.reasoningText.length > 8_000) return false;
  if (input.selectedOptionId !== undefined) {
    return input.finalAnswerText === "" && typeof input.selectedOptionId === "string" && input.selectedOptionId.length > 0;
  }
  return input.finalAnswerText.trim().length > 0;
}
export function canonical(value: unknown): string {
  if(Array.isArray(value)) return "["+value.map(canonical).join(",")+"]";
  if(record(value)) return "{"+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";
  return JSON.stringify(value);
}
const historyShape=object({id:nonempty,mode:literal("diagnostic","practice","revision"),status:literal("active","completed","abandoned"),answeredCount:count,updatedAt:instant,completedAt:nullable(instant),endedAt:nullable(instant)});
const history:Guard=x=>historyShape(x)&&record(x)&&(x.status==="active" ? x.endedAt===null&&x.completedAt===null : x.status==="completed" ? x.endedAt!==null&&x.endedAt===x.completedAt : x.endedAt!==null&&x.completedAt===null);
const page=(g:Guard)=>object({items:array(g),nextCursor:nullable(nonempty)});
const attemptHistoryShape=object({sessionId:nonempty,conceptId,question:validQuestion,feedback:validFeedback});
const attemptHistory:Guard=x=>attemptHistoryShape(x)&&record(x)
  && record(x.question)&&record(x.feedback)
  && x.conceptId===x.question.conceptId
  && x.feedback.questionId===x.question.id
  && answerMatches(x.question as unknown as Question,x.feedback as unknown as AttemptFeedback);
const classSummary=object({id:nonempty,name:nonempty,studentCount:count});
const studentRow=object({id:nonempty,displayName:nonempty,concepts:fullProgress,dueRevisionCount:count,lastActiveAt:nullable(instant)});
const revisionItem=object({id:nonempty,conceptId,status:literal("due","upcoming","completed"),dueAt:instant,reason:str,completedAt:nullable(instant),completedSessionId:nullable(nonempty)});
const revisionShape=object({generatedAt:instant,items:array(revisionItem)});
const revision:Guard=x=>revisionShape(x)&&record(x)&&(x.items as Record<string,unknown>[]).every(i=>i.status==="completed" ? i.completedAt!==null&&i.completedSessionId!==null : i.completedAt===null&&i.completedSessionId===null&&((i.status==="due")===(Date.parse(i.dueAt as string)<=Date.parse(x.generatedAt as string))));
const result:Guard=x=>{
  if(!record(x))return false;
  const {session,rewards:r,...f}=x;
  return validFeedback(f)&&validSession(session)&&rewards(r)&&canonical(f)===canonical((session as SessionSnapshot).lastAttempt);
};
const classShape=object({class:classSummary,generatedAt:instant,students:array(studentRow),commonMisconceptions:array(object({conceptId,misconceptionCode:code,label:nonempty,affectedStudentCount:count})),revisionPriorities:array(object({conceptId,affectedStudentCount:count,reason:str}))});
const classDashboard:Guard=x=>classShape(x)&&record(x)&&new Set((x.commonMisconceptions as Record<string,unknown>[]).map(m=>`${m.conceptId}:${m.misconceptionCode}`)).size===(x.commonMisconceptions as unknown[]).length;
export const validators: Record<keyof TutorApi,Guard> = {
  getCurrentUser:auth, signIn:x=>auth(x)&&record(x)&&x.authenticated===true, signOut:x=>x===undefined,
  saveStudentProfile:profile,
  getStudentDashboard:object({profile,activeSession:nullable(history),dueRevisionCount:count,recommendedConceptId:nullable(conceptId),concepts:fullProgress,recentSessions:array(history),rewards}),
  getConcepts:x=>object({chapterId:literal(CHAPTER_ID),concepts:array(definition),progress:fullProgress})(x)&&record(x)&&(x.concepts as unknown[]).length===8&&new Set((x.concepts as {id:string}[]).map(c=>c.id)).size===8,
  startSession:validSession,getSession:validSession,submitAttempt:result,advanceSession:validSession,endSession:x=>validSession(x)&&(x as SessionSnapshot).status==="abandoned",
  getRevisionQueue:revision,getProgress:object({concepts:fullProgress,sessions:page(history),rewards}),getAttemptHistory:page(attemptHistory),getClasses:array(classSummary),getClassDashboard:classDashboard,
  getStudentDetail:object({classId:nonempty,student:studentRow,recentSessions:array(history),recentAttempts:array(attemptHistory)}),
};
const errorCodes=literal("VALIDATION_ERROR","AUTH_REQUIRED","INVALID_CREDENTIALS","FORBIDDEN","NOT_FOUND","ONBOARDING_REQUIRED","ACTIVE_SESSION_EXISTS","SESSION_VERSION_CONFLICT","INVALID_SESSION_STATE","IDEMPOTENCY_CONFLICT","REQUEST_IN_PROGRESS","RATE_LIMITED","AI_UNAVAILABLE","INTERNAL_ERROR");
const errorShape=object({error:object({code:errorCodes,message:str,retryable:bool,requestId:nonempty,fieldErrors:optional(x=>record(x)&&Object.values(x).every(str)),retryAfterSeconds:optional(count),activeSessionId:optional(nonempty)})});
export const validError:Guard=x=>{
  if(!errorShape(x)||!record(x)||!record(x.error))return false;
  const error=x.error;
  const alwaysRetryable=["REQUEST_IN_PROGRESS","RATE_LIMITED","AI_UNAVAILABLE"].includes(error.code as string);
  const neverRetryable=!alwaysRetryable&&error.code!=="INTERNAL_ERROR";
  if((alwaysRetryable&&error.retryable!==true)||(neverRetryable&&error.retryable!==false))return false;
  if(error.retryAfterSeconds!==undefined&&error.retryable!==true)return false;
  return error.code==="ACTIVE_SESSION_EXISTS" ? typeof error.activeSessionId==="string" : error.activeSessionId===undefined;
};

export function validErrorForStatus(value:unknown,status:number):boolean{
  if(!validError(value)||!record(value)||!record(value.error))return false;
  const code=value.error.code as string;
  const allowed:Record<number,string[]>={
    400:["VALIDATION_ERROR"],
    401:["AUTH_REQUIRED","INVALID_CREDENTIALS"],
    403:["FORBIDDEN"],
    404:["NOT_FOUND"],
    409:["ONBOARDING_REQUIRED","ACTIVE_SESSION_EXISTS","SESSION_VERSION_CONFLICT","INVALID_SESSION_STATE","IDEMPOTENCY_CONFLICT","REQUEST_IN_PROGRESS"],
    429:["RATE_LIMITED"],
    500:["INTERNAL_ERROR"],
    503:["AI_UNAVAILABLE"],
  };
  return (allowed[status]??[]).includes(code);
}
