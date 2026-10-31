import "server-only";

import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import type { ApiErrorBody } from "@/contracts/tutor";
import { ApiError } from "@/lib/server/http/errors";

export function ok<Data>(data: Data, init?: ResponseInit): NextResponse<Data> {
  return NextResponse.json(data, { ...init, status: init?.status ?? 200 });
}

export function created<Data>(data: Data, init?: ResponseInit): NextResponse<Data> {
  return NextResponse.json(data, { ...init, status: 201 });
}

export function noContent(init?: ResponseInit): Response {
  return new Response(null, { ...init, status: 204 });
}

export function errorResponse(
  error: unknown,
  fallbackRequestId: string = randomUUID(),
): NextResponse<ApiErrorBody> {
  if (error instanceof ApiError) {
    const body: ApiErrorBody = {
      error: {
        code: error.code,
        message: error.expose ? error.message : "An unexpected error occurred",
        retryable: error.retryable,
        requestId: error.requestId ?? fallbackRequestId,
        ...(error.expose ? error.fields : {}),
      },
    };

    return NextResponse.json(
      body,
      { status: error.status },
    );
  }

  const body: ApiErrorBody = {
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
      retryable: false,
      requestId: fallbackRequestId,
    },
  };

  return NextResponse.json(
    body,
    { status: 500 },
  );
}
