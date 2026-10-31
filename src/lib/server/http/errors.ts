import "server-only";

import type { ApiErrorCode, ApiErrorBody } from "@/contracts/tutor";

export const API_ERROR_CODES = [
  "VALIDATION_ERROR",
  "AUTH_REQUIRED",
  "INVALID_CREDENTIALS",
  "FORBIDDEN",
  "NOT_FOUND",
  "ONBOARDING_REQUIRED",
  "ACTIVE_SESSION_EXISTS",
  "SESSION_VERSION_CONFLICT",
  "INVALID_SESSION_STATE",
  "IDEMPOTENCY_CONFLICT",
  "REQUEST_IN_PROGRESS",
  "RATE_LIMITED",
  "AI_UNAVAILABLE",
  "INTERNAL_ERROR",
] as const satisfies readonly ApiErrorCode[];

export const API_ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  AUTH_REQUIRED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  ONBOARDING_REQUIRED: 409,
  ACTIVE_SESSION_EXISTS: 409,
  SESSION_VERSION_CONFLICT: 409,
  INVALID_SESSION_STATE: 409,
  IDEMPOTENCY_CONFLICT: 409,
  REQUEST_IN_PROGRESS: 409,
  RATE_LIMITED: 429,
  AI_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
} as const satisfies Record<ApiErrorCode, number>;

type ErrorBodyFields = Omit<ApiErrorBody["error"], "code" | "message" | "retryable" | "requestId">;

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly retryable: boolean;
  readonly requestId?: string;
  readonly fields: ErrorBodyFields;
  readonly expose: boolean;

  constructor(options: {
    code: ApiErrorCode;
    message: string;
    retryable?: boolean;
    requestId?: string;
    fieldErrors?: Record<string, string>;
    retryAfterSeconds?: number;
    activeSessionId?: string;
    cause?: unknown;
    expose?: boolean;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "ApiError";
    this.status = API_ERROR_STATUS[options.code];
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.requestId = options.requestId;
    this.fields = {
      ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {}),
      ...(options.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: options.retryAfterSeconds }
        : {}),
      ...(options.activeSessionId ? { activeSessionId: options.activeSessionId } : {}),
    };
    this.expose = options.expose ?? this.status < 500;
  }
}
