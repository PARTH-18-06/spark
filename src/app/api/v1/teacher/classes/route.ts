import { getProductionStudentReadHandlers } from "@/lib/server/learning/production";

export const dynamic = "force-dynamic";
export const GET = (request: Request): Promise<Response> => getProductionStudentReadHandlers().getClasses(request);

