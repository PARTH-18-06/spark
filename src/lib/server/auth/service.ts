import "server-only";

import { randomUUID } from "node:crypto";

import type { AuthenticatedState, AuthState, SaveStudentProfileInput, StudentProfile } from "@/contracts/tutor";
import { hmac256, randomToken, sha256 } from "@/lib/server/auth/crypto";
import { requireStudent } from "@/lib/server/auth/guards";
import { AuthProviderError, type AuthDependencies, type IdentityRecord, type StoredSession } from "@/lib/server/auth/types";
import { ApiError } from "@/lib/server/http/errors";

export const ANONYMOUS_AUTH_STATE: AuthState = {
  authenticated: false, user: null, studentProfile: null, csrfToken: null, expiresAt: null,
};

export interface ResolvedSession {
  session: StoredSession;
  identity: IdentityRecord;
  csrfToken: string;
  accessToken: string;
}

export type SessionResolution =
  | { kind: "anonymous"; clearCookie: boolean }
  | { kind: "authenticated"; value: ResolvedSession };

function providerUnavailable(cause: unknown): ApiError {
  return new ApiError({
    code: "INTERNAL_ERROR",
    message: "Authentication provider is unavailable",
    retryable: true,
    cause,
    expose: true,
  });
}

export class AuthService {
  constructor(private readonly dependencies: AuthDependencies) {}

  loginKeys(email: string, addressBucket: string): string[] {
    const normalizedEmail = email.trim().toLowerCase();
    const keys = [hmac256(this.dependencies.config.rateLimitSecret, `email\0${normalizedEmail}`)];
    if (addressBucket !== "direct") {
      keys.push(hmac256(this.dependencies.config.rateLimitSecret, `address\0${addressBucket}`));
    }
    return keys;
  }

  async resolve(sessionToken: string | null): Promise<SessionResolution> {
    if (!sessionToken) return { kind: "anonymous", clearCookie: false };
    const session = await this.dependencies.store.findSession(sha256(sessionToken));
    if (!session || session.expiresAt.getTime() <= this.dependencies.now().getTime()) {
      return { kind: "anonymous", clearCookie: true };
    }

    let accessToken: string;
    let refreshToken: string;
    let csrfToken: string;
    try {
      accessToken = this.dependencies.decrypt(session.accessTokenCiphertext);
      refreshToken = this.dependencies.decrypt(session.refreshTokenCiphertext);
      csrfToken = this.dependencies.decrypt(session.csrfTokenCiphertext);
    } catch (cause) {
      throw new ApiError({ code: "INTERNAL_ERROR", message: "Stored authentication session is unreadable", cause, expose: false });
    }

    const refresh = async (): Promise<boolean> => {
      try {
        const next = await this.dependencies.provider.refresh(refreshToken);
        accessToken = next.accessToken;
        refreshToken = next.refreshToken;
        session.providerExpiresAt = next.expiresAt;
        await this.dependencies.store.updateProviderTokens(
          session.id,
          this.dependencies.encrypt(accessToken),
          this.dependencies.encrypt(refreshToken),
          next.expiresAt,
        );
        return true;
      } catch (error) {
        if (error instanceof AuthProviderError && error.kind === "invalid") {
          await this.dependencies.store.revokeSession(session.id);
          return false;
        }
        throw providerUnavailable(error);
      }
    };

    if (session.providerExpiresAt.getTime() <= this.dependencies.now().getTime() + this.dependencies.config.refreshSkewSeconds * 1000) {
      if (!await refresh()) return { kind: "anonymous", clearCookie: true };
    }

    let providerUser: { id: string };
    try {
      providerUser = await this.dependencies.provider.verifyUser(accessToken);
    } catch (error) {
      if (error instanceof AuthProviderError && error.kind === "invalid") {
        if (!await refresh()) return { kind: "anonymous", clearCookie: true };
        try {
          providerUser = await this.dependencies.provider.verifyUser(accessToken);
        } catch (secondError) {
          if (secondError instanceof AuthProviderError && secondError.kind === "invalid") {
            await this.dependencies.store.revokeSession(session.id);
            return { kind: "anonymous", clearCookie: true };
          }
          throw providerUnavailable(secondError);
        }
      } else {
        throw providerUnavailable(error);
      }
    }

    if (providerUser.id !== session.userId) {
      await this.dependencies.store.revokeSession(session.id);
      return { kind: "anonymous", clearCookie: true };
    }
    const identity = await this.dependencies.store.loadIdentity(session.userId);
    if (!identity) throw new ApiError({ code: "FORBIDDEN", message: "Account is not provisioned for Spark" });
    return { kind: "authenticated", value: { session, identity, csrfToken, accessToken } };
  }

  toState(value: ResolvedSession): AuthenticatedState {
    return {
      authenticated: true,
      user: value.identity.user,
      studentProfile: value.identity.studentProfile,
      csrfToken: value.csrfToken,
      expiresAt: value.session.expiresAt.toISOString(),
    };
  }

  async signIn(email: string, password: string, rateKeys: readonly string[]): Promise<{ state: AuthenticatedState; sessionToken: string }> {
    for (const rateKey of rateKeys) {
      const limit = await this.dependencies.store.consumeLoginAttempt(rateKey);
      if (!limit.allowed) {
        throw new ApiError({ code: "RATE_LIMITED", message: "Too many sign-in attempts", retryable: true, retryAfterSeconds: limit.retryAfterSeconds });
      }
    }
    let tokens;
    try {
      tokens = await this.dependencies.provider.signIn(email, password);
    } catch (error) {
      if (error instanceof AuthProviderError && error.kind === "invalid") {
        throw new ApiError({ code: "INVALID_CREDENTIALS", message: "Email or password is incorrect" });
      }
      throw providerUnavailable(error);
    }
    let providerUser;
    try {
      providerUser = await this.dependencies.provider.verifyUser(tokens.accessToken);
    } catch (error) {
      if (error instanceof AuthProviderError && error.kind === "invalid") {
        throw new ApiError({ code: "INVALID_CREDENTIALS", message: "Authentication session is invalid" });
      }
      throw providerUnavailable(error);
    }
    const identity = await this.dependencies.store.loadIdentity(providerUser.id);
    if (!identity) throw new ApiError({ code: "FORBIDDEN", message: "Account is not provisioned for Spark" });

    const sessionToken = randomToken();
    const csrfToken = randomToken();
    const now = this.dependencies.now();
    const session: StoredSession = {
      id: randomUUID(),
      userId: providerUser.id,
      accessTokenCiphertext: this.dependencies.encrypt(tokens.accessToken),
      refreshTokenCiphertext: this.dependencies.encrypt(tokens.refreshToken),
      csrfTokenCiphertext: this.dependencies.encrypt(csrfToken),
      csrfTokenHash: sha256(csrfToken),
      expiresAt: new Date(now.getTime() + this.dependencies.config.sessionTtlSeconds * 1000),
      providerExpiresAt: tokens.expiresAt,
    };
    await this.dependencies.store.createSession({ ...session, sessionTokenHash: sha256(sessionToken) });
    await Promise.all(rateKeys.map((rateKey) => this.dependencies.store.clearLoginAttempts(rateKey)));
    return { state: this.toState({ session, identity, csrfToken, accessToken: tokens.accessToken }), sessionToken };
  }

  async signOut(resolution: SessionResolution): Promise<void> {
    if (resolution.kind === "anonymous") return;
    try {
      await this.dependencies.provider.signOut(resolution.value.accessToken);
    } catch (error) {
      if (!(error instanceof AuthProviderError && error.kind === "invalid")) throw providerUnavailable(error);
    }
    await this.dependencies.store.revokeSession(resolution.value.session.id);
  }

  async saveProfile(value: ResolvedSession, input: SaveStudentProfileInput): Promise<StudentProfile> {
    requireStudent(value.identity);
    return this.dependencies.store.saveStudentProfile(value.identity.user.id, input);
  }
}
