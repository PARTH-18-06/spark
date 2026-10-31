import "server-only";

import type { ConceptId, Misconception } from "@/contracts/tutor";

export interface MisconceptionDefinition {
  code: string;
  conceptId: ConceptId;
  label: string;
}

export class MisconceptionPolicyError extends Error {}

export function findMisconception(catalog: readonly MisconceptionDefinition[], conceptId: ConceptId, code: string): MisconceptionDefinition {
  const definition = catalog.find((item) => item.code === code && item.conceptId === conceptId);
  if (!definition) throw new MisconceptionPolicyError(`Unsupported misconception code for concept: ${code}`);
  return definition;
}

export function validateMisconception(
  catalog: readonly MisconceptionDefinition[],
  conceptId: ConceptId,
  value: Misconception | null,
  reasoningText: string,
): Misconception | null {
  if (!value) return null;
  const definition = findMisconception(catalog, conceptId, value.misconceptionCode);
  if (value.label !== definition.label) throw new MisconceptionPolicyError("Misconception label does not match the server catalog");
  if (value.evidence !== null) {
    if (value.evidence.length === 0 || !reasoningText.includes(value.evidence)) {
      throw new MisconceptionPolicyError("Misconception evidence must be a nonempty exact excerpt of reasoning");
    }
  }
  return { misconceptionCode: definition.code, label: definition.label, evidence: value.evidence };
}
