import "server-only";

import type { StudentProfile, User } from "@/contracts/tutor";

export type ProviderFailureKind = "invalid" | "unavailable";

export class AuthProviderError extends Error {
  constructor(readonly kind: ProviderFailureKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AuthProviderError";
  }
}

export interface ProviderTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface AuthProvider {
  signIn(email: string, password: string): Promise<ProviderTokens>;
  verifyUser(accessToken: string): Promise<{ id: string }>;
  refresh(refreshToken: string): Promise<ProviderTokens>;
  signOut(accessToken: string): Promise<void>;
}

export interface StoredSession {
  id: string;
  userId: string;
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string;
  csrfTokenCiphertext: string;
  csrfTokenHash: string;
  expiresAt: Date;
  providerExpiresAt: Date;
}

export interface CreateStoredSession extends StoredSession {
  sessionTokenHash: string;
  csrfTokenHash: string;
}

export interface IdentityRecord {
  user: User;
  studentProfile: StudentProfile | null;
}

export interface AuthStore {
  findSession(sessionTokenHash: string): Promise<StoredSession | null>;
  createSession(session: CreateStoredSession): Promise<void>;
  updateProviderTokens(sessionId: string, access: string, refresh: string, providerExpiresAt: Date): Promise<void>;
  revokeSession(sessionId: string): Promise<void>;
  loadIdentity(userId: string): Promise<IdentityRecord | null>;
  saveStudentProfile(userId: string, input: Omit<StudentProfile, "onboardingComplete">): Promise<StudentProfile>;
  consumeLoginAttempt(keyHash: string): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
  clearLoginAttempts(keyHash: string): Promise<void>;
  teacherHasClass(teacherId: string, classId: string): Promise<boolean>;
  teacherHasStudent(teacherId: string, classId: string, studentId: string): Promise<boolean>;
}

export interface AuthRuntimeConfig {
  allowedOrigins: readonly string[];
  cookieName: string;
  cookieSecure: boolean;
  sessionTtlSeconds: number;
  refreshSkewSeconds: number;
  rateLimitSecret: string;
  trustProxy: boolean;
}

export interface AuthDependencies {
  provider: AuthProvider;
  store: AuthStore;
  config: AuthRuntimeConfig;
  encrypt(value: string): string;
  decrypt(value: string): string;
  now(): Date;
}
