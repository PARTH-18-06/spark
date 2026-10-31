import { getProductionAuthHandlers } from "@/lib/server/auth/production";

export const dynamic = "force-dynamic";
export const PUT = (request: Request): Promise<Response> => getProductionAuthHandlers().saveStudentProfile(request);
