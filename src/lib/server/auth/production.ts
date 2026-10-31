import "server-only";

import { createTokenCipher } from "@/lib/server/auth/crypto";
import { createAuthHandlers, type AuthHandlers } from "@/lib/server/auth/handlers";
import { createSupabaseAuthProvider } from "@/lib/server/auth/supabase-provider";
import { createSupabaseAuthStore } from "@/lib/server/auth/supabase-store";
import { getSupabaseAdminClient } from "@/lib/server/clients/supabase";
import { getAuthEnv } from "@/lib/server/env";
import { AuthService } from "@/lib/server/auth/service";
import type { AuthDependencies } from "@/lib/server/auth/types";

let productionDependencies: AuthDependencies | undefined;

export function getProductionAuthDependencies(): AuthDependencies {
  if (productionDependencies) return productionDependencies;
  const env = getAuthEnv();
  const cipher = createTokenCipher(env.AUTH_TOKEN_ENCRYPTION_KEY);
  productionDependencies = {
    provider: createSupabaseAuthProvider({
      url: env.SUPABASE_URL,
      anonKey: env.SUPABASE_ANON_KEY,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    }),
    store: createSupabaseAuthStore(getSupabaseAdminClient(), {
      maximumAttempts: env.AUTH_LOGIN_MAX_ATTEMPTS,
      windowSeconds: env.AUTH_LOGIN_WINDOW_SECONDS,
      blockSeconds: env.AUTH_LOGIN_BLOCK_SECONDS,
    }),
    config: {
      allowedOrigins: env.AUTH_ALLOWED_ORIGINS,
      cookieName: env.AUTH_SESSION_COOKIE_NAME,
      cookieSecure: env.AUTH_COOKIE_SECURE,
      sessionTtlSeconds: env.AUTH_SESSION_TTL_SECONDS,
      refreshSkewSeconds: env.AUTH_REFRESH_SKEW_SECONDS,
      rateLimitSecret: env.AUTH_RATE_LIMIT_SECRET,
      trustProxy: env.AUTH_TRUST_PROXY,
    },
    encrypt: cipher.encrypt,
    decrypt: cipher.decrypt,
    now: () => new Date(),
  };
  return productionDependencies;
}

export function getProductionAuthService(): AuthService {
  return new AuthService(getProductionAuthDependencies());
}

export function getProductionAuthHandlers(): AuthHandlers {
  return createAuthHandlers(getProductionAuthDependencies());
}
