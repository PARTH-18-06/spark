import { ok } from "@/lib/server/http/responses";

export const runtime = "nodejs";

/** Internal readiness endpoint; it is not one of the shared tutor operations. */
export function GET() {
  return ok({ status: "ok" as const, service: "spark-backend" as const });
}
