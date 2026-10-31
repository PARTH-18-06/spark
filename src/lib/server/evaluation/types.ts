import "server-only";

import type { EvaluationStatus, Misconception, Question } from "@/contracts/tutor";
import type { MisconceptionDefinition } from "@/lib/server/learning/misconceptions";

export interface TrustedRubric {
  questionId: string;
  rubricVersion: number;
  correctAnswer: Record<string, unknown>;
  workedSolution: string;
  reasoningRubric: { required: string[] };
  numericAnswer: number | null;
  numericTolerance: number | null;
  expectedUnit: string | null;
  supportedMisconceptionCodes: readonly string[];
  allowDeterministicOnly?: boolean;
}

export interface StudentAnswer {
  finalAnswerText: string;
  reasoningText: string;
  selectedOptionId: string | null;
}

export interface EvaluationInput {
  question: Question;
  rubric: TrustedRubric;
  answer: StudentAnswer;
  misconceptionCatalog: readonly MisconceptionDefinition[];
}

export interface GroqAnalysisRequest {
  question: Pick<Question, "conceptId" | "format" | "prompt" | "expectedUnit">;
  rubric: Pick<TrustedRubric, "correctAnswer" | "reasoningRubric" | "expectedUnit" | "workedSolution">;
  answer: StudentAnswer;
  allowedMisconceptions: readonly { code: string; label: string }[];
}

export interface GroqAnalysisResult {
  status: EvaluationStatus;
  finalAnswerCorrect: boolean | null;
  reasoningStatus: "sound" | "misconception" | "unclear" | "not_provided";
  feedback: string;
  misconceptionCode: string | null;
  misconceptionEvidence: string | null;
  clarificationPrompt: string | null;
}

export interface EvaluationDecision {
  status: EvaluationStatus;
  finalAnswerCorrect: boolean | null;
  reasoningStatus: "sound" | "misconception" | "unclear" | "not_provided";
  feedback: string;
  misconception: Misconception | null;
  clarificationPrompt: string | null;
  deterministicFinalAnswer: boolean | null;
}

export interface EvaluationProvider {
  analyze(request: GroqAnalysisRequest): Promise<unknown>;
}

export type EvaluationFailureKind =
  | "invalid_input"
  | "rubric_mismatch"
  | "malformed_output"
  | "unsupported_misconception"
  | "provider_unavailable"
  | "provider_rate_limited"
  | "provider_timeout"
  | "provider_authentication"
  | "provider_configuration";

export class EvaluationServiceError extends Error {
  constructor(readonly kind: EvaluationFailureKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EvaluationServiceError";
  }
}
