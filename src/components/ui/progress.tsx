import { cn } from "@/lib/utils";

export function Progress({
  value,
  label,
  className,
}: {
  value: number | null;
  label: string;
  className?: string;
}) {
  const safeValue = value === null ? 0 : Math.max(0, Math.min(100, value));

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-3 text-xs font-bold text-muted">
        <span>{label}</span>
        <span>{value === null ? "Not assessed" : `${Math.round(safeValue)}%`}</span>
      </div>
      <div
        className="h-3 overflow-hidden rounded-full border border-line bg-[#e9ece6]"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value === null ? undefined : safeValue}
        aria-valuetext={value === null ? "Not assessed" : `${Math.round(safeValue)} percent`}
      >
        <div
          className={cn(
            "h-full rounded-full bg-primary transition-[width] duration-500",
            value === null && "bg-transparent",
          )}
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}
