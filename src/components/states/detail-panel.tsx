import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function DetailPanel({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "rounded-2xl border-2 border-line bg-[#f5f1e6] p-5",
        className,
      )}
      aria-label={title}
    >
      <h3 className="text-sm font-black text-ink">{title}</h3>
      <div className="mt-2 text-sm leading-6 text-muted">{children}</div>
    </aside>
  );
}
