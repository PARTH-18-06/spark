import type { ReactNode } from "react";

import { DemoBanner } from "@/components/shell/demo-banner";
import { Access } from "@/components/learning/shared";
import { TeacherNavigation } from "@/components/shell/teacher-navigation";

export default function TeacherLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <TeacherNavigation />
      <DemoBanner compact />
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-9 sm:px-6 sm:py-12">
        <Access teacher>{children}</Access>
      </main>
    </div>
  );
}
