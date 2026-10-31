import { getProductionAuthHandlers } from "@/lib/server/auth/production";

export const dynamic = "force-dynamic";
export const GET = (request: Request): Promise<Response> => getProductionAuthHandlers().getCurrentUser(request);
