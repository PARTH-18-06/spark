import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SaveStudentProfileInput, StudentProfile } from "@/contracts/tutor";
import type { AuthStore, CreateStoredSession, IdentityRecord, StoredSession } from "@/lib/server/auth/types";

type SessionRow = {
  id: string; user_id: string; csrf_token_hash: string;
  provider_access_token_ciphertext: string; provider_refresh_token_ciphertext: string;
  csrf_token_ciphertext: string; expires_at: string; provider_expires_at: string;
};

const databaseFailure = (operation: string, cause: unknown): Error =>
  new Error(`Auth database operation failed: ${operation}`, { cause });

function mapSession(row: SessionRow): StoredSession {
  return {
    id: row.id,
    userId: row.user_id,
    csrfTokenHash: row.csrf_token_hash,
    accessTokenCiphertext: row.provider_access_token_ciphertext,
    refreshTokenCiphertext: row.provider_refresh_token_ciphertext,
    csrfTokenCiphertext: row.csrf_token_ciphertext,
    expiresAt: new Date(row.expires_at),
    providerExpiresAt: new Date(row.provider_expires_at),
  };
}

export function createSupabaseAuthStore(client: SupabaseClient, rate: {
  maximumAttempts: number; windowSeconds: number; blockSeconds: number;
}): AuthStore {
  return {
    async findSession(sessionTokenHash) {
      const { data, error } = await client.from("backend_auth_sessions").select(
        "id,user_id,csrf_token_hash,provider_access_token_ciphertext,provider_refresh_token_ciphertext,csrf_token_ciphertext,expires_at,provider_expires_at",
      ).eq("session_token_hash", sessionTokenHash).is("revoked_at", null).maybeSingle<SessionRow>();
      if (error) throw databaseFailure("find session", error);
      return data ? mapSession(data) : null;
    },
    async createSession(session: CreateStoredSession) {
      const { error } = await client.from("backend_auth_sessions").insert({
        id: session.id,
        user_id: session.userId,
        session_token_hash: session.sessionTokenHash,
        csrf_token_hash: session.csrfTokenHash,
        provider_access_token_ciphertext: session.accessTokenCiphertext,
        provider_refresh_token_ciphertext: session.refreshTokenCiphertext,
        csrf_token_ciphertext: session.csrfTokenCiphertext,
        expires_at: session.expiresAt.toISOString(),
        provider_expires_at: session.providerExpiresAt.toISOString(),
      });
      if (error) throw databaseFailure("create session", error);
    },
    async updateProviderTokens(sessionId, access, refresh, providerExpiresAt) {
      const { error } = await client.from("backend_auth_sessions").update({
        provider_access_token_ciphertext: access,
        provider_refresh_token_ciphertext: refresh,
        provider_expires_at: providerExpiresAt.toISOString(),
        last_refreshed_at: new Date().toISOString(),
        rotated_at: new Date().toISOString(),
      }).eq("id", sessionId).is("revoked_at", null);
      if (error) throw databaseFailure("update provider tokens", error);
    },
    async revokeSession(sessionId) {
      const { error } = await client.from("backend_auth_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", sessionId);
      if (error) throw databaseFailure("revoke session", error);
    },
    async loadIdentity(userId): Promise<IdentityRecord | null> {
      const [rolesResult, directoryResult, profileResult] = await Promise.all([
        client.from("user_roles").select("role").eq("user_id", userId),
        client.from("user_directory").select("display_name").eq("user_id", userId).maybeSingle<{ display_name: string }>(),
        client.from("student_profiles").select("display_name,chapter_id,exam_date,time_zone,onboarding_complete").eq("user_id", userId).maybeSingle<{
          display_name: string; chapter_id: SaveStudentProfileInput["chapterId"];
          exam_date: string | null; time_zone: string; onboarding_complete: boolean;
        }>(),
      ]);
      if (rolesResult.error || directoryResult.error || profileResult.error) {
        throw databaseFailure("load identity", rolesResult.error ?? directoryResult.error ?? profileResult.error);
      }
      const roles = (rolesResult.data ?? []).map(({ role }) => role as "student" | "teacher");
      const profile = profileResult.data ? {
        displayName: profileResult.data.display_name,
        chapterId: profileResult.data.chapter_id,
        examDate: profileResult.data.exam_date,
        timeZone: profileResult.data.time_zone,
        onboardingComplete: profileResult.data.onboarding_complete,
      } satisfies StudentProfile : null;
      const displayName = directoryResult.data?.display_name ?? profile?.displayName;
      if (!displayName || roles.length === 0) return null;
      return { user: { id: userId, displayName, roles }, studentProfile: profile };
    },
    async saveStudentProfile(userId, input) {
      const { data, error } = await client.rpc("save_student_profile", {
        target_user_id: userId,
        new_display_name: input.displayName,
        new_chapter_id: input.chapterId,
        new_exam_date: input.examDate,
        new_time_zone: input.timeZone,
      });
      if (error || !data) throw databaseFailure("save student profile", error);
      const row = Array.isArray(data) ? data[0] : data;
      return {
        displayName: row.display_name,
        chapterId: row.chapter_id,
        examDate: row.exam_date,
        timeZone: row.time_zone,
        onboardingComplete: row.onboarding_complete,
      } as StudentProfile;
    },
    async consumeLoginAttempt(keyHash) {
      const { data, error } = await client.rpc("consume_auth_login_attempt", {
        login_key_hash: keyHash,
        maximum_attempts: rate.maximumAttempts,
        window_seconds: rate.windowSeconds,
        block_seconds: rate.blockSeconds,
      });
      if (error || !Array.isArray(data) || !data[0]) throw databaseFailure("consume login attempt", error);
      return { allowed: Boolean(data[0].allowed), retryAfterSeconds: Number(data[0].retry_after_seconds) };
    },
    async clearLoginAttempts(keyHash) {
      const { error } = await client.rpc("clear_auth_login_attempt", { login_key_hash: keyHash });
      if (error) throw databaseFailure("clear login attempts", error);
    },
    async teacherHasClass(teacherId, classId) {
      const { count, error } = await client.from("class_teachers").select("class_id", { head: true, count: "exact" }).eq("teacher_user_id", teacherId).eq("class_id", classId);
      if (error) throw databaseFailure("check teacher class", error);
      return (count ?? 0) > 0;
    },
    async teacherHasStudent(teacherId, classId, studentId) {
      const [teacher, student] = await Promise.all([
        client.from("class_teachers").select("class_id", { head: true, count: "exact" }).eq("teacher_user_id", teacherId).eq("class_id", classId),
        client.from("class_students").select("class_id", { head: true, count: "exact" }).eq("student_user_id", studentId).eq("class_id", classId),
      ]);
      if (teacher.error || student.error) throw databaseFailure("check teacher roster", teacher.error ?? student.error);
      return (teacher.count ?? 0) > 0 && (student.count ?? 0) > 0;
    },
  };
}
