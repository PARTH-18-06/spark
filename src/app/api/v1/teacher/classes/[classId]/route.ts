import { getProductionStudentReadHandlers } from "@/lib/server/learning/production";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ classId: string }> }): Promise<Response> {
  return getProductionStudentReadHandlers().getClassDashboard(request, (await context.params).classId);
}

