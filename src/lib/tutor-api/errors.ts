import type { ApiErrorBody, TutorApiError, TutorNetworkError, TutorProtocolError } from "../../contracts/tutor";

export class HttpApiError extends Error implements TutorApiError {
  readonly kind = "http" as const;
  constructor(readonly status: number, readonly body: ApiErrorBody) { super(body.error.message); this.name = "TutorApiError"; }
}
export class NetworkError extends Error implements TutorNetworkError {
  readonly kind = "network" as const;
  readonly retryable = true as const;
  constructor() { super("Connection interrupted. Retry the same request; pending learning actions remain saved."); this.name = "TutorNetworkError"; }
}
export class ProtocolError extends Error implements TutorProtocolError {
  readonly kind = "protocol" as const;
  readonly retryable = false as const;
  constructor(readonly reason: TutorProtocolError["reason"], readonly status: number, readonly outcome: TutorProtocolError["outcome"], readonly requestId: string | null = null) {
    super(outcome === "unknown"
      ? "The service returned an unexpected response. Your pending learning action is preserved for an exact retry."
      : "The service returned an unexpected response. Please retry after the integration is corrected.");
    this.name = "TutorProtocolError";
  }
}
export function apiError(code: ApiErrorBody["error"]["code"], message: string, status = 409, extra: Partial<ApiErrorBody["error"]> = {}): never {
  throw new HttpApiError(status, { error: { code, message, retryable: false, requestId: "demo-request", ...extra } });
}
export function errorText(error: unknown) { return error instanceof Error ? error.message : "Something went wrong. Please retry."; }
