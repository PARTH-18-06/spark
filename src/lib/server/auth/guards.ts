import "server-only";

import type { IdentityRecord, AuthStore } from "@/lib/server/auth/types";
import { ApiError } from "@/lib/server/http/errors";

export function requireAuthenticated<T>(value: T | null): T {
  if (!value) throw new ApiError({ code: "AUTH_REQUIRED", message: "Authentication is required" });
  return value;
}

export function requireRole(identity: IdentityRecord, role: "student" | "teacher"): void {
  if (!identity.user.roles.includes(role)) {
    throw new ApiError({ code: "FORBIDDEN", message: `${role === "student" ? "Student" : "Teacher"} access is required` });
  }
}

export function requireStudent(identity: IdentityRecord): void { requireRole(identity, "student"); }
export function requireTeacher(identity: IdentityRecord): void { requireRole(identity, "teacher"); }

export function requireCompletedOnboarding(identity: IdentityRecord): void {
  requireStudent(identity);
  if (!identity.studentProfile?.onboardingComplete) {
    throw new ApiError({ code: "ONBOARDING_REQUIRED", message: "Student onboarding must be completed" });
  }
}

export async function requireAssignedClass(store: AuthStore, identity: IdentityRecord, classId: string): Promise<void> {
  requireTeacher(identity);
  if (!await store.teacherHasClass(identity.user.id, classId)) {
    throw new ApiError({ code: "FORBIDDEN", message: "Teacher is not assigned to this class" });
  }
}

export async function requireRosterAccess(store: AuthStore, identity: IdentityRecord, classId: string, studentId: string): Promise<void> {
  requireTeacher(identity);
  if (!await store.teacherHasStudent(identity.user.id, classId, studentId)) {
    throw new ApiError({ code: "FORBIDDEN", message: "Student is not in the assigned class roster" });
  }
}
