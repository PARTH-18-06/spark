import { ArrowRight, Zap } from "lucide-react";
import Link from "next/link";

import { LearningStateBadge } from "@/components/learning/learning-state-badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type {
  ConceptDefinition,
  ConceptLearningState,
  Mastery,
} from "@/src/contracts/tutor";

export function ConceptNode({
  concept,
  state = "unassessed",
  mastery = null,
  prerequisiteTitles,
  compact = false,
}: {
  concept: ConceptDefinition;
  state?: ConceptLearningState;
  mastery?: Mastery | null;
  prerequisiteTitles: string[];
  compact?: boolean;
}) {
  return (
    <article
      className={cn(
        "group relative rounded-[1.5rem] border-2 border-line bg-surface p-5 shadow-[0_5px_0_0_#d9dfd8] transition-[transform,border-color] hover:-translate-y-0.5 hover:border-primary",
        compact && "p-4",
      )}
    >
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl border-2 border-[#efd078] bg-[#fff2bd] text-[#8a650d]">
          <Zap className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-display text-lg font-black leading-6 text-ink">
              {concept.title}
            </h3>
            <LearningStateBadge state={state} />
          </div>
          <p className="mt-2 text-sm leading-6 text-muted">{concept.description}</p>
          {compact ? null : (
            <>
              <Progress
                value={mastery === null ? null : mastery * 100}
                label="Mastery estimate"
                className="mt-4"
              />
              <p className="mt-4 text-xs leading-5 text-muted">
                <span className="font-extrabold text-ink">Prerequisites:</span>{" "}
                {prerequisiteTitles.length > 0
                  ? prerequisiteTitles.join(", ")
                  : "This concept starts the chapter."}
              </p>
            </>
          )}
          <Link
            href={`/learn/concepts?concept=${encodeURIComponent(concept.id)}`}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg text-sm font-extrabold text-primary-dark underline decoration-2 underline-offset-4"
          >
            Open concept details
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}
