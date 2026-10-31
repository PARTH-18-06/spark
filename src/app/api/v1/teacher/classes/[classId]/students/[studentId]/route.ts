import { getProductionStudentReadHandlers } from "@/lib/server/learning/production";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ classId: string; studentId: string }> }): Promise<Response> {
  const params = await context.params;
  return getProductionStudentReadHandlers().getStudentDetail(request, params.classId, params.studentId);
}

