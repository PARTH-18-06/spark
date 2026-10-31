import { GitBranch } from "lucide-react";

import { ConceptNode } from "@/components/learning/concept-node";
import { ELECTRICITY_CONCEPTS } from "@/src/contracts/tutor";

const conceptTitleById = new Map(
  ELECTRICITY_CONCEPTS.map((concept) => [concept.id, concept.title]),
);

export function ConceptTrail({ compact = false }: { compact?: boolean }) {
  return (
    <section aria-labelledby="concept-trail-title">
      <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[#b9dcd7] bg-[#eaf7f4] p-4 text-sm leading-6 text-[#275b57]">
        <GitBranch className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <h2 id="concept-trail-title" className="font-black text-ink">
            Chapter learning trail
          </h2>
          <p>
            Lines of dependency describe helpful prerequisite relationships. They are not game locks, and every concept remains available for practice.
          </p>
        </div>
      </div>
      <ol className="relative grid gap-5 before:absolute before:bottom-8 before:left-[1.55rem] before:top-8 before:w-0.5 before:bg-[#cad6cf] md:grid-cols-2 md:before:hidden">
        {ELECTRICITY_CONCEPTS.map((concept) => (
          <li key={concept.id} className="relative z-10">
            <ConceptNode
              concept={concept}
              state="unassessed"
              mastery={null}
              compact={compact}
              prerequisiteTitles={concept.prerequisiteIds.map(
                (id) => conceptTitleById.get(id) ?? id,
              )}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
