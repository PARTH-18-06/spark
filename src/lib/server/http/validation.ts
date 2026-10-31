import "server-only";

import type { z } from "zod";

import { ApiError } from "@/lib/server/http/errors";

function validationFieldErrors(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(
    error.issues.map((issue) => [issue.path.map(String).join(".") || "$", issue.message]),
  );
}

export function validate<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): z.output<Schema> {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new ApiError({
      code: "VALIDATION_ERROR",
      message: "Request payload does not match the API contract",
      fieldErrors: validationFieldErrors(result.error),
    });
  }

  return result.data;
}

export async function parseJson<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<z.output<Schema>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch (cause) {
    throw new ApiError({
      code: "VALIDATION_ERROR",
      message: "Request body must be valid JSON",
      fieldErrors: { $: "Request body must be valid JSON" },
      cause,
    });
  }

  return validate(schema, body);
}

export function validateResponse<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): z.output<Schema> {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new ApiError({
      code: "INTERNAL_ERROR",
      message: "Response payload does not match the API contract",
      cause: result.error,
      expose: false,
    });
  }

  return result.data;
}
