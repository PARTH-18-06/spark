import "server-only";

import { isDeepStrictEqual } from "node:util";

import { z } from "zod";

import {
  CHAPTER_ID,
  ELECTRICITY_CONCEPTS,
  TUTOR_HTTP_ENDPOINTS,
  type ApiErrorBody,
  type AuthState,
  type ClassDashboard,
  type ClassSummary,
  type ConceptsResponse,
  type ProgressResponse,
  type Question,
  type RevisionQueue,
  type SessionSnapshot,
  type StudentDashboard,
  type TeacherStudentDetail,
} from "@/contracts/tutor";
import { API_ERROR_CODES } from "@/lib/server/http/errors";

const identifierSchema = z.string().trim().min(1);
const nonnegativeIntegerSchema = z.number().int().min(0);
const nullableMasterySchema = z.number().finite().min(0).max(1).nullable();

export const isoDateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
    "Must be an ISO 8601 instant with an explicit UTC offset",
  )
  .refine((value) => !Number.isNaN(Date.parse(value)), "Must be a valid instant");

export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must use YYYY-MM-DD")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year!, month! - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month! - 1 &&
      date.getUTCDate() === day
    );
  }, "Must be a valid calendar date");

export const timeZoneSchema = z.string().trim().min(1).refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, "Must be a valid IANA time zone");

export const conceptIdSchema = z.enum([
  "electric-current-and-charge",
  "potential-difference",
  "resistance-and-ohms-law",
  "factors-affecting-resistance",
  "resistors-in-series",
  "resistors-in-parallel",
  "electric-power",
  "electrical-energy",
]);

const allConceptIds = new Set(ELECTRICITY_CONCEPTS.map(({ id }) => id));

export const conceptDefinitionSchema = z.strictObject({
  id: conceptIdSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  prerequisiteIds: z.array(conceptIdSchema),
});

export const userSchema = z.strictObject({
  id: identifierSchema,
  displayName: z.string().trim().min(1).max(80),
  roles: z.array(z.enum(["student", "teacher"])).min(1),
});

export const studentProfileSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(80),
  chapterId: z.literal(CHAPTER_ID),
  examDate: dateOnlySchema.nullable(),
  timeZone: timeZoneSchema,
  onboardingComplete: z.boolean(),
});

export const anonymousAuthStateSchema = z.strictObject({
  authenticated: z.literal(false),
  user: z.null(),
  studentProfile: z.null(),
  csrfToken: z.null(),
  expiresAt: z.null(),
});

export const authenticatedStateSchema = z.strictObject({
  authenticated: z.literal(true),
  user: userSchema,
  studentProfile: studentProfileSchema.nullable(),
  csrfToken: z.string().min(1),
  expiresAt: isoDateTimeSchema,
});

export const authStateSchema = z.discriminatedUnion("authenticated", [
  anonymousAuthStateSchema,
  authenticatedStateSchema,
]);

export const signInInputSchema = z.strictObject({
  email: z.email(),
  password: z.string().min(1),
});

export const saveStudentProfileInputSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(80),
  chapterId: z.literal(CHAPTER_ID),
  examDate: dateOnlySchema.nullable(),
  timeZone: timeZoneSchema,
});

export const misconceptionSchema = z
  .strictObject({
    misconceptionCode: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    label: z.string().min(1),
    evidence: z.string().min(1).nullable(),
  });

export const recentMisconceptionSchema = z.strictObject({
  misconceptionCode: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  label: z.string().min(1),
  evidence: z.string().min(1).nullable(),
  observedAt: isoDateTimeSchema,
});

export const conceptProgressSchema = z
  .strictObject({
    conceptId: conceptIdSchema,
    mastery: nullableMasterySchema,
    state: z.enum(["unassessed", "needs_practice", "developing", "strong"]),
    evidenceCount: nonnegativeIntegerSchema,
    lastAssessedAt: isoDateTimeSchema.nullable(),
    nextReviewAt: isoDateTimeSchema.nullable(),
    recentMisconceptions: z.array(recentMisconceptionSchema),
  })
  .superRefine((value, context) => {
    if ((value.mastery === null) !== (value.state === "unassessed")) {
      context.addIssue({
        code: "custom",
        path: ["state"],
        message: "state must be unassessed exactly when mastery is null",
      });
    }
  });

const completeConceptProgressSchema = z
  .array(conceptProgressSchema)
  .length(ELECTRICITY_CONCEPTS.length)
  .superRefine((rows, context) => {
    const ids = new Set(rows.map(({ conceptId }) => conceptId));
    if (ids.size !== allConceptIds.size || [...allConceptIds].some((id) => !ids.has(id))) {
      context.addIssue({
        code: "custom",
        message: "Must contain exactly one progress row for each chapter concept",
      });
    }
  });

const questionBaseShape = {
  id: identifierSchema,
  conceptId: conceptIdSchema,
  prompt: z.string().trim().min(1),
  difficulty: z.enum(["easy", "medium", "hard"]),
  hint: z.string().min(1).optional(),
  expectedUnit: z.string().min(1).optional(),
};

const multipleChoiceQuestionSchema = z
  .strictObject({
    ...questionBaseShape,
    format: z.literal("multiple_choice"),
    options: z
      .array(z.strictObject({ id: identifierSchema, text: z.string().trim().min(1) }))
      .min(1),
  })
  .superRefine((question, context) => {
    const ids = question.options.map(({ id }) => id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", path: ["options"], message: "Option IDs must be unique" });
    }
  });

const freeResponseQuestionSchema = z.strictObject({
  ...questionBaseShape,
  format: z.literal("free_response"),
});

export const questionSchema = z.discriminatedUnion("format", [
  multipleChoiceQuestionSchema,
  freeResponseQuestionSchema,
]);

export const rewardsSchema = z.strictObject({
  account: z.null(),
  grants: z.tuple([]),
});

const attemptFeedbackShape = {
  attemptId: identifierSchema,
  questionId: identifierSchema,
  clarificationOfAttemptId: identifierSchema.nullable(),
  submittedAt: isoDateTimeSchema,
  finalAnswerText: z.string().max(2000),
  reasoningText: z.string().max(8000),
  selectedOptionId: identifierSchema.nullable(),
  status: z.enum(["correct", "partial", "incorrect", "needs_clarification"]),
  finalAnswerCorrect: z.boolean().nullable(),
  reasoningStatus: z.enum(["sound", "misconception", "unclear", "not_provided"]),
  feedback: z.string().min(1),
  misconception: misconceptionSchema.nullable(),
  clarificationPrompt: z.string().min(1).nullable(),
  mastery: z.strictObject({
    conceptId: conceptIdSchema,
    before: nullableMasterySchema,
    after: nullableMasterySchema,
    evidenceCount: nonnegativeIntegerSchema,
  }),
  nextReviewAt: isoDateTimeSchema.nullable(),
};

function refineAttemptFeedback(
  value: z.infer<z.ZodObject<typeof attemptFeedbackShape>>,
  context: z.RefinementCtx,
) {
  if (value.status === "needs_clarification") {
    if (value.finalAnswerCorrect !== null) {
      context.addIssue({
        code: "custom",
        path: ["finalAnswerCorrect"],
        message: "Clarification attempts have no correctness result",
      });
    }
    if (!value.clarificationPrompt) {
      context.addIssue({
        code: "custom",
        path: ["clarificationPrompt"],
        message: "Clarification attempts require a prompt",
      });
    }
    if (value.mastery.after !== value.mastery.before) {
      context.addIssue({
        code: "custom",
        path: ["mastery", "after"],
        message: "Clarification must not change mastery",
      });
    }
  } else if (value.finalAnswerCorrect === null) {
    context.addIssue({
      code: "custom",
      path: ["finalAnswerCorrect"],
      message: "Graded attempts require a correctness result",
    });
  }

  if (value.misconception?.evidence && !value.reasoningText.includes(value.misconception.evidence)) {
    context.addIssue({
      code: "custom",
      path: ["misconception", "evidence"],
      message: "Misconception evidence must be an exact substring of reasoningText",
    });
  }
}

export const attemptFeedbackSchema = z.strictObject(attemptFeedbackShape).superRefine(refineAttemptFeedback);

export const sessionSummarySchema = z
  .strictObject({
    sessionId: identifierSchema,
    mode: z.enum(["diagnostic", "practice", "revision"]),
    completedAt: isoDateTimeSchema,
    answeredCount: nonnegativeIntegerSchema,
    correctCount: nonnegativeIntegerSchema,
    partialCount: nonnegativeIntegerSchema,
    incorrectCount: nonnegativeIntegerSchema,
    conceptProgress: completeConceptProgressSchema,
    recommendedConceptIds: z.array(conceptIdSchema),
    feedback: z.string().min(1),
    rewards: rewardsSchema,
  })
  .superRefine((summary, context) => {
    if (summary.correctCount + summary.partialCount + summary.incorrectCount !== summary.answeredCount) {
      context.addIssue({
        code: "custom",
        path: ["answeredCount"],
        message: "Outcome counts must sum to answeredCount",
      });
    }
  });

export const sessionSnapshotSchema = z
  .strictObject({
    id: identifierSchema,
    mode: z.enum(["diagnostic", "practice", "revision"]),
    conceptId: conceptIdSchema.nullable(),
    status: z.enum(["active", "completed", "abandoned"]),
    phase: z.enum(["answering", "feedback", "clarification", "completed", "abandoned"]),
    version: z.number().int().positive(),
    progress: z.strictObject({
      answeredCount: nonnegativeIntegerSchema,
      targetQuestionCount: nonnegativeIntegerSchema.nullable(),
    }),
    currentQuestion: questionSchema.nullable(),
    lastAttempt: attemptFeedbackSchema.nullable(),
    summary: sessionSummarySchema.nullable(),
    endedAt: isoDateTimeSchema.nullable(),
    updatedAt: isoDateTimeSchema,
  })
  .superRefine((session, context) => {
    const issue = (path: (string | number)[], message: string) =>
      context.addIssue({ code: "custom", path, message });

    if (session.status === "completed") {
      if (session.phase !== "completed") issue(["phase"], "Completed sessions use completed phase");
      if (session.currentQuestion !== null) issue(["currentQuestion"], "Completed sessions have no current question");
      if (!session.summary) issue(["summary"], "Completed sessions require a summary");
      if (!session.endedAt) issue(["endedAt"], "Completed sessions require endedAt");
      if (session.summary && session.endedAt !== session.summary.completedAt) {
        issue(["endedAt"], "Completed endedAt must equal summary.completedAt");
      }
    } else if (session.status === "abandoned") {
      if (session.phase !== "abandoned") issue(["phase"], "Abandoned sessions use abandoned phase");
      if (session.currentQuestion !== null) issue(["currentQuestion"], "Abandoned sessions have no current question");
      if (session.summary !== null) issue(["summary"], "Abandoned sessions have no summary");
      if (!session.endedAt) issue(["endedAt"], "Abandoned sessions require endedAt");
    } else {
      if (!["answering", "feedback", "clarification"].includes(session.phase)) {
        issue(["phase"], "Active sessions use answering, feedback, or clarification phase");
      }
      if (!session.currentQuestion) issue(["currentQuestion"], "Active sessions require a question");
      if (session.summary !== null) issue(["summary"], "Active sessions have no summary");
      if (session.endedAt !== null) issue(["endedAt"], "Active sessions have no endedAt");
    }

    if (["feedback", "clarification"].includes(session.phase)) {
      if (!session.lastAttempt) issue(["lastAttempt"], "Feedback and clarification require lastAttempt");
      if (session.currentQuestion && session.lastAttempt?.questionId !== session.currentQuestion.id) {
        issue(["lastAttempt", "questionId"], "lastAttempt must match currentQuestion");
      }
    }
    if (session.phase === "clarification" && session.lastAttempt?.status !== "needs_clarification") {
      issue(["lastAttempt", "status"], "Clarification phase requires needs_clarification feedback");
    }
    if (session.phase === "feedback" && session.lastAttempt?.status === "needs_clarification") {
      issue(["lastAttempt", "status"], "Feedback phase requires a graded attempt");
    }
  });

export const startSessionInputSchema = z
  .strictObject({
    mode: z.enum(["diagnostic", "practice", "revision"]),
    conceptId: conceptIdSchema.optional(),
    revisionItemIds: z.array(identifierSchema).min(1).optional(),
    idempotencyKey: identifierSchema,
  })
  .superRefine((input, context) => {
    if (input.mode === "diagnostic" && (input.conceptId || input.revisionItemIds)) {
      context.addIssue({ code: "custom", message: "Diagnostic start accepts only mode" });
    }
    if (input.mode === "practice" && input.revisionItemIds) {
      context.addIssue({ code: "custom", path: ["revisionItemIds"], message: "Practice cannot select revision items" });
    }
    if (input.mode === "revision" && input.conceptId) {
      context.addIssue({ code: "custom", path: ["conceptId"], message: "Revision cannot specify conceptId" });
    }
  });

const startSessionBodyBaseSchema = z.strictObject({
  mode: z.enum(["diagnostic", "practice", "revision"]),
  conceptId: conceptIdSchema.optional(),
  revisionItemIds: z.array(identifierSchema).min(1).optional(),
});

export const startSessionBodySchema = startSessionBodyBaseSchema.superRefine((input, context) => {
  if (input.mode === "diagnostic" && (input.conceptId || input.revisionItemIds)) {
    context.addIssue({ code: "custom", message: "Diagnostic start accepts only mode" });
  }
  if (input.mode === "practice" && input.revisionItemIds) {
    context.addIssue({ code: "custom", path: ["revisionItemIds"], message: "Practice cannot select revision items" });
  }
  if (input.mode === "revision" && input.conceptId) {
    context.addIssue({ code: "custom", path: ["conceptId"], message: "Revision cannot specify conceptId" });
  }
});

const submitAttemptBodyShape = {
  sessionId: identifierSchema,
  questionId: identifierSchema,
  expectedSessionVersion: z.number().int().positive(),
  finalAnswerText: z.string().max(2000),
  reasoningText: z.string().max(8000),
  selectedOptionId: identifierSchema.optional(),
  clarificationOfAttemptId: identifierSchema.optional(),
};

export const submitAttemptBodySchema = z.strictObject(submitAttemptBodyShape);
export const submitAttemptInputSchema = z.strictObject({
  ...submitAttemptBodyShape,
  idempotencyKey: identifierSchema,
});

export function submitAttemptBodyForQuestionSchema(question: Question) {
  return submitAttemptBodySchema.superRefine((input, context) => {
    if (question.format === "multiple_choice") {
      if (input.finalAnswerText !== "") {
        context.addIssue({
          code: "custom",
          path: ["finalAnswerText"],
          message: "Multiple-choice finalAnswerText must be exactly empty",
        });
      }
      if (!input.selectedOptionId) {
        context.addIssue({ code: "custom", path: ["selectedOptionId"], message: "Selection is required" });
      } else if (!question.options.some(({ id }) => id === input.selectedOptionId)) {
        context.addIssue({ code: "custom", path: ["selectedOptionId"], message: "Selection is not an option for this question" });
      }
    } else {
      if (!input.finalAnswerText.trim()) {
        context.addIssue({ code: "custom", path: ["finalAnswerText"], message: "Free response answer is required" });
      }
      if (input.selectedOptionId !== undefined) {
        context.addIssue({ code: "custom", path: ["selectedOptionId"], message: "Free response forbids selectedOptionId" });
      }
    }
  });
}

const sessionMutationBodyShape = {
  sessionId: identifierSchema,
  expectedSessionVersion: z.number().int().positive(),
};

export const advanceSessionBodySchema = z.strictObject(sessionMutationBodyShape);
export const advanceSessionInputSchema = z.strictObject({
  ...sessionMutationBodyShape,
  idempotencyKey: identifierSchema,
});
export const endSessionBodySchema = z.strictObject(sessionMutationBodyShape);
export const endSessionInputSchema = z.strictObject({
  ...sessionMutationBodyShape,
  idempotencyKey: identifierSchema,
});

export const attemptResultSchema = z
  .strictObject({
    ...attemptFeedbackShape,
    session: sessionSnapshotSchema,
    rewards: rewardsSchema,
  })
  .superRefine((result, context) => {
    refineAttemptFeedback(result, context);
    const topLevelFeedback = {
      attemptId: result.attemptId,
      questionId: result.questionId,
      clarificationOfAttemptId: result.clarificationOfAttemptId,
      submittedAt: result.submittedAt,
      finalAnswerText: result.finalAnswerText,
      reasoningText: result.reasoningText,
      selectedOptionId: result.selectedOptionId,
      status: result.status,
      finalAnswerCorrect: result.finalAnswerCorrect,
      reasoningStatus: result.reasoningStatus,
      feedback: result.feedback,
      misconception: result.misconception,
      clarificationPrompt: result.clarificationPrompt,
      mastery: result.mastery,
      nextReviewAt: result.nextReviewAt,
    };
    if (!isDeepStrictEqual(result.session.lastAttempt, topLevelFeedback)) {
      context.addIssue({
        code: "custom",
        path: ["session", "lastAttempt"],
        message: "session.lastAttempt must equal top-level attempt feedback",
      });
    }
  });

export const sessionHistoryItemSchema = z
  .strictObject({
    id: identifierSchema,
    mode: z.enum(["diagnostic", "practice", "revision"]),
    status: z.enum(["active", "completed", "abandoned"]),
    answeredCount: nonnegativeIntegerSchema,
    updatedAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema.nullable(),
    endedAt: isoDateTimeSchema.nullable(),
  })
  .superRefine((item, context) => {
    if (item.status === "active" && (item.completedAt || item.endedAt)) {
      context.addIssue({ code: "custom", message: "Active history has no terminal timestamps" });
    }
    if (item.status === "completed" && (!item.completedAt || item.endedAt !== item.completedAt)) {
      context.addIssue({ code: "custom", message: "Completed history timestamps must match" });
    }
    if (item.status === "abandoned" && (item.completedAt !== null || item.endedAt === null)) {
      context.addIssue({ code: "custom", message: "Abandoned history requires only endedAt" });
    }
  });

export const studentDashboardSchema = z.strictObject({
  profile: studentProfileSchema,
  activeSession: sessionHistoryItemSchema.nullable(),
  dueRevisionCount: nonnegativeIntegerSchema,
  recommendedConceptId: conceptIdSchema.nullable(),
  concepts: completeConceptProgressSchema,
  recentSessions: z.array(sessionHistoryItemSchema).max(5),
  rewards: rewardsSchema,
});

export const conceptsResponseSchema = z
  .strictObject({
    chapterId: z.literal(CHAPTER_ID),
    concepts: z.array(conceptDefinitionSchema).length(ELECTRICITY_CONCEPTS.length),
    progress: completeConceptProgressSchema,
  })
  .superRefine((response, context) => {
    if (JSON.stringify(response.concepts) !== JSON.stringify(ELECTRICITY_CONCEPTS)) {
      context.addIssue({ code: "custom", path: ["concepts"], message: "Concept graph must match the shared catalog" });
    }
  });

export const revisionItemSchema = z.strictObject({
  id: identifierSchema,
  conceptId: conceptIdSchema,
  status: z.enum(["due", "upcoming", "completed"]),
  dueAt: isoDateTimeSchema,
  reason: z.string().min(1),
  completedAt: isoDateTimeSchema.nullable(),
  completedSessionId: identifierSchema.nullable(),
}).superRefine((item, context) => {
  const completeFields = item.completedAt !== null && item.completedSessionId !== null;
  if ((item.status === "completed") !== completeFields) {
    context.addIssue({ code: "custom", message: "Completed revision items require both completion fields" });
  }
});

export const revisionQueueSchema = z.strictObject({
  generatedAt: isoDateTimeSchema,
  items: z.array(revisionItemSchema),
});

export const pageInputSchema = z.strictObject({
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const pageSchema = <Schema extends z.ZodType>(itemSchema: Schema) =>
  z.strictObject({ items: z.array(itemSchema), nextCursor: z.string().min(1).nullable() });

export const progressResponseSchema = z.strictObject({
  concepts: completeConceptProgressSchema,
  sessions: pageSchema(sessionHistoryItemSchema),
  rewards: rewardsSchema,
});

export const attemptHistoryItemSchema = z.strictObject({
  sessionId: identifierSchema,
  conceptId: conceptIdSchema,
  question: questionSchema,
  feedback: attemptFeedbackSchema,
});

export const classSummarySchema = z.strictObject({
  id: identifierSchema,
  name: z.string().min(1),
  studentCount: nonnegativeIntegerSchema,
});

export const teacherStudentRowSchema = z.strictObject({
  id: identifierSchema,
  displayName: z.string().trim().min(1).max(80),
  concepts: completeConceptProgressSchema,
  dueRevisionCount: nonnegativeIntegerSchema,
  lastActiveAt: isoDateTimeSchema.nullable(),
});

export const classDashboardSchema = z.strictObject({
  class: classSummarySchema,
  generatedAt: isoDateTimeSchema,
  students: z.array(teacherStudentRowSchema),
  commonMisconceptions: z.array(z.strictObject({
    conceptId: conceptIdSchema,
    misconceptionCode: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    label: z.string().min(1),
    affectedStudentCount: nonnegativeIntegerSchema,
  })),
  revisionPriorities: z.array(z.strictObject({
    conceptId: conceptIdSchema,
    affectedStudentCount: nonnegativeIntegerSchema,
    reason: z.string().min(1),
  })),
});

export const teacherStudentDetailSchema = z.strictObject({
  classId: identifierSchema,
  student: teacherStudentRowSchema,
  recentSessions: z.array(sessionHistoryItemSchema).max(10),
  recentAttempts: z.array(attemptHistoryItemSchema).max(20),
});

export const apiErrorBodySchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(API_ERROR_CODES),
    message: z.string().min(1),
    retryable: z.boolean(),
    requestId: z.string().min(1),
    fieldErrors: z.record(z.string(), z.string()).optional(),
    retryAfterSeconds: z.number().int().nonnegative().optional(),
    activeSessionId: identifierSchema.optional(),
  }),
});

export const tutorProtocolErrorSchema = z.strictObject({
  name: z.string().min(1),
  message: z.string().min(1),
  kind: z.literal("protocol"),
  reason: z.enum([
    "non_json_response",
    "malformed_json",
    "invalid_error_payload",
    "invalid_success_payload",
    "unexpected_status",
  ]),
  status: z.number().int().min(0),
  retryable: z.literal(false),
  outcome: z.enum(["unknown", "not_applicable"]),
  requestId: z.string().min(1).nullable(),
});

type OperationSchema = {
  endpoint: string;
  successStatus: 200 | 201 | 204;
  request: z.ZodType | null;
  response: z.ZodType | null;
};

export const tutorOperationSchemas = {
  getCurrentUser: { endpoint: TUTOR_HTTP_ENDPOINTS.getCurrentUser, successStatus: 200, request: null, response: authStateSchema },
  signIn: { endpoint: TUTOR_HTTP_ENDPOINTS.signIn, successStatus: 200, request: signInInputSchema, response: authenticatedStateSchema },
  signOut: { endpoint: TUTOR_HTTP_ENDPOINTS.signOut, successStatus: 204, request: null, response: null },
  saveStudentProfile: { endpoint: TUTOR_HTTP_ENDPOINTS.saveStudentProfile, successStatus: 200, request: saveStudentProfileInputSchema, response: studentProfileSchema },
  getStudentDashboard: { endpoint: TUTOR_HTTP_ENDPOINTS.getStudentDashboard, successStatus: 200, request: null, response: studentDashboardSchema },
  getConcepts: { endpoint: TUTOR_HTTP_ENDPOINTS.getConcepts, successStatus: 200, request: null, response: conceptsResponseSchema },
  startSession: { endpoint: TUTOR_HTTP_ENDPOINTS.startSession, successStatus: 201, request: startSessionBodySchema, response: sessionSnapshotSchema },
  getSession: { endpoint: TUTOR_HTTP_ENDPOINTS.getSession, successStatus: 200, request: null, response: sessionSnapshotSchema },
  submitAttempt: { endpoint: TUTOR_HTTP_ENDPOINTS.submitAttempt, successStatus: 200, request: submitAttemptBodySchema, response: attemptResultSchema },
  advanceSession: { endpoint: TUTOR_HTTP_ENDPOINTS.advanceSession, successStatus: 200, request: advanceSessionBodySchema, response: sessionSnapshotSchema },
  endSession: { endpoint: TUTOR_HTTP_ENDPOINTS.endSession, successStatus: 200, request: endSessionBodySchema, response: sessionSnapshotSchema },
  getRevisionQueue: { endpoint: TUTOR_HTTP_ENDPOINTS.getRevisionQueue, successStatus: 200, request: null, response: revisionQueueSchema },
  getProgress: { endpoint: TUTOR_HTTP_ENDPOINTS.getProgress, successStatus: 200, request: pageInputSchema, response: progressResponseSchema },
  getAttemptHistory: { endpoint: TUTOR_HTTP_ENDPOINTS.getAttemptHistory, successStatus: 200, request: pageInputSchema, response: pageSchema(attemptHistoryItemSchema) },
  getClasses: { endpoint: TUTOR_HTTP_ENDPOINTS.getClasses, successStatus: 200, request: null, response: z.array(classSummarySchema) },
  getClassDashboard: { endpoint: TUTOR_HTTP_ENDPOINTS.getClassDashboard, successStatus: 200, request: null, response: classDashboardSchema },
  getStudentDetail: { endpoint: TUTOR_HTTP_ENDPOINTS.getStudentDetail, successStatus: 200, request: null, response: teacherStudentDetailSchema },
} as const satisfies Record<keyof typeof TUTOR_HTTP_ENDPOINTS, OperationSchema>;

// Compile-time compatibility checks complement (but do not replace) runtime parsing.
const _authStateTypeCheck: z.ZodType<AuthState> = authStateSchema;
const _sessionTypeCheck: z.ZodType<SessionSnapshot> = sessionSnapshotSchema;
const _questionTypeCheck: z.ZodType<Question> = questionSchema;
const _dashboardTypeCheck: z.ZodType<StudentDashboard> = studentDashboardSchema;
const _conceptsTypeCheck: z.ZodType<ConceptsResponse> = conceptsResponseSchema;
const _revisionTypeCheck: z.ZodType<RevisionQueue> = revisionQueueSchema;
const _progressTypeCheck: z.ZodType<ProgressResponse> = progressResponseSchema;
const _classesTypeCheck: z.ZodType<ClassSummary[]> = z.array(classSummarySchema);
const _classDashboardTypeCheck: z.ZodType<ClassDashboard> = classDashboardSchema;
const _studentDetailTypeCheck: z.ZodType<TeacherStudentDetail> = teacherStudentDetailSchema;
const _errorTypeCheck: z.ZodType<ApiErrorBody> = apiErrorBodySchema;

void [
  _authStateTypeCheck,
  _sessionTypeCheck,
  _questionTypeCheck,
  _dashboardTypeCheck,
  _conceptsTypeCheck,
  _revisionTypeCheck,
  _progressTypeCheck,
  _classesTypeCheck,
  _classDashboardTypeCheck,
  _studentDetailTypeCheck,
  _errorTypeCheck,
];
