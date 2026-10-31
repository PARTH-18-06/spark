"use client";

import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AppLogo } from "@/components/brand/app-logo";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { studentNavigation } from "@/lib/routes";

function isActive(pathname: string, href: string) {
  return href === "/learn"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function StudentSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r-2 border-line bg-surface/90 px-5 py-6 backdrop-blur lg:flex lg:flex-col">
      <div className="flex items-center justify-between">
        <AppLogo href="/learn" />
        <Badge tone="yellow">Demo</Badge>
      </div>
      <nav className="mt-10 space-y-2" aria-label="Student navigation">
        {studentNavigation.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 items-center gap-3 rounded-2xl border-2 px-4 py-3 text-sm font-extrabold transition-colors",
                active
                  ? "border-[#a8dcd6] bg-[#e8f7f4] text-primary-dark"
                  : "border-transparent text-muted hover:border-line hover:bg-white hover:text-ink",
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto rounded-2xl border border-line bg-[#f5f1e6] p-4">
        <div className="flex items-center gap-2 text-sm font-black">
          <GraduationCap className="size-5 text-primary" aria-hidden="true" />
          Teacher view
        </div>
        <p className="mt-1 text-xs leading-5 text-muted">Separate sample-data workspace.</p>
        <Link
          href="/teacher"
          className="mt-3 inline-flex rounded-lg text-xs font-extrabold text-primary-dark underline decoration-2 underline-offset-4"
        >
          Open teacher demo
        </Link>
      </div>
    </aside>
  );
}

export function StudentMobileHeader() {
  return (
    <header className="flex items-center justify-between border-b-2 border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
      <AppLogo href="/learn" />
      <Badge tone="yellow">Demo</Badge>
    </header>
  );
}

export function StudentMobileNavigation() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t-2 border-line bg-surface/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(11,31,51,0.08)] backdrop-blur lg:hidden"
      aria-label="Student navigation"
    >
      {studentNavigation.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-[0.68rem] font-extrabold",
              active ? "bg-[#e8f7f4] text-primary-dark" : "text-muted",
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
