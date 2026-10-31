import type { Metadata } from "next";

import { TeacherDashboardView } from "@/components/teacher/teacher-dashboard";

export const metadata: Metadata = { title: "Teacher workspace" };

export default function TeacherPage() {
  return <TeacherDashboardView />;
}
