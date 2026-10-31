import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClassDashboard, ClassSummary, ProgressResponse, RevisionQueue, StudentDashboard, TeacherStudentDetail } from "@/contracts/tutor";
import { ApiError } from "@/lib/server/http/errors";

export interface StudentReadRepository {
  getStudentDashboard(studentId: string): Promise<StudentDashboard>;
  getRevisionQueue(studentId: string): Promise<RevisionQueue>;
  getProgress(studentId: string, offset: number, limit: number): Promise<ProgressResponse>;
  getAttemptHistory(studentId: string, offset: number, limit: number): Promise<{ items: import("@/contracts/tutor").AttemptHistoryItem[]; nextCursor: string | null }>;
  getClasses(teacherId: string): Promise<ClassSummary[]>;
  getClassDashboard(teacherId: string, classId: string): Promise<ClassDashboard>;
  getStudentDetail(teacherId: string, classId: string, studentId: string): Promise<TeacherStudentDetail>;
}

function mapPersistenceError(message: string): never {
  const known = ["FORBIDDEN", "NOT_FOUND", "ONBOARDING_REQUIRED", "VALIDATION_ERROR"] as const;
  const code = known.find((candidate) => message.includes(candidate));
  if (code) throw new ApiError({ code, message: code === "FORBIDDEN" ? "You do not have access to this resource" : message });
  throw new Error(`Learning read RPC failed: ${message}`);
}

export class SupabaseStudentReadRepository implements StudentReadRepository {
  constructor(private readonly client: SupabaseClient) {}
  private async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const result = await this.client.rpc(name, args);
    if (result.error) mapPersistenceError(result.error.message ?? "Learning read failed");
    return result.data as T;
  }
  getStudentDashboard(studentId: string): Promise<StudentDashboard> { return this.rpc("spark_get_student_dashboard", { p_student_id: studentId }); }
  getRevisionQueue(studentId: string): Promise<RevisionQueue> { return this.rpc("spark_get_revision_queue", { p_student_id: studentId }); }
  getProgress(studentId: string, offset: number, limit: number): Promise<ProgressResponse> { return this.rpc("spark_get_progress", { p_student_id: studentId, p_offset: offset, p_limit: limit }); }
  getAttemptHistory(studentId: string, offset: number, limit: number): Promise<{ items: import("@/contracts/tutor").AttemptHistoryItem[]; nextCursor: string | null }> { return this.rpc("spark_get_attempt_history", { p_student_id: studentId, p_offset: offset, p_limit: limit }); }
  getClasses(teacherId: string): Promise<ClassSummary[]> { return this.rpc("spark_get_teacher_classes", { p_teacher_id: teacherId }); }
  getClassDashboard(teacherId: string, classId: string): Promise<ClassDashboard> { return this.rpc("spark_get_class_dashboard", { p_teacher_id: teacherId, p_class_id: classId }); }
  getStudentDetail(teacherId: string, classId: string, studentId: string): Promise<TeacherStudentDetail> { return this.rpc("spark_get_student_detail", { p_teacher_id: teacherId, p_class_id: classId, p_student_id: studentId }); }
}

