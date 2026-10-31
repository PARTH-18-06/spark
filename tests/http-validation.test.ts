import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ApiError } from "@/lib/server/http/errors";
import { apiErrorBodySchema } from "@/lib/server/http/schemas";
import { created, errorResponse, ok } from "@/lib/server/http/responses";
import { parseJson, validate, validateResponse } from "@/lib/server/http/validation";

const representativeSchema = z.strictObject({
  answer: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

describe("runtime validation primitives", () => {
  it("accepts a representative valid payload", () => {
    expect(validate(representativeSchema, { answer: "12 V", confidence: 0.9 })).toEqual({
      answer: "12 V",
      confidence: 0.9,
    });
  });

  it("returns contract-shaped 400 validation metadata for invalid input", () => {
    try {
      validate(representativeSchema, { answer: "", confidence: 2 });
      expect.fail("Expected validation to fail");
    } catch (error) {
      expect(error).toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
        fields: {
          fieldErrors: {
            answer: expect.any(String),
            confidence: expect.any(String),
          },
        },
      });
    }
  });

  it("classifies malformed JSON as VALIDATION_ERROR", async () => {
    const request = new Request("http://localhost/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });
    await expect(parseJson(request, representativeSchema)).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects invalid outbound payloads without exposing schema details", () => {
    try {
      validateResponse(representativeSchema, { answer: "12 V" });
      expect.fail("Expected response validation to fail");
    } catch (error) {
      expect(error).toMatchObject({ status: 500, code: "INTERNAL_ERROR", expose: false });
    }
  });
});

describe("contract HTTP bodies", () => {
  it("returns successful objects directly with no data or success wrapper", async () => {
    const response = ok({ answer: "12 V", confidence: 0.9 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ answer: "12 V", confidence: 0.9 });
  });

  it("returns new sessions directly with HTTP 201", async () => {
    const response = created({ id: "session_01" });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "session_01" });
  });

  it("returns the exact ApiErrorBody shape", async () => {
    const response = errorResponse(
      new ApiError({
        code: "VALIDATION_ERROR",
        message: "Invalid payload",
        fieldErrors: { finalAnswerText: "Required" },
      }),
      "request_test_01",
    );
    expect(response.status).toBe(400);
    expect(apiErrorBodySchema.parse(await response.json())).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid payload",
        retryable: false,
        requestId: "request_test_01",
        fieldErrors: { finalAnswerText: "Required" },
      },
    });
  });

  it("redacts unexpected server errors while preserving required fields", async () => {
    const response = errorResponse(new Error("database password leaked"), "request_test_02");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
        retryable: false,
        requestId: "request_test_02",
      },
    });
  });
});
