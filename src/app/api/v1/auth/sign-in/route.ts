import { getProductionAuthHandlers } from "@/lib/server/auth/production";

export const dynamic = "force-dynamic";
export const POST = (request: Request): Promise<Response> => getProductionAuthHandlers().signIn(request);
