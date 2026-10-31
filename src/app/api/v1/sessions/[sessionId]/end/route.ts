import { getProductionStudentSessionHandlers } from "@/lib/server/learning/production";

export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }): Promise<Response> {
  return getProductionStudentSessionHandlers().endSession(request, (await context.params).sessionId);
}

