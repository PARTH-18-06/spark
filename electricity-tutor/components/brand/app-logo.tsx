import Link from "next/link";

import { cn } from "@/lib/utils";

export function AppLogo({
  href = "/",
  compact = false,
  className,
}: {
  href?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2.5 rounded-xl", className)}
      aria-label="Spark home"
    >
      <span className="grid size-10 place-items-center rounded-2xl border-2 border-ink bg-highlight shadow-[0_3px_0_0_var(--ink)]">
        <svg viewBox="0 0 28 28" className="size-6" aria-hidden="true">
          <path
            d="M15.8 2.5 6.6 15h6.1l-.8 10.5L21.4 12h-6.2l.6-9.5Z"
            fill="currentColor"
            className="text-primary-dark"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.2"
          />
        </svg>
      </span>
      {compact ? null : (
        <span className="font-display text-2xl font-black tracking-[-0.04em] text-ink">
          Spark<span className="text-primary">.</span>
        </span>
      )}
    </Link>
  );
}
