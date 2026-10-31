import { CircleDashed, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = CircleDashed,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <Card className="flex flex-col items-center px-6 py-10 text-center sm:py-14">
      <span className="grid size-14 place-items-center rounded-2xl border-2 border-line bg-[#f5f1e6] text-primary-dark">
        <Icon className="size-7" aria-hidden="true" />
      </span>
      <h2 className="mt-5 font-display text-xl font-black text-ink">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </Card>
  );
}
