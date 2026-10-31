import "server-only";

import {
  createClient,
  isAuthApiError,
  isAuthRetryableFetchError,
  type AuthError,
  type Session,
} from "@supabase/supabase-js";

import { AuthProviderError, type AuthProvider, type ProviderTokens } from "@/lib/server/auth/types";

function providerError(error: AuthError | null, fallback: string): AuthProviderError {
  if (error && (isAuthRetryableFetchError(error) || (isAuthApiError(error) && error.status >= 500))) {
    return new AuthProviderError("unavailable", "Authentication provider is unavailable", { cause: error });
  }
  return new AuthProviderError("invalid", fallback, { cause: error ?? undefined });
}

function tokens(session: Session | null, error: AuthError | null): ProviderTokens {
  if (error || !session?.access_token || !session.refresh_token || !session.expires_at) {
    throw providerError(error, "Authentication session is invalid or expired");
  }
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: new Date(session.expires_at * 1000),
  };
}

export function createSupabaseAuthProvider(options: {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}): AuthProvider {
  const client = (key: string) => createClient(options.url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  return {
    async signIn(email, password) {
      const { data, error } = await client(options.anonKey).auth.signInWithPassword({ email, password });
      if (error) throw providerError(error, "Email or password is incorrect");
      return tokens(data.session, null);
    },
    async verifyUser(accessToken) {
      const { data, error } = await client(options.anonKey).auth.getUser(accessToken);
      if (error || !data.user) throw providerError(error, "Authentication session is invalid or expired");
      return { id: data.user.id };
    },
    async refresh(refreshToken) {
      const { data, error } = await client(options.anonKey).auth.refreshSession({ refresh_token: refreshToken });
      return tokens(data.session, error);
    },
    async signOut(accessToken) {
      const { error } = await client(options.serviceRoleKey).auth.admin.signOut(accessToken, "local");
      if (error) throw providerError(error, "Authentication session is invalid or expired");
    },
  };
}
