import { CircleHelp, CircleCheck, TrendingUp, Wrench } from "lucide-react";

import type { ConceptLearningState } from "@/src/contracts/tutor";
import { cn } from "@/lib/utils";

const labels: Record<ConceptLearningState, string> = {
  unassessed: "Not assessed",
  needs_practice: "Needs practice",
  developing: "Developing",
  strong: "Strong",
};

const icons = {
  unassessed: CircleHelp,
  needs_practice: Wrench,
  developing: TrendingUp,
  strong: CircleCheck,
} satisfies Record<ConceptLearningState, typeof CircleHelp>;

export function LearningStateBadge({
  state,
  className,
}: {
  state: ConceptLearningState;
  className?: string;
}) {
  const Icon = icons[state];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-extrabold",
        state === "unassessed" && "border-line bg-[#f4f2e9] text-muted",
        state === "needs_practice" && "border-[#efc4bd] bg-[#fff0ed] text-[#9c3e43]",
        state === "developing" && "border-[#efcc74] bg-[#fff3c8] text-[#7a5710]",
        state === "strong" && "border-[#9bd8d2] bg-[#e7f7f4] text-primary-dark",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {labels[state]}
    </span>
  );
}
