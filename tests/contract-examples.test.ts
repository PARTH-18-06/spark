import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { TUTOR_CONTRACT_VERSION, TUTOR_HTTP_ENDPOINTS } from "@/contracts/tutor";
import {
  advanceSessionBodySchema,
  anonymousAuthStateSchema,
  attemptResultSchema,
  authenticatedStateSchema,
  authStateSchema,
  classDashboardSchema,
  classSummarySchema,
  conceptsResponseSchema,
  endSessionBodySchema,
  pageSchema,
  progressResponseSchema,
  questionSchema,
  revisionQueueSchema,
  saveStudentProfileInputSchema,
  sessionSnapshotSchema,
  signInInputSchema,
  startSessionBodySchema,
  studentDashboardSchema,
  studentProfileSchema,
  submitAttemptBodyForQuestionSchema,
  submitAttemptBodySchema,
  teacherStudentDetailSchema,
  tutorOperationSchemas,
  tutorProtocolErrorSchema,
  attemptHistoryItemSchema,
  rewardsSchema,
} from "@/lib/server/contracts/tutor-schemas";

const contractDocument = readFileSync(
  new URL("../docs/frontend-api-contract.md", import.meta.url),
  "utf8",
);

function sectionJson(heading: string): unknown[] {
  const marker = `### ${heading}`;
  const start = contractDocument.indexOf(marker);
  if (start < 0) throw new Error(`Missing heading: ${heading}`);
  const contentStart = contractDocument.indexOf("\n", start) + 1;
  const nextH3 = contractDocument.indexOf("\n### ", contentStart);
  const nextH2 = contractDocument.indexOf("\n## ", contentStart);
  const candidates = [nextH3, nextH2].filter((index) => index >= 0);
  const end = candidates.length ? Math.min(...candidates) : contractDocument.length;
  const section = contractDocument.slice(contentStart, end);
  return [...section.matchAll(/```json\s*([\s\S]*?)```/g)].map((match) => JSON.parse(match[1]));
}

describe("authoritative PROPOSED v1.1.0 registry", () => {
  it("covers all 17 TutorApi operations without claiming route implementation", () => {
    expect(TUTOR_CONTRACT_VERSION).toBe("1.1.0");
    expect(Object.keys(TUTOR_HTTP_ENDPOINTS)).toHaveLength(17);
    expect(Object.keys(tutorOperationSchemas)).toEqual(Object.keys(TUTOR_HTTP_ENDPOINTS));
    for (const operation of Object.keys(TUTOR_HTTP_ENDPOINTS) as Array<keyof typeof TUTOR_HTTP_ENDPOINTS>) {
      expect(tutorOperationSchemas[operation].endpoint).toBe(TUTOR_HTTP_ENDPOINTS[operation]);
    }
  });

  it("runtime-validates every numbered endpoint request/response example", () => {
    authStateSchema.parse(sectionJson("1. getCurrentUser")[0]);

    const signIn = sectionJson("2. signIn");
    signInInputSchema.parse(signIn[0]);
    authenticatedStateSchema.parse(signIn[1]);

    expect(sectionJson("3. signOut")).toHaveLength(0);

    const profile = sectionJson("4. saveStudentProfile");
    saveStudentProfileInputSchema.parse(profile[0]);
    studentProfileSchema.parse(profile[1]);

    studentDashboardSchema.parse(sectionJson("5. getStudentDashboard")[0]);
    conceptsResponseSchema.parse(sectionJson("6. getConcepts")[0]);

    const start = sectionJson("7. startSession");
    startSessionBodySchema.parse(start[0]);
    sessionSnapshotSchema.parse(start[1]);

    sessionSnapshotSchema.parse(sectionJson("8. getSession")[0]);

    const attempt = sectionJson("9. submitAttempt");
    submitAttemptBodySchema.parse(attempt[0]);
    attemptResultSchema.parse(attempt[1]);

    const advance = sectionJson("10. advanceSession");
    advanceSessionBodySchema.parse(advance[0]);
    sessionSnapshotSchema.parse(advance[1]);

    const end = sectionJson("11. endSession");
    endSessionBodySchema.parse(end[0]);
    sessionSnapshotSchema.parse(end[1]);

    revisionQueueSchema.parse(sectionJson("12. getRevisionQueue")[0]);
    progressResponseSchema.parse(sectionJson("13. getProgress")[0]);
    pageSchema(attemptHistoryItemSchema).parse(sectionJson("14. getAttemptHistory")[0]);
    classSummarySchema.array().parse(sectionJson("15. getClasses")[0]);
    classDashboardSchema.parse(sectionJson("16. getClassDashboard")[0]);
    teacherStudentDetailSchema.parse(sectionJson("17. getStudentDetail")[0]);
  });
});

describe("representative contract scenarios", () => {
  it("validates clarification and resolution without premature mastery", () => {
    const clarification = attemptResultSchema.parse(sectionJson("clarificationNeeded")[0]);
    expect(clarification.session.phase).toBe("clarification");
    expect(clarification.mastery.after).toBe(clarification.mastery.before);
    expect(clarification.mastery.evidenceCount).toBe(0);

    submitAttemptBodySchema.parse(sectionJson("clarificationRequest")[0]);
    const resolved = attemptResultSchema.parse(sectionJson("clarificationResolved")[0]);
    expect(resolved.session.phase).toBe("feedback");
    expect(resolved.mastery.evidenceCount).toBe(1);
  });

  it("validates abandoned sessions from answering, feedback, clarification, and revision", () => {
    for (const heading of [
      "11. endSession",
      "abandonedFromAnswering",
      "abandonedFromClarification",
      "revisionScenarioREnded",
    ]) {
      const examples = sectionJson(heading);
      const snapshot = heading === "11. endSession" ? examples[1] : examples[0];
      const parsed = sessionSnapshotSchema.parse(snapshot);
      expect(parsed.status).toBe("abandoned");
      expect(parsed.phase).toBe("abandoned");
      expect(parsed.summary).toBeNull();
      expect(parsed.endedAt).not.toBeNull();
    }
  });

  it("enforces format-specific multiple-choice and free-response submissions", () => {
    const question = questionSchema.parse(sectionJson("multipleChoiceQuestion")[0]);
    const submission = sectionJson("multipleChoiceSubmission")[0];
    expect(submitAttemptBodyForQuestionSchema(question).parse(submission)).toMatchObject({
      finalAnswerText: "",
      selectedOptionId: "double",
    });
    expect(() =>
      submitAttemptBodyForQuestionSchema(question).parse({
        ...(submission as object),
        finalAnswerText: "Current doubles.",
      }),
    ).toThrow();

    const freeResponseQuestion = sessionSnapshotSchema.parse(sectionJson("7. startSession")[1])
      .currentQuestion!;
    expect(() =>
      submitAttemptBodyForQuestionSchema(freeResponseQuestion).parse({
        sessionId: "session_01",
        questionId: freeResponseQuestion.id,
        expectedSessionVersion: 1,
        finalAnswerText: "Current doubles.",
        reasoningText: "I = V/R.",
        selectedOptionId: "double",
      }),
    ).toThrow();
  });

  it("keeps rewards disabled across nested response shapes", () => {
    expect(rewardsSchema.parse({ account: null, grants: [] })).toEqual({ account: null, grants: [] });
    expect(() => rewardsSchema.parse({ account: { totalXp: 10 }, grants: [] })).toThrow();
    expect(attemptResultSchema.parse(sectionJson("clarificationNeeded")[0]).rewards).toEqual({
      account: null,
      grants: [],
    });
    expect(studentDashboardSchema.parse(sectionJson("revisionScenarioRDashboard")[0]).rewards).toEqual({
      account: null,
      grants: [],
    });
  });

  it("validates revision and protocol examples", () => {
    revisionQueueSchema.parse(sectionJson("revisionScenarioRQueue")[0]);
    revisionQueueSchema.parse(sectionJson("revisionScenarioRQueueAfterEnd")[0]);
    tutorProtocolErrorSchema.parse(sectionJson("nonJsonProtocolError")[0]);
    tutorProtocolErrorSchema.parse(sectionJson("invalidSuccessProtocolError")[0]);
  });

  it("rejects impossible terminal session combinations", () => {
    const abandoned = sectionJson("abandonedFromAnswering")[0] as Record<string, unknown>;
    expect(() =>
      sessionSnapshotSchema.parse({ ...abandoned, phase: "completed" }),
    ).toThrow();
  });

  it("validates anonymous authentication separately from protected state", () => {
    expect(anonymousAuthStateSchema.parse(sectionJson("anonymousAuth")[0]).authenticated).toBe(false);
  });
});
