import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-primary-dark">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-3xl font-black tracking-[-0.04em] text-ink sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted sm:text-base">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
