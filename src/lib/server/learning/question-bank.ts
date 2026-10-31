import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConceptId } from "@/contracts/tutor";
import type { BankQuestion } from "@/lib/server/learning/selection";
import type { TrustedRubric } from "@/lib/server/evaluation/types";
import type { MisconceptionDefinition } from "@/lib/server/learning/misconceptions";

interface QuestionRow {
  id: string;
  concept_id: ConceptId;
  format: "multiple_choice" | "free_response";
  difficulty: "easy" | "medium" | "hard";
  public_prompt: string;
  hint: string | null;
  expected_unit: string | null;
  options: { id: string; text: string }[] | null;
}

interface MisconceptionRow { question_id: string; misconception_code: string }

/** Loads only active public question content and stable misconception links. */
export async function loadReviewedQuestionBank(client: SupabaseClient): Promise<BankQuestion[]> {
  const [questionsResult, linksResult] = await Promise.all([
    client.from("question_bank").select("id,concept_id,format,difficulty,public_prompt,hint,expected_unit,options").eq("is_active", true).order("id"),
    client.from("question_misconceptions").select("question_id,misconception_code"),
  ]);
  if (questionsResult.error) throw new Error("Unable to load the reviewed question bank", { cause: questionsResult.error });
  if (linksResult.error) throw new Error("Unable to load question misconception links", { cause: linksResult.error });
  const links = new Map<string, string[]>();
  for (const row of (linksResult.data ?? []) as MisconceptionRow[]) links.set(row.question_id, [...(links.get(row.question_id) ?? []), row.misconception_code]);
  return ((questionsResult.data ?? []) as QuestionRow[]).map((row) => ({
    id: row.id,
    conceptId: row.concept_id,
    format: row.format,
    difficulty: row.difficulty,
    prompt: row.public_prompt,
    ...(row.hint ? { hint: row.hint } : {}),
    ...(row.expected_unit ? { expectedUnit: row.expected_unit } : {}),
    ...(row.format === "multiple_choice" ? { options: row.options ?? [] } : {}),
    misconceptionCodes: links.get(row.id) ?? [],
  }));
}

export async function loadReviewedRubrics(client: SupabaseClient): Promise<Map<string, TrustedRubric>> {
  const [rubricResult, linksResult] = await Promise.all([
    client.from("question_rubrics").select("question_id,rubric_version,correct_answer,worked_solution,reasoning_rubric,numeric_answer,numeric_tolerance,expected_unit"),
    client.from("question_misconceptions").select("question_id,misconception_code"),
  ]);
  if (rubricResult.error) throw new Error("Unable to load reviewed rubrics", { cause: rubricResult.error });
  if (linksResult.error) throw new Error("Unable to load question misconception links", { cause: linksResult.error });
  const codes = new Map<string, string[]>();
  for (const row of (linksResult.data ?? []) as MisconceptionRow[]) codes.set(row.question_id, [...(codes.get(row.question_id) ?? []), row.misconception_code]);
  return new Map((rubricResult.data ?? []).map((row) => {
    const value = row as unknown as { question_id: string; rubric_version: number; correct_answer: Record<string, unknown>; worked_solution: string; reasoning_rubric: { required: string[] }; numeric_answer: number | null; numeric_tolerance: number | null; expected_unit: string | null };
    return [value.question_id, { questionId: value.question_id, rubricVersion: value.rubric_version, correctAnswer: value.correct_answer, workedSolution: value.worked_solution, reasoningRubric: value.reasoning_rubric, numericAnswer: value.numeric_answer, numericTolerance: value.numeric_tolerance, expectedUnit: value.expected_unit, supportedMisconceptionCodes: codes.get(value.question_id) ?? [] }] as const;
  }));
}

export async function loadMisconceptionCatalog(client: SupabaseClient): Promise<MisconceptionDefinition[]> {
  const result = await client.from("misconception_catalog").select("code,concept_id,label").order("code");
  if (result.error) throw new Error("Unable to load misconception catalog", { cause: result.error });
  return (result.data ?? []).map((row) => ({ code: row.code, conceptId: row.concept_id, label: row.label })) as MisconceptionDefinition[];
}
