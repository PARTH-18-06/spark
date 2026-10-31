import "server-only";

import type { ConceptId, ConceptProgress, RevisionItem } from "@/contracts/tutor";
import type { MasteryUpdate } from "@/lib/server/learning/mastery";

/** Narrow learning transaction boundary used by session/evaluation persistence. */
export interface LearningRepository {
  getConceptProgress(studentId: string, conceptId: ConceptId): Promise<ConceptProgress>;
  applyGradedEvidence(input: {
    studentId: string;
    attemptId: string;
    assignmentId: string;
    mastery: MasteryUpdate;
    nextReviewAt: string;
    misconceptionCode: string | null;
    misconceptionLabel: string | null;
    misconceptionEvidence: string | null;
  }): Promise<void>;
  listRevisionItems(studentId: string): Promise<RevisionItem[]>;
  completeRevisionItems(studentId: string, sessionId: string, revisionItemIds: readonly string[], completedAt: string): Promise<void>;
}

/** Implementations must use one transaction and treat unique conflicts as replay/idempotency checks. */
export const LEARNING_TRANSACTION_REQUIREMENTS = [
  "Claim the scoped idempotency key in a short transaction with a lease token.",
  "Never hold a session/database lock while calling Groq; finalize with the claim token and expected version.",
  "Lock the concept_mastery row before deriving after-values.",
  "Insert the immutable graded attempt before applying mastery.",
  "Rely on attempts_one_graded_evidence_per_assignment for exactly-once evidence.",
  "Insert revision_items with source_attempt_id and reuse it on replay.",
  "Commit attempt, mastery, misconception observation, and revision item together.",
  "Store the successful direct response body in the same finalization transaction for replay.",
] as const;
