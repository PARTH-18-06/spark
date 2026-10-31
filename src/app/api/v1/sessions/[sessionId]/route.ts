import { getProductionStudentSessionHandlers } from "@/lib/server/learning/production";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }): Promise<Response> {
  return getProductionStudentSessionHandlers().getSession(request, (await context.params).sessionId);
}

