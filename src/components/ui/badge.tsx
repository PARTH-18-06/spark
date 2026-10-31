import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "teal" | "yellow" | "navy";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-[0.12em]",
        tone === "neutral" && "border-line bg-[#f4f2e9] text-muted",
        tone === "teal" && "border-[#9bd8d2] bg-[#e7f7f4] text-primary-dark",
        tone === "yellow" && "border-[#efcc74] bg-[#fff3c8] text-[#7a5710]",
        tone === "navy" && "border-ink bg-ink text-white",
        className,
      )}
      {...props}
    />
  );
}
