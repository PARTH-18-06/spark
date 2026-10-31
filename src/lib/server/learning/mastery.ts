import "server-only";

import type { AttemptFeedback, ConceptId, ConceptLearningState, Mastery, RecentMisconception } from "@/contracts/tutor";
import { clampMastery, deriveLearningState, outcomeCredit, type GradedOutcome } from "@/lib/server/learning/policy";

export interface ExistingEvidence {
  conceptId: ConceptId;
  mastery: Mastery | null;
  evidenceCount: number;
  lastAssessedAt: string | null;
  nextReviewAt: string | null;
  recentMisconceptions: RecentMisconception[];
}

export interface ValidatedEvaluation {
  status: "correct" | "partial" | "incorrect" | "needs_clarification";
  finalAnswerCorrect: boolean | null;
  reasoningStatus: "sound" | "misconception" | "unclear" | "not_provided";
  misconception: { misconceptionCode: string; label: string; evidence: string | null } | null;
  feedback: string;
  clarificationPrompt: string | null;
}

export interface MasteryUpdate {
  before: Mastery | null;
  after: Mastery | null;
  evidenceCountBefore: number;
  evidenceCountAfter: number;
  learningState: ConceptLearningState;
  lastAssessedAt: string | null;
  recentMisconceptions: RecentMisconception[];
}

function assertEvidence(existing: ExistingEvidence): void {
  if (!Number.isInteger(existing.evidenceCount) || existing.evidenceCount < 0) throw new Error("Evidence count must be a nonnegative integer");
  if (existing.mastery !== null) clampMastery(existing.mastery);
  if ((existing.evidenceCount === 0) !== (existing.mastery === null)) throw new Error("Unassessed evidence must have null mastery and zero evidence");
}

export function applyEvaluation(existing: ExistingEvidence, evaluation: ValidatedEvaluation, assessedAt: string): MasteryUpdate {
  assertEvidence(existing);
  if (evaluation.status === "needs_clarification") {
    return {
      before: existing.mastery,
      after: existing.mastery,
      evidenceCountBefore: existing.evidenceCount,
      evidenceCountAfter: existing.evidenceCount,
      learningState: deriveLearningState(existing.mastery, existing.evidenceCount),
      lastAssessedAt: existing.lastAssessedAt,
      recentMisconceptions: existing.recentMisconceptions,
    };
  }
  if (evaluation.finalAnswerCorrect === null) throw new Error("Graded evaluation requires finalAnswerCorrect");
  if (evaluation.status === "correct" && evaluation.finalAnswerCorrect !== true) throw new Error("Correct evaluation must have a correct final answer");
  if (evaluation.status === "incorrect" && evaluation.finalAnswerCorrect !== false) throw new Error("Incorrect evaluation must have an incorrect final answer");
  if (!Number.isFinite(Date.parse(assessedAt))) throw new Error("assessedAt must be an ISO timestamp");
  const before = existing.mastery;
  const credit = outcomeCredit(evaluation.status as GradedOutcome, evaluation.reasoningStatus);
  const after = clampMastery(before === null ? credit : before * 0.7 + credit * 0.3);
  const evidenceCountAfter = existing.evidenceCount + 1;
  const recentMisconceptions = evaluation.misconception
    ? [{ ...evaluation.misconception, observedAt: assessedAt }, ...existing.recentMisconceptions].slice(0, 5)
    : existing.recentMisconceptions;
  return {
    before,
    after,
    evidenceCountBefore: existing.evidenceCount,
    evidenceCountAfter,
    learningState: deriveLearningState(after, evidenceCountAfter),
    lastAssessedAt: assessedAt,
    recentMisconceptions,
  };
}

export function masteryFeedback(conceptId: ConceptId, update: MasteryUpdate): AttemptFeedback["mastery"] {
  return { conceptId, before: update.before, after: update.after, evidenceCount: update.evidenceCountAfter };
}
