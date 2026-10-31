import "server-only";

import { ELECTRICITY_CONCEPTS, type ConceptId, type ConceptProgress, type Question } from "@/contracts/tutor";
import { difficultyFor } from "@/lib/server/learning/policy";

export interface BankQuestion {
  id: string;
  conceptId: ConceptId;
  format: "multiple_choice" | "free_response";
  difficulty: "easy" | "medium" | "hard";
  prompt: string;
  hint?: string;
  expectedUnit?: string;
  options?: { id: string; text: string }[];
  misconceptionCodes?: readonly string[];
}

export interface RevisionSelectionTarget { id: string; conceptId: ConceptId }

export interface SelectionInput {
  mode: "diagnostic" | "practice" | "revision";
  conceptId?: ConceptId;
  revisionItems?: readonly RevisionSelectionTarget[];
  progress: readonly ConceptProgress[];
  bank: readonly BankQuestion[];
  previouslyAssignedBankIds?: readonly string[];
  supportedMisconceptionCodes?: ReadonlySet<string>;
  seed: string;
}

export interface SelectedQuestion {
  assignmentId: string;
  bankId: string;
  question: Question;
  revisionItemId?: string;
  fallbackUsed: boolean;
}

export class QuestionSelectionError extends Error {}

const conceptOrder = new Map(ELECTRICITY_CONCEPTS.map((concept, index) => [concept.id, index]));

function hash(value: string): number {
  let result = 2166136261;
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

function progressFor(progress: readonly ConceptProgress[], conceptId: ConceptId): ConceptProgress {
  return progress.find((item) => item.conceptId === conceptId) ?? {
    conceptId, mastery: null, state: "unassessed", evidenceCount: 0,
    lastAssessedAt: null, nextReviewAt: null, recentMisconceptions: [],
  };
}

function prerequisiteIds(conceptId: ConceptId): ConceptId[] {
  const definition = ELECTRICITY_CONCEPTS.find((concept) => concept.id === conceptId)!;
  return [...definition.prerequisiteIds];
}

function targetConcepts(input: SelectionInput): Array<{ conceptId: ConceptId; revisionItemId?: string }> {
  if (input.mode === "diagnostic") return ELECTRICITY_CONCEPTS.map(({ id }) => ({ conceptId: id }));
  if (input.mode === "revision") {
    if (!input.revisionItems?.length) throw new QuestionSelectionError("Revision selection requires at least one revision item");
    if (new Set(input.revisionItems.map(({ id }) => id)).size !== input.revisionItems.length) throw new QuestionSelectionError("Revision item IDs must be unique");
    return input.revisionItems.map(({ id, conceptId }) => ({ conceptId, revisionItemId: id }));
  }
  const ranked = [...input.progress].sort((a, b) => {
    const aMastery = a.mastery ?? -1;
    const bMastery = b.mastery ?? -1;
    return aMastery - bMastery || a.evidenceCount - b.evidenceCount || (conceptOrder.get(a.conceptId)! - conceptOrder.get(b.conceptId)!);
  });
  const ids: ConceptId[] = [];
  if (input.conceptId) {
    ids.push(input.conceptId);
    for (const prerequisite of prerequisiteIds(input.conceptId)) if (!ids.includes(prerequisite)) ids.push(prerequisite);
  }
  for (const item of ranked) if (!ids.includes(item.conceptId)) ids.push(item.conceptId);
  return ids.map((conceptId) => ({ conceptId }));
}

function toPublicQuestion(item: BankQuestion, assignmentId: string): Question {
  const base = {
    id: assignmentId,
    conceptId: item.conceptId,
    prompt: item.prompt,
    difficulty: item.difficulty,
    ...(item.hint ? { hint: item.hint } : {}),
    ...(item.expectedUnit ? { expectedUnit: item.expectedUnit } : {}),
  };
  return item.format === "multiple_choice"
    ? { ...base, format: "multiple_choice", options: (item.options ?? []).map(({ id, text }) => ({ id, text })) }
    : { ...base, format: "free_response" };
}

export function selectQuestions(input: SelectionInput): { questions: SelectedQuestion[]; coveredRevisionItemIds: string[]; fallbackUsed: boolean } {
  const targets = targetConcepts(input);
  const progress = new Map(input.progress.map((item) => [item.conceptId, item]));
  const previouslyAssigned = new Set(input.previouslyAssignedBankIds ?? []);
  const used = new Set<string>();
  const selected: SelectedQuestion[] = [];
  const desiredCount = input.mode === "diagnostic" ? 8 : input.mode === "practice" ? 5 : targets.length;
  let fallbackUsed = false;

  for (let slot = 0; slot < desiredCount; slot += 1) {
    const target = input.mode === "practice"
      ? targets.find(({ conceptId }) => input.bank.some((item) => item.conceptId === conceptId && !used.has(item.id)))
        ?? targets.find(({ conceptId }) => input.bank.some((item) => item.conceptId === conceptId))
      : targets[slot % targets.length];
    if (!target) throw new QuestionSelectionError("No eligible question-bank content remains");
    const targetProgress = progressFor(input.progress, target.conceptId);
    const desiredDifficulty = difficultyFor(targetProgress.mastery, targetProgress.evidenceCount);
    const candidates = input.bank.filter((item) => item.conceptId === target.conceptId);
    if (candidates.length === 0) throw new QuestionSelectionError(`No question-bank content exists for ${target.conceptId}`);
    const supported = targetProgress.recentMisconceptions.map(({ misconceptionCode }) => misconceptionCode)
      .filter((code) => input.supportedMisconceptionCodes?.has(code) ?? true);
    const eligible = candidates.filter((item) => !used.has(item.id));
    const unseenEligible = eligible.filter((item) => !previouslyAssigned.has(item.id));
    const pool = unseenEligible.length ? unseenEligible : eligible.length ? eligible : candidates;
    if (pool === candidates) fallbackUsed = true;
    const sorted = [...pool].sort((a, b) => {
      const aMisconception = a.misconceptionCodes?.some((code) => supported.includes(code)) ? 0 : 1;
      const bMisconception = b.misconceptionCodes?.some((code) => supported.includes(code)) ? 0 : 1;
      const aDifficulty = Math.abs(["easy", "medium", "hard"].indexOf(a.difficulty) - ["easy", "medium", "hard"].indexOf(desiredDifficulty));
      const bDifficulty = Math.abs(["easy", "medium", "hard"].indexOf(b.difficulty) - ["easy", "medium", "hard"].indexOf(desiredDifficulty));
      return aMisconception - bMisconception || aDifficulty - bDifficulty || hash(`${input.seed}:${slot}:${a.id}`) - hash(`${input.seed}:${slot}:${b.id}`);
    });
    const item = sorted[0]!;
    used.add(item.id);
    const assignmentId = `assignment-${input.seed}-${String(slot + 1).padStart(2, "0")}`;
    selected.push({ assignmentId, bankId: item.id, question: toPublicQuestion(item, assignmentId), ...(target.revisionItemId ? { revisionItemId: target.revisionItemId } : {}), fallbackUsed: pool === candidates });
  }
  return { questions: selected, coveredRevisionItemIds: selected.flatMap(({ revisionItemId }) => revisionItemId ? [revisionItemId] : []), fallbackUsed };
}
