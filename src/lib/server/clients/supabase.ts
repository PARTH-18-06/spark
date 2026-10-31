import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/lib/server/env";

let adminClient: SupabaseClient | undefined;

/**
 * Privileged server client. Never pass this client or its key to browser code.
 * Route handlers must still authorize the current user before every operation.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  if (!adminClient) {
    const env = getSupabaseEnv();
    adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return adminClient;
}
