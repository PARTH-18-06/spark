import { ArrowLeft, LayoutDashboard } from "lucide-react";
import Link from "next/link";

import { AppLogo } from "@/components/brand/app-logo";
import { Badge } from "@/components/ui/badge";

export function TeacherNavigation() {
  return (
    <header className="border-b-2 border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <AppLogo href="/teacher" />
        <div className="hidden h-7 w-px bg-line sm:block" />
        <div className="hidden items-center gap-2 text-sm font-extrabold text-muted sm:flex">
          <LayoutDashboard className="size-4" aria-hidden="true" />
          Teacher workspace
        </div>
        <Badge tone="yellow" className="ml-auto">Sample data</Badge>
        <Link
          href="/learn"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-extrabold text-primary-dark hover:bg-[#e8f7f4]"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Student demo</span>
        </Link>
      </div>
    </header>
  );
}
