/**
 * Spark / Class 10 Electricity — PROPOSED shared contract v1.1.0.
 * Both teammates must agree before freezing. No runtime dependencies.
 * Server owns identity, authorization, grading, mastery, scheduling and rewards.
 */
export const TUTOR_CONTRACT_VERSION = "1.1.0" as const;
export const CHAPTER_ID = "class-10-physics-electricity" as const;
export type ChapterId = typeof CHAPTER_ID;
export type IsoDateTime = string; // ISO 8601 instant with UTC offset; prefer Z.
export type DateOnly = string; // YYYY-MM-DD, not a midnight UTC timestamp.
export type Mastery = number; // Runtime-validated inclusive range 0..1.
export type ConceptId =
  | "electric-current-and-charge" | "potential-difference"
  | "resistance-and-ohms-law" | "factors-affecting-resistance"
  | "resistors-in-series" | "resistors-in-parallel"
  | "electric-power" | "electrical-energy";
export interface ConceptDefinition {
  id: ConceptId;
  title: string;
  description: string;
  prerequisiteIds: readonly ConceptId[];
}
/** Prerequisites describe learning relationships, not mandatory game locks. */
export const ELECTRICITY_CONCEPTS = [
  { id: "electric-current-and-charge", title: "Electric current and charge", description: "Charge flow, I = Q/t, amperes and coulombs.", prerequisiteIds: [] },
  { id: "potential-difference", title: "Potential difference", description: "Work per unit charge and the volt.", prerequisiteIds: ["electric-current-and-charge"] },
  { id: "resistance-and-ohms-law", title: "Resistance and Ohm's law", description: "Resistance and the relationship I = V/R.", prerequisiteIds: ["electric-current-and-charge", "potential-difference"] },
  { id: "factors-affecting-resistance", title: "Factors affecting resistance", description: "Length, cross-sectional area, material and temperature.", prerequisiteIds: ["resistance-and-ohms-law"] },
  { id: "resistors-in-series", title: "Resistors in series", description: "Equivalent resistance, current and voltage in series.", prerequisiteIds: ["resistance-and-ohms-law"] },
  { id: "resistors-in-parallel", title: "Resistors in parallel", description: "Equivalent resistance, branch currents and voltage in parallel.", prerequisiteIds: ["resistance-and-ohms-law"] },
  { id: "electric-power", title: "Electric power", description: "P = VI and equivalent power relationships.", prerequisiteIds: ["resistance-and-ohms-law"] },
  { id: "electrical-energy", title: "Electrical energy", description: "E = Pt, joules, kilowatt-hours and energy consumption.", prerequisiteIds: ["electric-power"] },
] as const satisfies readonly ConceptDefinition[];

export interface User {
  id: string;
  displayName: string;
  roles: ("student" | "teacher")[];
}
export interface StudentProfile {
  displayName: string;
  chapterId: ChapterId;
  examDate: DateOnly | null;
  timeZone: string; // IANA zone, also used for any streak day boundary.
  onboardingComplete: boolean;
}
export type AuthState =
  | { authenticated: false; user: null; studentProfile: null; csrfToken: null; expiresAt: null }
  | { authenticated: true; user: User; studentProfile: StudentProfile | null; csrfToken: string; expiresAt: IsoDateTime };
export interface SignInInput { email: string; password: string }
export type AuthenticatedState = Extract<AuthState, { authenticated: true }>;
export interface SaveStudentProfileInput {
  displayName: string;
  chapterId: ChapterId;
  examDate: DateOnly | null;
  timeZone: string;
}
export type ConceptLearningState = "unassessed" | "needs_practice" | "developing" | "strong";
/** Stable backend-catalog code, never generated from display wording. */
export type MisconceptionCode = string;
export const MISCONCEPTION_CODES = {
  VOLTAGE_CHANGES_FIXED_RESISTANCE: "OHM_FIXED_RESISTANCE_CHANGES_WITH_VOLTAGE",
} as const;
export interface RecentMisconception extends Misconception { observedAt: IsoDateTime }
export interface ConceptProgress {
  conceptId: ConceptId;
  mastery: Mastery | null;
  state: ConceptLearningState; // unassessed iff mastery === null.
  evidenceCount: number; // Graded question assignments, not HTTP requests.
  lastAssessedAt: IsoDateTime | null;
  nextReviewAt: IsoDateTime | null;
  recentMisconceptions: RecentMisconception[];
}
export interface ConceptsResponse {
  chapterId: ChapterId;
  concepts: ConceptDefinition[];
  progress: ConceptProgress[]; // Exactly one entry per chapter concept.
}
export type SessionMode = "diagnostic" | "practice" | "revision";
export type EvaluationStatus = "correct" | "partial" | "incorrect" | "needs_clarification";
export interface QuestionBase {
  id: string; // Assigned-question ID within the session, not an internal bank ID.
  conceptId: ConceptId;
  prompt: string;
  difficulty: "easy" | "medium" | "hard";
  hint?: string; // Pedagogical hint; never the answer or grading rubric.
  expectedUnit?: string;
}
export type Question = QuestionBase & (
  | { format: "multiple_choice"; options: { id: string; text: string }[] }
  | { format: "free_response"; options?: never }
);
export interface Misconception {
  misconceptionCode: MisconceptionCode;
  label: string;
  evidence: string | null; // Exact excerpt from confirmed student reasoning.
}
export interface RewardAccount {
  totalXp: number;
  currentStreakDays: number;
  longestStreakDays: number;
  lastActivityDate: DateOnly | null;
  timeZone: string;
}
export interface RewardGrant {
  eventId: string; // Stable across replays; deduplicate celebrations by this ID.
  awardedXp: number;
  reason: "assessed_attempt" | "session_completed" | "revision_completed";
}
export interface Rewards {
  account: null; // Rewards disabled throughout proposed v1.1.0.
  grants: []; // Reserved reward types above require a later agreed version.
}
export interface AttemptFeedback {
  attemptId: string;
  questionId: string;
  clarificationOfAttemptId: string | null;
  submittedAt: IsoDateTime;
  finalAnswerText: string;
  reasoningText: string;
  selectedOptionId: string | null;
  status: EvaluationStatus;
  finalAnswerCorrect: boolean | null;
  reasoningStatus: "sound" | "misconception" | "unclear" | "not_provided";
  feedback: string;
  misconception: Misconception | null;
  clarificationPrompt: string | null;
  mastery: {
    conceptId: ConceptId;
    before: Mastery | null;
    after: Mastery | null;
    evidenceCount: number;
  };
  nextReviewAt: IsoDateTime | null;
}
export interface SessionSummary {
  sessionId: string;
  mode: SessionMode;
  completedAt: IsoDateTime;
  answeredCount: number;
  correctCount: number;
  partialCount: number;
  incorrectCount: number;
  conceptProgress: ConceptProgress[];
  recommendedConceptIds: ConceptId[];
  feedback: string;
  rewards: Rewards;
}
export interface SessionSnapshot {
  id: string;
  mode: SessionMode;
  conceptId: ConceptId | null;
  status: "active" | "completed" | "abandoned";
  phase: "answering" | "feedback" | "clarification" | "completed" | "abandoned";
  version: number; // Increments once per accepted session mutation.
  progress: { answeredCount: number; targetQuestionCount: number | null };
  currentQuestion: Question | null;
  lastAttempt: AttemptFeedback | null;
  summary: SessionSummary | null; // Present iff completed, including after refresh.
  endedAt: IsoDateTime | null; // null while active; terminal transition timestamp.
  updatedAt: IsoDateTime;
}
export interface StartSessionInput {
  mode: SessionMode;
  conceptId?: ConceptId;
  revisionItemIds?: string[];
  idempotencyKey: string;
}
export interface SubmitAttemptInput {
  sessionId: string;
  questionId: string;
  expectedSessionVersion: number;
  /** Nonempty for free_response; exactly empty for multiple_choice. */
  finalAnswerText: string;
  reasoningText: string;
  /** Required for multiple_choice; forbidden for free_response. */
  selectedOptionId?: string;
  /** Only when answering the current clarification request. */
  clarificationOfAttemptId?: string;
  idempotencyKey: string;
}
export interface AttemptResult extends AttemptFeedback {
  /** Persisted session with the same feedback in lastAttempt. */
  session: SessionSnapshot;
  rewards: Rewards;
}
export interface AdvanceSessionInput {
  sessionId: string;
  expectedSessionVersion: number;
  idempotencyKey: string;
}
export interface EndSessionInput {
  sessionId: string;
  expectedSessionVersion: number;
  idempotencyKey: string;
}
/** Mutation keys are headers; all other input fields are sent as JSON. */
export type HttpMutationBody<T extends { idempotencyKey: string }> = Omit<T, "idempotencyKey">;
export interface SessionHistoryItem {
  id: string;
  mode: SessionMode;
  status: "active" | "completed" | "abandoned";
  answeredCount: number;
  updatedAt: IsoDateTime;
  completedAt: IsoDateTime | null;
  endedAt: IsoDateTime | null; // Includes abandonment; completedAt remains null then.
}
export interface StudentDashboard {
  profile: StudentProfile;
  activeSession: SessionHistoryItem | null;
  dueRevisionCount: number;
  recommendedConceptId: ConceptId | null;
  concepts: ConceptProgress[];
  recentSessions: SessionHistoryItem[]; // At most 5, newest first.
  rewards: Rewards;
}
export interface RevisionItem {
  id: string;
  conceptId: ConceptId;
  status: "due" | "upcoming" | "completed";
  dueAt: IsoDateTime;
  reason: string;
  completedAt: IsoDateTime | null;
  completedSessionId: string | null;
}
export interface RevisionQueue {
  generatedAt: IsoDateTime;
  items: RevisionItem[]; // Status is server-owned; frontend only formats dates.
}
export interface PageInput { cursor?: string; limit?: number }
export interface Page<T> { items: T[]; nextCursor: string | null }
export interface ProgressResponse {
  concepts: ConceptProgress[];
  sessions: Page<SessionHistoryItem>;
  rewards: Rewards;
}
export interface AttemptHistoryItem {
  sessionId: string;
  conceptId: ConceptId;
  question: Question;
  feedback: AttemptFeedback;
}
export interface ClassSummary { id: string; name: string; studentCount: number }
export interface TeacherStudentRow {
  id: string;
  displayName: string;
  concepts: ConceptProgress[];
  dueRevisionCount: number;
  lastActiveAt: IsoDateTime | null;
}
export interface ClassDashboard {
  class: ClassSummary;
  generatedAt: IsoDateTime;
  students: TeacherStudentRow[];
  commonMisconceptions: { conceptId: ConceptId; misconceptionCode: MisconceptionCode; label: string; affectedStudentCount: number }[];
  revisionPriorities: { conceptId: ConceptId; affectedStudentCount: number; reason: string }[];
}
export interface TeacherStudentDetail {
  classId: string;
  student: TeacherStudentRow;
  recentSessions: SessionHistoryItem[]; // At most 10.
  recentAttempts: AttemptHistoryItem[]; // At most 20; submitted answers only.
}
export type ApiErrorCode =
  | "VALIDATION_ERROR" | "AUTH_REQUIRED" | "INVALID_CREDENTIALS" | "FORBIDDEN"
  | "NOT_FOUND" | "ONBOARDING_REQUIRED" | "ACTIVE_SESSION_EXISTS"
  | "SESSION_VERSION_CONFLICT" | "INVALID_SESSION_STATE" | "IDEMPOTENCY_CONFLICT"
  | "REQUEST_IN_PROGRESS" | "RATE_LIMITED" | "AI_UNAVAILABLE" | "INTERNAL_ERROR";
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
    requestId: string;
    fieldErrors?: Record<string, string>;
    retryAfterSeconds?: number;
    activeSessionId?: string;
  };
}
export interface TutorApiError extends Error { kind: "http"; status: number; body: ApiErrorBody }
export interface TutorNetworkError extends Error { kind: "network"; retryable: true }
/** Adapter-created error, not a server ApiErrorBody/code. Never expose raw body. */
export interface TutorProtocolError extends Error {
  kind: "protocol";
  reason: "non_json_response" | "malformed_json" | "invalid_error_payload"
    | "invalid_success_payload" | "unexpected_status";
  status: number; // Actual HTTP status, even when it is 200.
  retryable: false; // No automatic retry loop for a broken protocol/schema.
  outcome: "unknown" | "not_applicable"; // unknown for any mutating request.
  requestId: string | null; // Trusted header/validated value only.
}
/** Shared by MockTutorApi and HttpTutorApi. IDs are opaque strings. */
export interface TutorApi {
  getCurrentUser(): Promise<AuthState>;
  signIn(input: SignInInput): Promise<AuthenticatedState>;
  signOut(): Promise<void>;
  saveStudentProfile(input: SaveStudentProfileInput): Promise<StudentProfile>;
  getStudentDashboard(): Promise<StudentDashboard>;
  getConcepts(): Promise<ConceptsResponse>;
  startSession(input: StartSessionInput): Promise<SessionSnapshot>;
  getSession(sessionId: string): Promise<SessionSnapshot>;
  submitAttempt(input: SubmitAttemptInput): Promise<AttemptResult>;
  advanceSession(input: AdvanceSessionInput): Promise<SessionSnapshot>;
  endSession(input: EndSessionInput): Promise<SessionSnapshot>;
  getRevisionQueue(): Promise<RevisionQueue>;
  getProgress(input?: PageInput): Promise<ProgressResponse>;
  getAttemptHistory(input?: PageInput): Promise<Page<AttemptHistoryItem>>;
  getClasses(): Promise<ClassSummary[]>;
  getClassDashboard(classId: string): Promise<ClassDashboard>;
  getStudentDetail(classId: string, studentId: string): Promise<TeacherStudentDetail>;
}
export const TUTOR_HTTP_ENDPOINTS = {
  getCurrentUser: "GET /api/v1/auth/me",
  signIn: "POST /api/v1/auth/sign-in",
  signOut: "POST /api/v1/auth/sign-out",
  saveStudentProfile: "PUT /api/v1/me/profile",
  getStudentDashboard: "GET /api/v1/student/dashboard",
  getConcepts: "GET /api/v1/concepts",
  startSession: "POST /api/v1/sessions",
  getSession: "GET /api/v1/sessions/{sessionId}",
  submitAttempt: "POST /api/v1/sessions/{sessionId}/attempts",
  advanceSession: "POST /api/v1/sessions/{sessionId}/advance",
  endSession: "POST /api/v1/sessions/{sessionId}/end",
  getRevisionQueue: "GET /api/v1/revision",
  getProgress: "GET /api/v1/progress",
  getAttemptHistory: "GET /api/v1/attempts",
  getClasses: "GET /api/v1/teacher/classes",
  getClassDashboard: "GET /api/v1/teacher/classes/{classId}",
  getStudentDetail: "GET /api/v1/teacher/classes/{classId}/students/{studentId}",
} as const satisfies Record<keyof TutorApi, string>;
export type TutorApiConfig =
  | { mode: "mock"; persona: "student-new" | "student-returning" | "teacher"; storageKey?: string }
  | { mode: "http"; baseUrl: string }; // e.g. /api/v1; never a secret.
