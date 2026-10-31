import type { ReactNode } from "react";

import { DemoBanner } from "@/components/shell/demo-banner";
import { Access } from "@/components/learning/shared";
import {
  StudentMobileHeader,
  StudentMobileNavigation,
  StudentSidebar,
} from "@/components/shell/student-navigation";

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen lg:flex">
      <StudentSidebar />
      <div className="min-w-0 flex-1">
        <StudentMobileHeader />
        <DemoBanner compact />
        <main id="main-content" className="mx-auto max-w-6xl px-4 pb-28 pt-8 sm:px-6 sm:pt-10 lg:px-10 lg:pb-14">
          <Access>{children}</Access>
        </main>
      </div>
      <StudentMobileNavigation />
    </div>
  );
}
