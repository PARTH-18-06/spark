import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ELECTRICITY_CONCEPTS,
  type AttemptFeedback,
  type ConceptId,
  type ConceptProgress,
  type Question,
  type RevisionItem,
  type Rewards,
  type SessionMode,
  type SessionSnapshot,
  type SessionSummary,
} from "@/contracts/tutor";
import { applyEvaluation, masteryFeedback, type ExistingEvidence, type MasteryUpdate } from "@/lib/server/learning/mastery";
import { buildRevisionQueue, scheduleNextReview, type RevisionRecord } from "@/lib/server/learning/scheduling";
import { LEARNING_POLICY } from "@/lib/server/learning/policy";
import { selectQuestions, type BankQuestion, type SelectedQuestion } from "@/lib/server/learning/selection";
import type { TrustedRubric } from "@/lib/server/evaluation/types";
import { EvaluationService } from "@/lib/server/evaluation/service";
import { EvaluationServiceError, type EvaluationDecision } from "@/lib/server/evaluation/types";
import { ApiError } from "@/lib/server/http/errors";
import { attemptFeedbackSchema, sessionSnapshotSchema } from "@/lib/server/contracts/tutor-schemas";

export const NO_REWARDS: Rewards = { account: null, grants: [] };

export interface SessionAssignment {
  id: string;
  bankQuestionId?: string;
  question: Question;
  rubric: TrustedRubric;
  revisionItemId?: string;
}

export interface SessionStartContext {
  progress: ConceptProgress[];
  activeSessionId: string | null;
  revisionItems: RevisionItem[];
  previouslyAssignedBankIds: string[];
}

export interface MutationClaim {
  kind: "new" | "replay" | "in_progress";
  token: string | null;
  status?: number;
  body?: unknown;
}

export interface SessionRepository {
  getConceptProgress(studentId: string): Promise<ConceptProgress[]>;
  getStartContext(studentId: string): Promise<SessionStartContext>;
  claimMutation(input: { studentId: string; operation: string; path: string; key: string; payloadHash: string }): Promise<MutationClaim>;
  storeMutationResponse(input: { claimToken: string; status: number; body: unknown }): Promise<void>;
  releaseMutation(input: { studentId: string; operation: string; path: string; key: string; token: string }): Promise<void>;
  getSession(studentId: string, sessionId: string): Promise<SessionSnapshot | null>;
  getAssignment(studentId: string, sessionId: string, questionId: string): Promise<SessionAssignment | null>;
  startSession(input: { studentId: string; mode: SessionMode; conceptId: ConceptId | null; assignments: SessionAssignment[]; revisionItemIds: string[]; claimToken: string; }): Promise<SessionSnapshot>;
  finalizeAttempt(input: { studentId: string; sessionId: string; expectedVersion: number; assignment: SessionAssignment; answer: { finalAnswerText: string; reasoningText: string; selectedOptionId: string | null; clarificationOfAttemptId: string | null }; evaluation: EvaluationDecision; submittedAt: string; claimToken: string; }): Promise<{ feedback: AttemptFeedback; session: SessionSnapshot }>;
  advanceSession(input: { studentId: string; sessionId: string; expectedVersion: number; claimToken: string; }): Promise<SessionSnapshot>;
  endSession(input: { studentId: string; sessionId: string; expectedVersion: number; claimToken: string; }): Promise<SessionSnapshot>;
}

type StoredSession = {
  userId: string;
  snapshot: SessionSnapshot;
  assignments: SessionAssignment[];
  revisionItemIds: string[];
  graded: AttemptFeedback[];
};

type ClaimRecord = { payloadHash: string; token: string; expiresAt: number; response?: { status: number; body: unknown } };

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function iso(now: Date): string { return now.toISOString(); }
function progressRow(conceptId: ConceptId): ConceptProgress {
  return { conceptId, mastery: null, state: "unassessed", evidenceCount: 0, lastAssessedAt: null, nextReviewAt: null, recentMisconceptions: [] };
}
function hashPayload(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return `${(h >>> 0).toString(16).padStart(8, "0")}${text.length.toString(16).padStart(56, "0")}`;
}
function requireVersion(snapshot: SessionSnapshot, expected: number): void {
  if (snapshot.version !== expected) throw new ApiError({ code: "SESSION_VERSION_CONFLICT", message: "Session changed. Reload before submitting." });
}
function ensureActive(snapshot: SessionSnapshot): void {
  if (snapshot.status !== "active") throw new ApiError({ code: "INVALID_SESSION_STATE", message: "This session is no longer active." });
}

/** Deterministic repository used by handlers/tests; production uses the RPC adapter below. */
export class InMemorySessionRepository implements SessionRepository {
  private readonly progress = new Map<string, ConceptProgress[]>();
  private readonly sessions = new Map<string, StoredSession>();
  private readonly claims = new Map<string, ClaimRecord>();
  private readonly revisions = new Map<string, RevisionRecord[]>();
  private readonly bank: readonly BankQuestion[];
  private readonly rubrics: ReadonlyMap<string, TrustedRubric>;
  private readonly now: () => Date;

  constructor(input: { bank: readonly BankQuestion[]; rubrics: ReadonlyMap<string, TrustedRubric>; now?: () => Date }) {
    this.bank = input.bank;
    this.rubrics = input.rubrics;
    this.now = input.now ?? (() => new Date());
  }

  private key(userId: string, operation: string, path: string, idempotencyKey: string): string { return `${userId}\0${operation}\0${path}\0${idempotencyKey}`; }
  private progressFor(userId: string): ConceptProgress[] {
    const rows = this.progress.get(userId) ?? ELECTRICITY_CONCEPTS.map(({ id }) => progressRow(id));
    this.progress.set(userId, rows);
    return rows;
  }
  private updateProgress(userId: string, conceptId: ConceptId, update: MasteryUpdate, nextReviewAt: string | null): void {
    const rows = this.progressFor(userId);
    const index = rows.findIndex((row) => row.conceptId === conceptId);
    rows[index] = { conceptId, mastery: update.after, state: update.learningState, evidenceCount: update.evidenceCountAfter, lastAssessedAt: update.lastAssessedAt, nextReviewAt, recentMisconceptions: update.recentMisconceptions };
  }
  async getConceptProgress(studentId: string): Promise<ConceptProgress[]> { return clone(this.progressFor(studentId)); }
  async getStartContext(studentId: string): Promise<SessionStartContext> {
    const active = [...this.sessions.values()].find((s) => s.userId === studentId && s.snapshot.status === "active");
    const assigned = [...this.sessions.values()].filter((s) => s.userId === studentId).flatMap((s) => s.assignments.map((a) => a.bankQuestionId ?? a.rubric.questionId));
    const revisions = this.revisions.get(studentId) ?? [];
    return { progress: await this.getConceptProgress(studentId), activeSessionId: active?.snapshot.id ?? null, revisionItems: buildRevisionQueue(revisions, this.now()).items, previouslyAssignedBankIds: assigned };
  }
  async claimMutation(input: { studentId: string; operation: string; path: string; key: string; payloadHash: string }): Promise<MutationClaim> {
    const key = this.key(input.studentId, input.operation, input.path, input.key);
    const existing = this.claims.get(key);
    const now = Date.now();
    if (existing && existing.payloadHash !== input.payloadHash) throw new ApiError({ code: "IDEMPOTENCY_CONFLICT", message: "The idempotency key was already used with a different payload." });
    if (existing?.response) return { kind: "replay", token: existing.token, ...existing.response };
    if (existing && existing.expiresAt > now) return { kind: "in_progress", token: null };
    const token = randomUUID();
    this.claims.set(key, { payloadHash: input.payloadHash, token, expiresAt: now + 30_000 });
    return { kind: "new", token };
  }
  async releaseMutation(input: { studentId: string; operation: string; path: string; key: string; token: string }): Promise<void> {
    const record = this.claims.get(this.key(input.studentId, input.operation, input.path, input.key));
    if (record?.token === input.token) record.expiresAt = 0;
  }
  private completeClaim(token: string, status: number, body: unknown): void {
    const record = [...this.claims.entries()].find(([, value]) => value.token === token)?.[1];
    if (!record) throw new ApiError({ code: "REQUEST_IN_PROGRESS", message: "Request claim is no longer valid", retryable: true, retryAfterSeconds: 1 });
    record.response = { status, body: clone(body) };
    record.expiresAt = Number.MAX_SAFE_INTEGER;
  }
  async storeMutationResponse(input: { claimToken: string; status: number; body: unknown }): Promise<void> {
    this.completeClaim(input.claimToken, input.status, input.body);
  }
  async getSession(studentId: string, sessionId: string): Promise<SessionSnapshot | null> { const value = this.sessions.get(sessionId); return value?.userId === studentId ? clone(value.snapshot) : null; }
  async getAssignment(studentId: string, sessionId: string, questionId: string): Promise<SessionAssignment | null> { const value = this.sessions.get(sessionId); return value?.userId === studentId ? clone(value.assignments.find((a) => a.id === questionId) ?? null) : null; }
  async startSession(input: { studentId: string; mode: SessionMode; conceptId: ConceptId | null; assignments: SessionAssignment[]; revisionItemIds: string[]; claimToken: string; }): Promise<SessionSnapshot> {
    const active = [...this.sessions.values()].find((s) => s.userId === input.studentId && s.snapshot.status === "active");
    if (active) throw new ApiError({ code: "ACTIVE_SESSION_EXISTS", message: "An active learning session already exists.", activeSessionId: active.snapshot.id });
    const now = iso(this.now());
    const first = input.assignments[0];
    if (!first) throw new ApiError({ code: "VALIDATION_ERROR", message: "No eligible question-bank content remains" });
    const snapshot: SessionSnapshot = { id: `session_${randomUUID()}`, mode: input.mode, conceptId: input.conceptId, status: "active", phase: "answering", version: 1, progress: { answeredCount: 0, targetQuestionCount: input.assignments.length }, currentQuestion: first.question, lastAttempt: null, summary: null, endedAt: null, updatedAt: now };
    this.sessions.set(snapshot.id, { userId: input.studentId, snapshot, assignments: clone(input.assignments), revisionItemIds: [...input.revisionItemIds], graded: [] });
    return clone(snapshot);
  }
  async finalizeAttempt(input: { studentId: string; sessionId: string; expectedVersion: number; assignment: SessionAssignment; answer: { finalAnswerText: string; reasoningText: string; selectedOptionId: string | null; clarificationOfAttemptId: string | null }; evaluation: EvaluationDecision; submittedAt: string; claimToken: string; }): Promise<{ feedback: AttemptFeedback; session: SessionSnapshot }> {
    const stored = this.sessions.get(input.sessionId);
    if (!stored || stored.userId !== input.studentId) throw new ApiError({ code: "NOT_FOUND", message: "Session not found" });
    ensureActive(stored.snapshot); requireVersion(stored.snapshot, input.expectedVersion);
    if (stored.snapshot.currentQuestion?.id !== input.assignment.id) throw new ApiError({ code: "SESSION_VERSION_CONFLICT", message: "The current question changed. Reload before submitting." });
    const prior = stored.snapshot.lastAttempt;
    if (stored.snapshot.phase === "feedback") throw new ApiError({ code: "INVALID_SESSION_STATE", message: "Advance the session before submitting another answer." });
    if (stored.snapshot.phase === "clarification" && input.answer.clarificationOfAttemptId !== prior?.attemptId) throw new ApiError({ code: "INVALID_SESSION_STATE", message: "This clarification is no longer current." });
    const existing = this.progressFor(input.studentId).find((row) => row.conceptId === input.assignment.question.conceptId)!;
    const existingEvidence: ExistingEvidence = existing;
    const update = applyEvaluation(existingEvidence, {
      status: input.evaluation.status, finalAnswerCorrect: input.evaluation.finalAnswerCorrect, reasoningStatus: input.evaluation.reasoningStatus,
      misconception: input.evaluation.misconception, feedback: input.evaluation.feedback, clarificationPrompt: input.evaluation.clarificationPrompt,
    }, input.submittedAt);
    const nextReviewAt = input.evaluation.status === "needs_clarification" ? existing.nextReviewAt : iso(scheduleNextReview(input.evaluation.status, update.evidenceCountAfter, new Date(input.submittedAt)));
    const feedback: AttemptFeedback = { attemptId: `attempt_${randomUUID()}`, questionId: input.assignment.id, clarificationOfAttemptId: input.answer.clarificationOfAttemptId, submittedAt: input.submittedAt, finalAnswerText: input.answer.finalAnswerText, reasoningText: input.answer.reasoningText, selectedOptionId: input.answer.selectedOptionId, status: input.evaluation.status, finalAnswerCorrect: input.evaluation.finalAnswerCorrect, reasoningStatus: input.evaluation.reasoningStatus, feedback: input.evaluation.feedback, misconception: input.evaluation.misconception, clarificationPrompt: input.evaluation.clarificationPrompt, mastery: masteryFeedback(input.assignment.question.conceptId, update), nextReviewAt };
    if (input.evaluation.status !== "needs_clarification") {
      const records = this.revisions.get(input.studentId) ?? [];
      records.push({ id: `revision_${randomUUID()}`, conceptId: input.assignment.question.conceptId, status: "upcoming", dueAt: new Date(nextReviewAt as string), reason: input.evaluation.status === "incorrect" ? "Review the missed concept" : "Spaced practice", completedAt: null, completedSessionId: null });
      this.revisions.set(input.studentId, records);
      const earliest = records.filter((record) => record.conceptId === input.assignment.question.conceptId && record.status !== "completed").sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0]?.dueAt.toISOString() ?? null;
      this.updateProgress(input.studentId, input.assignment.question.conceptId, { ...update, lastAssessedAt: input.submittedAt }, earliest);
      stored.graded.push(feedback);
    }
    stored.snapshot = { ...stored.snapshot, phase: input.evaluation.status === "needs_clarification" ? "clarification" : "feedback", version: stored.snapshot.version + 1, progress: { ...stored.snapshot.progress, answeredCount: stored.snapshot.progress.answeredCount + (input.evaluation.status === "needs_clarification" ? 0 : 1) }, currentQuestion: input.assignment.question, lastAttempt: feedback, updatedAt: input.submittedAt };
    return { feedback: clone(feedback), session: clone(stored.snapshot) };
  }
  async advanceSession(input: { studentId: string; sessionId: string; expectedVersion: number; claimToken: string; }): Promise<SessionSnapshot> {
    const stored = this.sessions.get(input.sessionId);
    if (!stored || stored.userId !== input.studentId) throw new ApiError({ code: "NOT_FOUND", message: "Session not found" });
    ensureActive(stored.snapshot); requireVersion(stored.snapshot, input.expectedVersion);
    if (stored.snapshot.phase !== "feedback") throw new ApiError({ code: "INVALID_SESSION_STATE", message: "Advance is allowed only after feedback." });
    const next = stored.assignments.findIndex((a) => a.id === stored.snapshot.currentQuestion?.id) + 1;
    const now = iso(this.now());
    if (next < stored.assignments.length) {
      stored.snapshot = { ...stored.snapshot, phase: "answering", version: stored.snapshot.version + 1, currentQuestion: stored.assignments[next]!.question, lastAttempt: null, updatedAt: now };
      return clone(stored.snapshot);
    }
    const revisionIds = new Set(stored.revisionItemIds);
    if (revisionIds.size) {
      const revisionRows = this.revisions.get(input.studentId) ?? [];
      for (const row of revisionRows) {
        if (revisionIds.has(row.id) && row.status !== "completed") { row.status = "completed"; row.completedAt = new Date(now); row.completedSessionId = stored.snapshot.id; }
      }
      const rows = this.progressFor(input.studentId);
      for (const row of rows) {
        const next = revisionRows.filter((item) => item.conceptId === row.conceptId && item.status !== "completed").sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0]?.dueAt.toISOString() ?? null;
        row.nextReviewAt = next;
      }
    }
    const rows = await this.getConceptProgress(input.studentId);
    const counts = { correctCount: 0, partialCount: 0, incorrectCount: 0 };
    for (const attempt of stored.graded) counts[`${attempt.status}Count` as keyof typeof counts] += 1;
    const summary: SessionSummary = { sessionId: stored.snapshot.id, mode: stored.snapshot.mode, completedAt: now, answeredCount: stored.snapshot.progress.answeredCount, ...counts, conceptProgress: rows, recommendedConceptIds: rows.filter((r) => r.state !== "strong").slice(0, 3).map((r) => r.conceptId), feedback: "Keep practising the concepts that need the most evidence.", rewards: NO_REWARDS };
    stored.snapshot = { ...stored.snapshot, status: "completed", phase: "completed", version: stored.snapshot.version + 1, currentQuestion: null, summary, endedAt: now, updatedAt: now };
    return clone(stored.snapshot);
  }
  async endSession(input: { studentId: string; sessionId: string; expectedVersion: number; claimToken: string; }): Promise<SessionSnapshot> {
    const stored = this.sessions.get(input.sessionId);
    if (!stored || stored.userId !== input.studentId) throw new ApiError({ code: "NOT_FOUND", message: "Session not found" });
    ensureActive(stored.snapshot); requireVersion(stored.snapshot, input.expectedVersion);
    const now = iso(this.now());
    stored.snapshot = { ...stored.snapshot, status: "abandoned", phase: "abandoned", version: stored.snapshot.version + 1, currentQuestion: null, summary: null, endedAt: now, updatedAt: now };
    return clone(stored.snapshot);
  }
  /** Exposed for tests to verify replay storage without reaching into implementation internals. */
  revisionQueue(studentId: string): RevisionItem[] { return buildRevisionQueue((this.revisions.get(studentId) ?? []).map((r) => ({ ...r, dueAt: new Date(r.dueAt), completedAt: r.completedAt ? new Date(r.completedAt) : null })), this.now()).items; }
}

/** Production boundary. All writes are delegated to SECURITY DEFINER SQL functions, never held open around Groq. */
export class SupabaseSessionRepository implements SessionRepository {
  constructor(private readonly client: SupabaseClient) {}
  private async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const result = await this.client.rpc(name, args);
    if (result.error) {
      const message = result.error.message ?? "Learning persistence failed";
      const known = ["ACTIVE_SESSION_EXISTS", "ONBOARDING_REQUIRED", "NOT_FOUND", "SESSION_VERSION_CONFLICT", "INVALID_SESSION_STATE", "REQUEST_IN_PROGRESS", "FORBIDDEN", "IDEMPOTENCY_CONFLICT", "VALIDATION_ERROR"] as const;
      const code = known.find((candidate) => message.includes(candidate));
      if (code) throw new ApiError({ code, message: code === "REQUEST_IN_PROGRESS" ? "The same request is already being processed" : code === "SESSION_VERSION_CONFLICT" ? "Session changed. Reload before submitting." : message, retryable: code === "REQUEST_IN_PROGRESS", retryAfterSeconds: code === "REQUEST_IN_PROGRESS" ? 1 : undefined });
      throw new Error(`Learning RPC ${name} failed`, { cause: result.error });
    }
    return result.data as T;
  }
  async getConceptProgress(studentId: string): Promise<ConceptProgress[]> { return this.rpc("spark_get_concept_progress", { p_student_id: studentId }); }
  async getStartContext(studentId: string): Promise<SessionStartContext> { return this.rpc("spark_get_session_start_context", { p_student_id: studentId }); }
  async claimMutation(input: { studentId: string; operation: string; path: string; key: string; payloadHash: string }): Promise<MutationClaim> { return this.rpc("spark_claim_learning_mutation", { p_user_id: input.studentId, p_operation: input.operation, p_request_path: input.path, p_idempotency_key: input.key, p_payload_hash: input.payloadHash }); }
  async releaseMutation(input: { studentId: string; operation: string; path: string; key: string; token: string }): Promise<void> { await this.rpc("spark_release_learning_claim", { p_user_id: input.studentId, p_operation: input.operation, p_request_path: input.path, p_idempotency_key: input.key, p_claim_token: input.token }); }
  async storeMutationResponse(input: { claimToken: string; status: number; body: unknown }): Promise<void> {
    try {
      await this.rpc("spark_complete_learning_mutation", { p_claim_token: input.claimToken, p_response_status: input.status, p_response_body: input.body });
    } catch (error) {
      // The production lifecycle RPCs atomically persist their own replay body
      // before returning. Older deployed functions also perform the shared
      // completion step, and can report REQUEST_IN_PROGRESS when that second
      // completion compares an equivalent-but-differently-shaped JSON body.
      // The learning write is already committed in this case; do not turn a
      // successful attempt into a false retryable failure.
      if (error instanceof ApiError && error.code === "REQUEST_IN_PROGRESS") return;
      throw error;
    }
  }
  async getSession(studentId: string, sessionId: string): Promise<SessionSnapshot | null> { return this.rpc("spark_get_session_snapshot", { p_student_id: studentId, p_session_id: sessionId }); }
  async getAssignment(studentId: string, sessionId: string, questionId: string): Promise<SessionAssignment | null> { return this.rpc("spark_get_session_assignment", { p_student_id: studentId, p_session_id: sessionId, p_assignment_id: questionId }); }
  async startSession(input: { studentId: string; mode: SessionMode; conceptId: ConceptId | null; assignments: SessionAssignment[]; revisionItemIds: string[]; claimToken: string; }): Promise<SessionSnapshot> { return this.rpc("spark_start_learning_session", { p_student_id: input.studentId, p_mode: input.mode, p_concept_id: input.conceptId, p_assignments: input.assignments, p_revision_item_ids: input.revisionItemIds, p_claim_token: input.claimToken }); }
  async finalizeAttempt(input: { studentId: string; sessionId: string; expectedVersion: number; assignment: SessionAssignment; answer: { finalAnswerText: string; reasoningText: string; selectedOptionId: string | null; clarificationOfAttemptId: string | null }; evaluation: EvaluationDecision; submittedAt: string; claimToken: string; }): Promise<{ feedback: AttemptFeedback; session: SessionSnapshot }> {
    // The SQL RPC returns the contract's direct attempt-result body so it can
    // persist an exact idempotency replay. Adapt that boundary to the service's
    // internal `{ feedback, session }` shape before the service stores the
    // response a second time. Without this split, the second completion call
    // compares a different JSON body and incorrectly returns REQUEST_IN_PROGRESS.
    const raw = await this.rpc<AttemptFeedback & { session: SessionSnapshot; rewards: Rewards }>("spark_finalize_learning_attempt", {
      p_student_id: input.studentId,
      p_session_id: input.sessionId,
      p_expected_version: input.expectedVersion,
      p_assignment: input.assignment,
      p_answer: input.answer,
      p_evaluation: input.evaluation,
      p_submitted_at: input.submittedAt,
      p_claim_token: input.claimToken,
    });
    const { session, rewards: _rewards, ...feedbackBody } = raw;
    return { feedback: attemptFeedbackSchema.parse(feedbackBody), session: sessionSnapshotSchema.parse(session) };
  }
  async advanceSession(input: { studentId: string; sessionId: string; expectedVersion: number; claimToken: string; }): Promise<SessionSnapshot> { return this.rpc("spark_advance_learning_session", { p_student_id: input.studentId, p_session_id: input.sessionId, p_expected_version: input.expectedVersion, p_claim_token: input.claimToken }); }
  async endSession(input: { studentId: string; sessionId: string; expectedVersion: number; claimToken: string; }): Promise<SessionSnapshot> { return this.rpc("spark_end_learning_session", { p_student_id: input.studentId, p_session_id: input.sessionId, p_expected_version: input.expectedVersion, p_claim_token: input.claimToken }); }
}

export interface SessionServiceDependencies {
  repository: SessionRepository;
  evaluator: Pick<EvaluationService, "evaluate">;
  bank: readonly BankQuestion[];
  rubrics: ReadonlyMap<string, TrustedRubric>;
  misconceptionCatalog: Parameters<Pick<EvaluationService, "evaluate">["evaluate"]>[0]["misconceptionCatalog"];
  now?: () => Date;
}

export class StudentSessionService {
  private readonly now: () => Date;
  constructor(private readonly dependencies: SessionServiceDependencies) { this.now = dependencies.now ?? (() => new Date()); }
  concepts(studentId: string): Promise<ConceptProgress[]> { return this.dependencies.repository.getConceptProgress(studentId); }
  session(studentId: string, sessionId: string): Promise<SessionSnapshot | null> { return this.dependencies.repository.getSession(studentId, sessionId); }
  private async claim(studentId: string, operation: string, path: string, key: string, payload: unknown): Promise<MutationClaim> {
    return this.dependencies.repository.claimMutation({ studentId, operation, path, key, payloadHash: hashPayload(payload) });
  }
  async start(studentId: string, input: { mode: SessionMode; conceptId?: ConceptId; revisionItemIds?: string[]; idempotencyKey: string; path: string }): Promise<{ snapshot: SessionSnapshot; claim: MutationClaim }> {
    const claim = await this.claim(studentId, "startSession", input.path, input.idempotencyKey, input);
    if (claim.kind !== "new") return { snapshot: claim.body as SessionSnapshot, claim };
    try {
      const context = await this.dependencies.repository.getStartContext(studentId);
      if (context.activeSessionId) throw new ApiError({ code: "ACTIVE_SESSION_EXISTS", message: "An active learning session already exists.", activeSessionId: context.activeSessionId });
      let revisionItems = context.revisionItems;
      if (input.mode === "revision") {
        const ids = input.revisionItemIds ?? [];
        revisionItems = revisionItems.filter((row) => ids.includes(row.id) && row.status === "due");
        if (revisionItems.length !== ids.length) throw new ApiError({ code: "VALIDATION_ERROR", message: "Revision items must be non-empty, owned and not completed.", fieldErrors: { revisionItemIds: "Unknown or completed revision item" } });
      }
      const selected = selectQuestions({ mode: input.mode, conceptId: input.conceptId, revisionItems: revisionItems.map(({ id, conceptId }) => ({ id, conceptId })), progress: context.progress, bank: this.dependencies.bank, previouslyAssignedBankIds: context.previouslyAssignedBankIds, seed: randomUUID() });
      const assignments = selected.questions.map((item: SelectedQuestion) => { const rubric = this.dependencies.rubrics.get(item.bankId); if (!rubric) throw new ApiError({ code: "INTERNAL_ERROR", message: "Question rubric is unavailable", expose: false }); const id = randomUUID(); const question = { ...item.question, id }; return { id, bankQuestionId: item.bankId, question, rubric: { ...rubric, questionId: id }, ...(item.revisionItemId ? { revisionItemId: item.revisionItemId } : {}) }; });
      const snapshot = await this.dependencies.repository.startSession({ studentId, mode: input.mode, conceptId: input.conceptId ?? null, assignments, revisionItemIds: selected.coveredRevisionItemIds, claimToken: claim.token! });
      await this.dependencies.repository.storeMutationResponse({ claimToken: claim.token!, status: 201, body: snapshot });
      return { snapshot, claim };
    } catch (error) { await this.dependencies.repository.releaseMutation({ studentId, operation: "startSession", path: input.path, key: input.idempotencyKey, token: claim.token! }); throw error; }
  }
  async submit(studentId: string, input: { sessionId: string; questionId: string; expectedSessionVersion: number; finalAnswerText: string; reasoningText: string; selectedOptionId?: string; clarificationOfAttemptId?: string; idempotencyKey: string; path: string }): Promise<{ result: { feedback: AttemptFeedback; session: SessionSnapshot }; claim: MutationClaim }> {
    const claim = await this.claim(studentId, "submitAttempt", input.path, input.idempotencyKey, input);
    if (claim.kind !== "new") return { result: claim.body as { feedback: AttemptFeedback; session: SessionSnapshot }, claim };
    try {
      const assignment = await this.dependencies.repository.getAssignment(studentId, input.sessionId, input.questionId);
      if (!assignment) throw new ApiError({ code: "NOT_FOUND", message: "Session or question not found" });
      const session = await this.dependencies.repository.getSession(studentId, input.sessionId);
      if (!session) throw new ApiError({ code: "NOT_FOUND", message: "Session not found" });
      if (session.version !== input.expectedSessionVersion) throw new ApiError({ code: "SESSION_VERSION_CONFLICT", message: "Session changed. Reload before submitting." });
      if (session.phase === "feedback") throw new ApiError({ code: "INVALID_SESSION_STATE", message: "Advance the session before submitting another answer." });
      const decision = await this.dependencies.evaluator.evaluate({ question: assignment.question, rubric: assignment.rubric, answer: { finalAnswerText: input.finalAnswerText, reasoningText: input.reasoningText, selectedOptionId: input.selectedOptionId ?? null }, misconceptionCatalog: this.dependencies.misconceptionCatalog });
      const result = await this.dependencies.repository.finalizeAttempt({ studentId, sessionId: input.sessionId, expectedVersion: input.expectedSessionVersion, assignment, answer: { finalAnswerText: input.finalAnswerText, reasoningText: input.reasoningText, selectedOptionId: input.selectedOptionId ?? null, clarificationOfAttemptId: input.clarificationOfAttemptId ?? null }, evaluation: decision, submittedAt: this.now().toISOString(), claimToken: claim.token! });
      const body = { ...result.feedback, session: result.session, rewards: NO_REWARDS };
      await this.dependencies.repository.storeMutationResponse({ claimToken: claim.token!, status: 200, body });
      return { result, claim };
    } catch (error) { await this.dependencies.repository.releaseMutation({ studentId, operation: "submitAttempt", path: input.path, key: input.idempotencyKey, token: claim.token! }); if (error instanceof EvaluationServiceError) throw EvaluationService.toApiError(error); throw error; }
  }
  async advance(studentId: string, input: { sessionId: string; expectedSessionVersion: number; idempotencyKey: string; path: string }): Promise<{ snapshot: SessionSnapshot; claim: MutationClaim }> { return this.simpleMutation(studentId, "advanceSession", input.path, input.idempotencyKey, input, (token) => this.dependencies.repository.advanceSession({ studentId, sessionId: input.sessionId, expectedVersion: input.expectedSessionVersion, claimToken: token })); }
  async end(studentId: string, input: { sessionId: string; expectedSessionVersion: number; idempotencyKey: string; path: string }): Promise<{ snapshot: SessionSnapshot; claim: MutationClaim }> { return this.simpleMutation(studentId, "endSession", input.path, input.idempotencyKey, input, (token) => this.dependencies.repository.endSession({ studentId, sessionId: input.sessionId, expectedVersion: input.expectedSessionVersion, claimToken: token })); }
  private async simpleMutation(studentId: string, operation: string, path: string, key: string, payload: unknown, run: (token: string) => Promise<SessionSnapshot>): Promise<{ snapshot: SessionSnapshot; claim: MutationClaim }> {
    const claim = await this.claim(studentId, operation, path, key, payload);
    if (claim.kind !== "new") return { snapshot: claim.body as SessionSnapshot, claim };
    try { const snapshot = await run(claim.token!); await this.dependencies.repository.storeMutationResponse({ claimToken: claim.token!, status: 200, body: snapshot }); return { snapshot, claim }; } catch (error) { await this.dependencies.repository.releaseMutation({ studentId, operation, path, key, token: claim.token! }); throw error; }
  }
}

export function buildAssignments(bank: readonly BankQuestion[], rubrics: ReadonlyMap<string, TrustedRubric>): { bank: readonly BankQuestion[]; rubrics: ReadonlyMap<string, TrustedRubric> } { return { bank, rubrics }; }

