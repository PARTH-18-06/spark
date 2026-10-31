import "server-only";

import { z } from "zod";

import type { GroqAnalysisResult, StudentAnswer, TrustedRubric } from "@/lib/server/evaluation/types";

export const studentAnswerSchema = z.strictObject({
  finalAnswerText: z.string().max(2000),
  reasoningText: z.string().max(8000),
  selectedOptionId: z.string().trim().min(1).nullable(),
});

export const trustedRubricSchema = z.strictObject({
  questionId: z.string().trim().min(1),
  rubricVersion: z.number().int().positive(),
  correctAnswer: z.record(z.string(), z.unknown()),
  workedSolution: z.string().trim().min(1).max(10000),
  reasoningRubric: z.strictObject({ required: z.array(z.string().trim().min(1).max(300)).max(30) }),
  numericAnswer: z.number().finite().nullable(),
  numericTolerance: z.number().finite().min(0).nullable(),
  expectedUnit: z.string().trim().min(1).max(50).nullable(),
  supportedMisconceptionCodes: z.array(z.string().regex(/^[A-Z][A-Z0-9_]*$/)).max(30),
  allowDeterministicOnly: z.boolean().optional(),
}) satisfies z.ZodType<TrustedRubric>;

export const groqAnalysisResultSchema = z.strictObject({
  status: z.enum(["correct", "partial", "incorrect", "needs_clarification"]),
  finalAnswerCorrect: z.boolean().nullable(),
  reasoningStatus: z.enum(["sound", "misconception", "unclear", "not_provided"]),
  feedback: z.string().trim().min(1).max(2000),
  misconceptionCode: z.string().regex(/^[A-Z][A-Z0-9_]*$/).nullable(),
  misconceptionEvidence: z.string().max(1000).nullable(),
  clarificationPrompt: z.string().trim().min(1).max(1000).nullable(),
}).superRefine((value, context) => {
  if (value.status === "needs_clarification") {
    if (value.finalAnswerCorrect !== null) context.addIssue({ code: "custom", path: ["finalAnswerCorrect"], message: "Clarification has no correctness result" });
    if (!value.clarificationPrompt) context.addIssue({ code: "custom", path: ["clarificationPrompt"], message: "Clarification requires a prompt" });
  } else if (value.finalAnswerCorrect === null) {
    context.addIssue({ code: "custom", path: ["finalAnswerCorrect"], message: "Graded result requires correctness" });
  }
  if (value.reasoningStatus === "misconception") {
    if (!value.misconceptionCode) context.addIssue({ code: "custom", path: ["misconceptionCode"], message: "Misconception reasoning requires a code" });
    if (!value.misconceptionEvidence) context.addIssue({ code: "custom", path: ["misconceptionEvidence"], message: "Misconception reasoning requires evidence" });
  } else if (value.misconceptionCode !== null || value.misconceptionEvidence !== null) {
    context.addIssue({ code: "custom", path: ["misconceptionCode"], message: "Only misconception reasoning may include a misconception" });
  }
});

export function parseStudentAnswer(value: unknown): StudentAnswer { return studentAnswerSchema.parse(value); }
export function parseGroqAnalysis(value: unknown): GroqAnalysisResult { return groqAnalysisResultSchema.parse(value); }
