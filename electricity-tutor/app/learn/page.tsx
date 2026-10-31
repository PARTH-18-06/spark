import type { Metadata } from "next";

import { StudentDashboard } from "@/components/learning/student-dashboard";

export const metadata: Metadata = { title: "Learn" };

export default function LearnPage() {
  return <StudentDashboard />;
}
