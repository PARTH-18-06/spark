import "server-only";

import type { ConceptLearningState, EvaluationStatus, Mastery } from "@/contracts/tutor";

export const LEARNING_POLICY = {
  mastery: {
    previousWeight: 0.7,
    currentWeight: 0.3,
    needsPracticeBelow: 0.4,
    developingBelow: 0.75,
    minimumEvidenceForStrong: 3,
  },
  session: { diagnosticQuestions: 8, practiceQuestions: 5 },
  revision: {
    incorrectHours: 1,
    partialHours: 12,
    correctIntervalsDays: [1, 3, 7, 14] as const,
  },
} as const;

export type GradedOutcome = Exclude<EvaluationStatus, "needs_clarification">;

/** Prototype evidence weights; these are policy configuration, not validated measurements. */
export function outcomeCredit(status: GradedOutcome, reasoningStatus: "sound" | "misconception" | "unclear" | "not_provided"): number {
  if (status === "correct") {
    if (reasoningStatus === "sound") return 1;
    if (reasoningStatus === "misconception") return 0.65;
    if (reasoningStatus === "unclear") return 0.75;
    return 0.7;
  }
  if (status === "partial") {
    if (reasoningStatus === "sound") return 0.55;
    if (reasoningStatus === "misconception") return 0.35;
    return 0.4;
  }
  return reasoningStatus === "sound" ? 0.1 : 0.05;
}

export function deriveLearningState(mastery: Mastery | null, evidenceCount: number): ConceptLearningState {
  if (mastery === null || evidenceCount === 0) return "unassessed";
  if (mastery < LEARNING_POLICY.mastery.needsPracticeBelow) return "needs_practice";
  if (mastery < LEARNING_POLICY.mastery.developingBelow || evidenceCount < LEARNING_POLICY.mastery.minimumEvidenceForStrong) return "developing";
  return "strong";
}

export function clampMastery(value: number): Mastery {
  if (!Number.isFinite(value)) throw new Error("Mastery must be finite");
  return Math.min(1, Math.max(0, value));
}

export function difficultyFor(mastery: Mastery | null, evidenceCount: number): "easy" | "medium" | "hard" {
  if (mastery === null || evidenceCount < 1 || mastery < 0.4) return "easy";
  if (mastery < 0.75) return "medium";
  return "hard";
}
