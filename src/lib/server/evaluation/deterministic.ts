import "server-only";

import type { Question } from "@/contracts/tutor";
import type { TrustedRubric, StudentAnswer } from "@/lib/server/evaluation/types";

export interface DeterministicCheck {
  finalAnswerCorrect: boolean | null;
  reason: "multiple_choice" | "numeric" | "unsupported_expression" | "unsupported_rubric";
}

function normalizeUnit(value: string): string {
  return value.trim().toLowerCase().replaceAll("μ", "u").replaceAll("Ω", "ohm").replace(/\s+/g, " ")
    .replace(/^(amp|amps|ampere|amperes)$/, "a")
    .replace(/^(ohms?)$/, "ohm")
    .replace(/^(joule|joules)$/, "j")
    .replace(/^(watt|watts)$/, "w");
}

function parseNumericAnswer(text: string): { value: number; unit: string | null } | null {
  const match = text.trim().match(/^([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)(?:\s+(.+))?$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return { value, unit: match[2] ? normalizeUnit(match[2]) : null };
}

export function deterministicCheck(question: Question, rubric: TrustedRubric, answer: StudentAnswer): DeterministicCheck {
  if (question.format === "multiple_choice") {
    const expected = rubric.correctAnswer.selectedOptionId;
    if (typeof expected !== "string" || !answer.selectedOptionId) return { finalAnswerCorrect: false, reason: "multiple_choice" };
    return { finalAnswerCorrect: answer.selectedOptionId === expected, reason: "multiple_choice" };
  }
  if (rubric.numericAnswer === null || rubric.numericTolerance === null || !rubric.expectedUnit) {
    return { finalAnswerCorrect: null, reason: rubric.correctAnswer.acceptedExpression ? "unsupported_expression" : "unsupported_rubric" };
  }
  if (!Number.isFinite(rubric.numericAnswer) || !Number.isFinite(rubric.numericTolerance) || rubric.numericTolerance < 0) {
    return { finalAnswerCorrect: null, reason: "unsupported_rubric" };
  }
  const parsed = parseNumericAnswer(answer.finalAnswerText);
  if (!parsed || parsed.unit === null || normalizeUnit(rubric.expectedUnit) !== parsed.unit) return { finalAnswerCorrect: false, reason: "numeric" };
  return { finalAnswerCorrect: Math.abs(parsed.value - rubric.numericAnswer) <= rubric.numericTolerance, reason: "numeric" };
}

export const normalizeNumericUnitForTest = normalizeUnit;
