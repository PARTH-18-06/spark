"use client";

import { GitBranch, RotateCcw, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { JourneyStart } from "@/components/learning/journey-start";
import { DateText, Failure, useLoad } from "@/components/learning/shared";
import { LearningStateBadge } from "@/components/learning/learning-state-badge";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useTutorApi, useTutorRuntime } from "@/lib/tutor-api/context";
import type { ConceptId } from "@/src/contracts/tutor";

export function ConceptMap() {
  const api = useTutorApi();
  const runtime = useTutorRuntime();
  const userId = runtime.auth?.authenticated ? runtime.auth.user.id : "anonymous";
  const { data, error, busy, reload } = useLoad(() => api.getConcepts(), [api, userId]);
  const [selectedId, setSelectedId] = useState<ConceptId | null>(null);

  useEffect(() => {
    if (data && !selectedId) setSelectedId(data.concepts[0]?.id ?? null);
  }, [data, selectedId]);

  const progressById = useMemo(() => new Map(data?.progress.map((progress) => [progress.conceptId, progress]) ?? []), [data]);
  const titleById = useMemo(() => new Map(data?.concepts.map((concept) => [concept.id, concept.title]) ?? []), [data]);

  if (busy) return <div className="grid gap-4" role="status"><div className="h-24 animate-pulse rounded-[1.75rem] bg-white/70" /><div className="h-80 animate-pulse rounded-[1.75rem] bg-white/70" /><span className="sr-only">Loading concept map</span></div>;
  if (!data) return <Failure error={error} retry={reload} />;

  const selected = data.concepts.find((concept) => concept.id === selectedId) ?? null;
  const selectedProgress = selected ? progressById.get(selected.id) : null;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Class 10 Electricity" title="See how the ideas connect." description="Prerequisites describe helpful learning relationships. They never lock a concept or prevent practice." />
      <div className="flex items-start gap-3 rounded-2xl border border-[#b9dcd7] bg-[#eaf7f4] p-4 text-sm leading-6 text-[#275b57]">
        <GitBranch className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p><strong className="text-ink">Chapter graph:</strong> all states, mastery estimates, evidence counts, and review dates below come from TutorApi.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ol className="grid gap-4 md:grid-cols-2">
          {data.concepts.map((concept) => {
            const progress = progressById.get(concept.id)!;
            return (
              <li key={concept.id}>
                <Card className={`h-full p-5 shadow-none ${selectedId === concept.id ? "border-primary" : ""}`}>
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#fff2bd] text-[#8a650d]"><Zap className="size-5" aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="font-display text-lg font-black">{concept.title}</h2><LearningStateBadge state={progress.state} /></div>
                      <p className="mt-2 text-sm leading-6 text-muted">{concept.description}</p>
                    </div>
                  </div>
                  <Progress value={progress.mastery === null ? null : progress.mastery * 100} label="Mastery estimate" className="mt-4" />
                  <p className="mt-2 text-xs text-muted">{progress.evidenceCount} assessed question{progress.evidenceCount === 1 ? "" : "s"}</p>
                  <p className="mt-3 text-xs leading-5 text-muted"><strong className="text-ink">Prerequisites:</strong> {concept.prerequisiteIds.length ? concept.prerequisiteIds.map((id) => titleById.get(id) ?? id).join(", ") : "Chapter starting point"}</p>
                  <Button variant="ghost" size="sm" className="mt-3 px-0" aria-pressed={selectedId === concept.id} onClick={() => setSelectedId(concept.id)}>View details</Button>
                </Card>
              </li>
            );
          })}
        </ol>

        <aside className="lg:sticky lg:top-6 lg:self-start" aria-live="polite">
          {selected && selectedProgress ? (
            <Card className="p-6">
              <LearningStateBadge state={selectedProgress.state} />
              <h2 className="mt-4 font-display text-2xl font-black">{selected.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{selected.description}</p>
              <div className="mt-5 space-y-3 border-t border-line pt-4 text-sm">
                <p><strong>Last assessed:</strong> <DateText value={selectedProgress.lastAssessedAt} /></p>
                <p><strong>Next review:</strong> <DateText value={selectedProgress.nextReviewAt} /></p>
                <p><strong>Evidence:</strong> {selectedProgress.evidenceCount} assessed question{selectedProgress.evidenceCount === 1 ? "" : "s"}</p>
              </div>
              <div className="mt-5">
                <h3 className="text-sm font-black">Recent misconceptions</h3>
                {selectedProgress.recentMisconceptions.length ? (
                  <ul className="mt-3 space-y-3">
                    {selectedProgress.recentMisconceptions.map((item) => (
                      <li key={`${item.misconceptionCode}:${item.observedAt}`} className="rounded-2xl bg-[#fff5cf] p-3 text-sm">
                        <p className="font-extrabold">{item.label}</p>
                        {item.evidence ? <p className="mt-1 italic text-muted">“{item.evidence}”</p> : null}
                        <p className="mt-1 break-all text-[0.68rem] text-muted">{item.misconceptionCode}</p>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-2 text-sm text-muted">No recent misconception supplied.</p>}
              </div>
              <JourneyStart mode="practice" conceptId={selected.id} label="Start practice" className="mt-6" />
              {selectedProgress.nextReviewAt ? <p className="mt-3 flex gap-2 text-xs text-muted"><RotateCcw className="size-4 shrink-0" aria-hidden="true" /> Scheduling remains backend-owned.</p> : null}
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
