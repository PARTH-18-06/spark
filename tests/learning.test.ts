import { describe, expect, it } from "vitest";

import { ELECTRICITY_CONCEPTS, type ConceptProgress } from "@/contracts/tutor";
import { applyEvaluation, type ExistingEvidence } from "@/lib/server/learning/mastery";
import { findMisconception, validateMisconception, type MisconceptionDefinition } from "@/lib/server/learning/misconceptions";
import { deriveLearningState, difficultyFor } from "@/lib/server/learning/policy";
import { completeRevisionItems, buildRevisionQueue, earliestOutstandingReview, scheduleNextReview, type RevisionRecord } from "@/lib/server/learning/scheduling";
import { QuestionSelectionError, selectQuestions, type BankQuestion } from "@/lib/server/learning/selection";

const NOW = new Date("2026-11-01T12:00:00.000Z");
const iso = NOW.toISOString();
const emptyProgress = (conceptId: (typeof ELECTRICITY_CONCEPTS)[number]["id"]): ConceptProgress => ({
  conceptId, mastery: null, state: "unassessed", evidenceCount: 0, lastAssessedAt: null, nextReviewAt: null, recentMisconceptions: [],
});
const allProgress = ELECTRICITY_CONCEPTS.map(({ id }) => emptyProgress(id));

function bankFor(conceptId: (typeof ELECTRICITY_CONCEPTS)[number]["id"], count = 3): BankQuestion[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${conceptId}-q${index + 1}`, conceptId, format: "free_response" as const,
    difficulty: (["easy", "medium", "hard"] as const)[index % 3], prompt: `Question ${index + 1}`,
    misconceptionCodes: index === 1 ? ["OHM_FIXED_RESISTANCE_CHANGES_WITH_VOLTAGE"] : [],
  }));
}

describe("deterministic mastery policy", () => {
  const evaluation = (status: "correct" | "partial" | "incorrect" | "needs_clarification", reasoningStatus: "sound" | "misconception" | "unclear" | "not_provided" = "sound") => ({
    status, finalAnswerCorrect: status === "needs_clarification" ? null : status === "correct", reasoningStatus,
    misconception: null, feedback: "Keep working.", clarificationPrompt: status === "needs_clarification" ? "Please explain the unit." : null,
  } as const);

  it("keeps new concepts unassessed and derives minimum-evidence strong state", () => {
    expect(deriveLearningState(null, 0)).toBe("unassessed");
    let state: ExistingEvidence = { conceptId: "electric-power", mastery: null, evidenceCount: 0, lastAssessedAt: null, nextReviewAt: null, recentMisconceptions: [] };
    const first = applyEvaluation(state, evaluation("correct"), iso); expect(first.after).toBe(1); expect(first.learningState).toBe("developing");
    state = { ...state, mastery: first.after, evidenceCount: first.evidenceCountAfter, lastAssessedAt: first.lastAssessedAt };
    const second = applyEvaluation(state, evaluation("correct"), iso); expect(second.learningState).toBe("developing");
    state = { ...state, mastery: second.after, evidenceCount: second.evidenceCountAfter, lastAssessedAt: second.lastAssessedAt };
    expect(applyEvaluation(state, evaluation("correct"), iso).learningState).toBe("strong");
  });

  it("distinguishes partial/incorrect and supported incorrect reasoning credit", () => {
    const base = { conceptId: "electric-power" as const, mastery: null, evidenceCount: 0, lastAssessedAt: null, nextReviewAt: null, recentMisconceptions: [] };
    expect(applyEvaluation(base, evaluation("incorrect"), iso).after).toBe(0.1);
    expect(applyEvaluation(base, evaluation("partial"), iso).after).toBe(0.55);
    expect(applyEvaluation(base, evaluation("correct", "misconception"), iso).after).toBe(0.65);
    expect(applyEvaluation(base, evaluation("correct"), iso).after).toBe(1);
  });

  it("does not change mastery, evidence, misconception history, or schedule for clarification", () => {
    const existing = { conceptId: "electric-power" as const, mastery: 0.6, evidenceCount: 2, lastAssessedAt: "2026-10-30T00:00:00.000Z", nextReviewAt: "2026-11-03T00:00:00.000Z", recentMisconceptions: [] };
    expect(applyEvaluation(existing, evaluation("needs_clarification"), iso)).toMatchObject({ before: 0.6, after: 0.6, evidenceCountAfter: 2, lastAssessedAt: existing.lastAssessedAt });
  });

  it("rejects nonfinite or structurally impossible evidence", () => {
    const base = { conceptId: "electric-power" as const, mastery: null, evidenceCount: 0, lastAssessedAt: null, nextReviewAt: null, recentMisconceptions: [] };
    expect(() => applyEvaluation({ ...base, mastery: Number.NaN }, evaluation("correct"), iso)).toThrow();
    expect(() => applyEvaluation({ ...base, mastery: 0.5 }, evaluation("correct"), iso)).toThrow();
  });

  it("selects difficulty from backend mastery/evidence thresholds", () => {
    expect(difficultyFor(null, 0)).toBe("easy"); expect(difficultyFor(0.5, 2)).toBe("medium"); expect(difficultyFor(0.9, 3)).toBe("hard");
  });
});

describe("misconception catalog policy", () => {
  const catalog: MisconceptionDefinition[] = [{ code: "OHM_FIXED_RESISTANCE_CHANGES_WITH_VOLTAGE", conceptId: "resistance-and-ohms-law", label: "Assumes voltage increases the fixed resistance" }];
  it("requires a server-known code, matching label, and exact reasoning excerpt", () => {
    expect(findMisconception(catalog, "resistance-and-ohms-law", catalog[0]!.code).label).toContain("fixed resistance");
    expect(validateMisconception(catalog, "resistance-and-ohms-law", { misconceptionCode: catalog[0]!.code, label: catalog[0]!.label, evidence: "resistance increases" }, "The resistance increases with voltage")).toBeTruthy();
    expect(() => findMisconception(catalog, "electric-power", catalog[0]!.code)).toThrow();
    expect(() => validateMisconception(catalog, "resistance-and-ohms-law", { misconceptionCode: catalog[0]!.code, label: "invented", evidence: "x" }, "x")).toThrow();
    expect(() => validateMisconception(catalog, "resistance-and-ohms-law", { misconceptionCode: catalog[0]!.code, label: catalog[0]!.label, evidence: "not present" }, "reasoning")).toThrow();
  });
});

describe("reproducible adaptive question selection", () => {
  const bank = ELECTRICITY_CONCEPTS.flatMap(({ id }) => bankFor(id));

  it("covers every concept exactly once in diagnostic mode", () => {
    const result = selectQuestions({ mode: "diagnostic", progress: allProgress, bank, seed: "diag-1" });
    expect(result.questions).toHaveLength(8);
    expect(new Set(result.questions.map(({ question }) => question.conceptId))).toEqual(new Set(ELECTRICITY_CONCEPTS.map(({ id }) => id)));
    expect(result.questions.every(({ question, bankId }) => question.id !== bankId)).toBe(true);
    expect(selectQuestions({ mode: "diagnostic", progress: allProgress, bank, seed: "diag-1" }).questions.map(({ bankId }) => bankId)).toEqual(result.questions.map(({ bankId }) => bankId));
  });

  it("prioritizes an explicit practice concept, then prerequisites, without mandatory locks", () => {
    const result = selectQuestions({ mode: "practice", conceptId: "electrical-energy", progress: allProgress, bank, seed: "practice-1" });
    expect(result.questions).toHaveLength(5);
    expect(result.questions.slice(0, 3).every(({ question }) => question.conceptId === "electrical-energy")).toBe(true);
    expect(result.questions.slice(3).some(({ question }) => question.conceptId === "electric-power")).toBe(true);
  });

  it("prefers a supported misconception and uses bounded repeats only after exhaustion", () => {
    const target = "resistance-and-ohms-law" as const;
    const progress = allProgress.map((item) => item.conceptId === target ? { ...item, mastery: 0.2, state: "needs_practice" as const, evidenceCount: 2, recentMisconceptions: [{ misconceptionCode: "OHM_FIXED_RESISTANCE_CHANGES_WITH_VOLTAGE", label: "Assumes voltage increases the fixed resistance", evidence: "voltage increases resistance", observedAt: iso }] } : item);
    const result = selectQuestions({ mode: "practice", conceptId: target, progress, bank: bankFor(target), supportedMisconceptionCodes: new Set(["OHM_FIXED_RESISTANCE_CHANGES_WITH_VOLTAGE"]), seed: "repeat-1" });
    expect(result.questions[0]!.bankId).toBe(`${target}-q2`);
    expect(result.questions).toHaveLength(5); expect(result.fallbackUsed).toBe(true); expect(result.questions.filter(({ fallbackUsed }) => fallbackUsed).length).toBeGreaterThan(0);
  });

  it("covers every selected revision item and fails explicitly when a concept has no bank content", () => {
    const revisionItems = [{ id: "rev-a", conceptId: "electric-power" as const }, { id: "rev-b", conceptId: "electric-power" as const }];
    const result = selectQuestions({ mode: "revision", revisionItems, progress: allProgress, bank: bankFor("electric-power", 1), seed: "revision-1" });
    expect(result.coveredRevisionItemIds).toEqual(["rev-a", "rev-b"]); expect(result.questions).toHaveLength(2); expect(result.fallbackUsed).toBe(true);
    expect(() => selectQuestions({ mode: "revision", revisionItems: [{ id: "rev-x", conceptId: "electric-power" }], progress: allProgress, bank: [], seed: "missing" })).toThrow(QuestionSelectionError);
  });
});

describe("clock-injected revision scheduling", () => {
  it("uses evidence-based intervals and exact due boundary", () => {
    expect(scheduleNextReview("incorrect", 1, NOW).toISOString()).toBe("2026-11-01T13:00:00.000Z");
    expect(scheduleNextReview("partial", 2, NOW).toISOString()).toBe("2026-11-02T00:00:00.000Z");
    expect(scheduleNextReview("correct", 3, NOW).toISOString()).toBe("2026-11-08T12:00:00.000Z");
    const record: RevisionRecord = { id: "r1", conceptId: "electric-power", status: "upcoming", dueAt: NOW, reason: "practice", completedAt: null, completedSessionId: null };
    expect(buildRevisionQueue([record], NOW).items[0]!.status).toBe("due");
  });

  it("keeps overdue reviews outstanding and returns the earliest concept review", () => {
    const records: RevisionRecord[] = [
      { id: "old", conceptId: "electric-power", status: "due", dueAt: new Date("2026-10-20T00:00:00Z"), reason: "old", completedAt: null, completedSessionId: null },
      { id: "new", conceptId: "electric-power", status: "upcoming", dueAt: new Date("2026-11-05T00:00:00Z"), reason: "new", completedAt: null, completedSessionId: null },
    ];
    expect(earliestOutstandingReview(records, "electric-power")).toBe("2026-10-20T00:00:00.000Z");
  });

  it("completes selected revision items only on explicit session completion", () => {
    const records: RevisionRecord[] = [{ id: "r1", conceptId: "electric-power", status: "due", dueAt: NOW, reason: "practice", completedAt: null, completedSessionId: null }];
    expect(completeRevisionItems(records, ["r1"], "session-1", NOW)[0]).toMatchObject({ status: "completed", completedSessionId: "session-1" });
    expect(completeRevisionItems(records, [], "session-1", NOW)[0]!.status).toBe("due");
    expect(() => completeRevisionItems(records, ["missing"], "session-1", NOW)).toThrow();
  });
});
