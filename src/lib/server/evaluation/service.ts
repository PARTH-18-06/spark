import "server-only";

import type { AttemptFeedback } from "@/contracts/tutor";
import { questionSchema } from "@/lib/server/contracts/tutor-schemas";
import { findMisconception, MisconceptionPolicyError, validateMisconception } from "@/lib/server/learning/misconceptions";
import { ApiError } from "@/lib/server/http/errors";
import { deterministicCheck } from "@/lib/server/evaluation/deterministic";
import { parseGroqAnalysis, parseStudentAnswer, trustedRubricSchema } from "@/lib/server/evaluation/schema";
import type { EvaluationDecision, EvaluationInput, EvaluationProvider, GroqAnalysisRequest, TrustedRubric } from "@/lib/server/evaluation/types";
import { EvaluationServiceError } from "@/lib/server/evaluation/types";

function invalidInput(message: string, cause?: unknown): EvaluationServiceError {
  return new EvaluationServiceError("invalid_input", message, cause ? { cause } : undefined);
}

function parseTrustedInput(input: EvaluationInput): { question: EvaluationInput["question"]; rubric: TrustedRubric; answer: EvaluationInput["answer"] } {
  try {
    const question = questionSchema.parse(input.question);
    const rubric = trustedRubricSchema.parse(input.rubric);
    const answer = parseStudentAnswer(input.answer);
    if (rubric.questionId !== question.id) throw new EvaluationServiceError("rubric_mismatch", "Question and rubric IDs do not match");
    return { question, rubric, answer };
  } catch (error) {
    if (error instanceof EvaluationServiceError) throw error;
    throw invalidInput("Evaluation input does not match the trusted contract shape", error);
  }
}

function analysisRequest(input: ReturnType<typeof parseTrustedInput>, catalog: EvaluationInput["misconceptionCatalog"]): GroqAnalysisRequest {
  return {
    question: {
      conceptId: input.question.conceptId,
      format: input.question.format,
      prompt: input.question.prompt,
      ...(input.question.expectedUnit ? { expectedUnit: input.question.expectedUnit } : {}),
    },
    rubric: {
      correctAnswer: input.rubric.correctAnswer,
      reasoningRubric: input.rubric.reasoningRubric,
      expectedUnit: input.rubric.expectedUnit,
      workedSolution: input.rubric.workedSolution,
    },
    answer: input.answer,
    allowedMisconceptions: catalog
      .filter(({ conceptId, code }) => conceptId === input.question.conceptId && (input.rubric.supportedMisconceptionCodes.length === 0 || input.rubric.supportedMisconceptionCodes.includes(code)))
      .map(({ code, label }) => ({ code, label })),
  };
}

function mapApiError(error: EvaluationServiceError): ApiError {
  if (error.kind === "invalid_input") return new ApiError({ code: "VALIDATION_ERROR", message: error.message, cause: error });
  if (error.kind === "provider_rate_limited" || error.kind === "provider_timeout" || error.kind === "provider_unavailable") {
    return new ApiError({ code: "AI_UNAVAILABLE", message: "Answer evaluation is temporarily unavailable", retryable: true, cause: error });
  }
  if (error.kind === "provider_authentication" || error.kind === "provider_configuration") {
    return new ApiError({ code: "AI_UNAVAILABLE", message: "Answer evaluation is not configured", retryable: false, cause: error });
  }
  return new ApiError({ code: "INTERNAL_ERROR", message: "Answer evaluation could not be validated", cause: error, expose: false });
}

export class EvaluationService {
  constructor(private readonly provider: EvaluationProvider) {}

  async evaluate(input: EvaluationInput): Promise<EvaluationDecision> {
    const parsed = parseTrustedInput(input);
    const deterministic = deterministicCheck(parsed.question, parsed.rubric, parsed.answer);
    if (parsed.rubric.allowDeterministicOnly && deterministic.finalAnswerCorrect !== null && parsed.answer.reasoningText.trim() === "") {
      return {
        status: deterministic.finalAnswerCorrect ? "correct" : "incorrect",
        finalAnswerCorrect: deterministic.finalAnswerCorrect,
        reasoningStatus: "not_provided",
        feedback: "The submitted final answer was checked against the reviewed rubric.",
        misconception: null,
        clarificationPrompt: null,
        deterministicFinalAnswer: deterministic.finalAnswerCorrect,
      };
    }

    let raw: unknown;
    try {
      raw = await this.provider.analyze(analysisRequest(parsed, input.misconceptionCatalog));
    } catch (error) {
      if (error instanceof EvaluationServiceError) throw error;
      throw new EvaluationServiceError("provider_unavailable", "The evaluation provider failed", { cause: error });
    }

    let ai;
    try {
      ai = parseGroqAnalysis(raw);
    } catch (error) {
      throw new EvaluationServiceError("malformed_output", "The evaluation provider returned an invalid result", { cause: error });
    }
    if (ai.feedback.includes(parsed.rubric.workedSolution)) {
      throw new EvaluationServiceError("malformed_output", "The evaluation provider attempted to disclose private rubric content");
    }

    let misconception = null;
    if (ai.misconceptionCode !== null) {
      if (parsed.rubric.supportedMisconceptionCodes.length > 0 && !parsed.rubric.supportedMisconceptionCodes.includes(ai.misconceptionCode)) {
        throw new EvaluationServiceError("unsupported_misconception", "The evaluation provider returned an unsupported misconception code");
      }
      try {
        const definition = findMisconception(input.misconceptionCatalog, parsed.question.conceptId, ai.misconceptionCode);
        misconception = validateMisconception(input.misconceptionCatalog, parsed.question.conceptId, {
          misconceptionCode: definition.code,
          label: definition.label,
          evidence: ai.misconceptionEvidence,
        }, parsed.answer.reasoningText);
      } catch (error) {
        if (error instanceof MisconceptionPolicyError) throw new EvaluationServiceError("unsupported_misconception", error.message, { cause: error });
        throw error;
      }
    }

    const finalAnswerCorrect = deterministic.finalAnswerCorrect ?? ai.finalAnswerCorrect;
    const status = deterministic.finalAnswerCorrect === null ? ai.status : deterministic.finalAnswerCorrect ? "correct" : "incorrect";
    if (status !== "needs_clarification" && finalAnswerCorrect === null) {
      throw new EvaluationServiceError("malformed_output", "Evaluation did not provide a final-answer result");
    }
    return {
      status,
      finalAnswerCorrect: status === "needs_clarification" ? null : finalAnswerCorrect,
      reasoningStatus: ai.reasoningStatus,
      feedback: ai.feedback,
      misconception,
      clarificationPrompt: status === "needs_clarification" ? ai.clarificationPrompt : null,
      deterministicFinalAnswer: deterministic.finalAnswerCorrect,
    };
  }

  static toApiError(error: unknown): ApiError {
    if (error instanceof EvaluationServiceError) return mapApiError(error);
    return new ApiError({ code: "INTERNAL_ERROR", message: "Answer evaluation could not be completed", retryable: false, cause: error, expose: false });
  }
}

/** Only these fields may be copied into the v1.1.0 attempt feedback object. */
export function toContractEvaluation(decision: EvaluationDecision): Pick<AttemptFeedback, "status" | "finalAnswerCorrect" | "reasoningStatus" | "feedback" | "misconception" | "clarificationPrompt"> {
  return {
    status: decision.status,
    finalAnswerCorrect: decision.finalAnswerCorrect,
    reasoningStatus: decision.reasoningStatus,
    feedback: decision.feedback,
    misconception: decision.misconception,
    clarificationPrompt: decision.clarificationPrompt,
  };
}
