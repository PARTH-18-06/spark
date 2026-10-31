import "./support/server-only";

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { attemptResultSchema } from "@/lib/server/contracts/tutor-schemas";
import { SupabaseSessionRepository } from "@/lib/server/learning/session-service";

function attemptResultExample(): ReturnType<typeof attemptResultSchema.parse> {
  const source = readFileSync(new URL("../docs/frontend-api-contract.md", import.meta.url), "utf8");
  const examples = [...source.matchAll(/```json\s*([\s\S]*?)```/g)].map((match) => JSON.parse(match[1]) as unknown);
  const value = examples.find((candidate) => typeof candidate === "object" && candidate !== null && "attemptId" in candidate && "session" in candidate && "rewards" in candidate);
  if (!value) throw new Error("authoritative attempt-result example not found");
  return attemptResultSchema.parse(value);
}

describe("production session repository finalization boundary", () => {
  it("adapts the direct SQL result so idempotency completion receives the exact committed body", async () => {
    const raw = attemptResultExample();
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        if (name === "spark_finalize_learning_attempt") return { data: raw, error: null };
        if (name === "spark_complete_learning_mutation") {
          expect(args.p_response_status).toBe(200);
          expect(args.p_response_body).toEqual(raw);
          return { data: null, error: null };
        }
        throw new Error(`unexpected RPC ${name}`);
      },
    } as unknown as SupabaseClient;
    const repository = new SupabaseSessionRepository(client);

    const normalized = await repository.finalizeAttempt({
      studentId: "student-1",
      sessionId: raw.session.id,
      expectedVersion: raw.session.version - 1,
      assignment: {} as never,
      answer: {} as never,
      evaluation: {} as never,
      submittedAt: raw.submittedAt,
      claimToken: "claim-token",
    });

    expect(normalized.feedback.attemptId).toBe(raw.attemptId);
    expect(normalized.session).toEqual(raw.session);
    await repository.storeMutationResponse({ claimToken: "claim-token", status: 200, body: { ...normalized.feedback, session: normalized.session, rewards: raw.rewards } });
    expect(calls.map(({ name }) => name)).toEqual(["spark_finalize_learning_attempt", "spark_complete_learning_mutation"]);
  });

  it("does not surface a duplicate completion conflict after an atomic SQL commit", async () => {
    const client = {
      rpc: async (name: string) => {
        if (name === "spark_complete_learning_mutation") return { data: null, error: { message: "REQUEST_IN_PROGRESS" } };
        throw new Error(`unexpected RPC ${name}`);
      },
    } as unknown as SupabaseClient;
    const repository = new SupabaseSessionRepository(client);
    await expect(repository.storeMutationResponse({ claimToken: "already-committed", status: 200, body: {} })).resolves.toBeUndefined();
  });
});
