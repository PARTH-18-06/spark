import { getProductionStudentSessionHandlers } from "@/lib/server/learning/production";

export const dynamic = "force-dynamic";
export const POST = (request: Request): Promise<Response> => getProductionStudentSessionHandlers().startSession(request);

