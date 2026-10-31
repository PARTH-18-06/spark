"use client";

import { CalendarClock, CheckCircle2, Clock3, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";

import { JourneyStart } from "@/components/learning/journey-start";
import { DateText, Failure, useLoad } from "@/components/learning/shared";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useTutorApi, useTutorRuntime } from "@/lib/tutor-api/context";
import { ELECTRICITY_CONCEPTS, type RevisionItem } from "@/src/contracts/tutor";

const conceptById = new Map(ELECTRICITY_CONCEPTS.map((concept) => [concept.id, concept]));

export function RevisionQueueView() {
  const api = useTutorApi();
  const runtime = useTutorRuntime();
  const userId = runtime.auth?.authenticated ? runtime.auth.user.id : "anonymous";
  const { data, error, busy, reload } = useLoad(() => api.getRevisionQueue(), [api, userId]);
  const [selected, setSelected] = useState<string[]>([]);
  const groups = useMemo(() => ({
    due: data?.items.filter((item) => item.status === "due") ?? [],
    upcoming: data?.items.filter((item) => item.status === "upcoming") ?? [],
    completed: data?.items.filter((item) => item.status === "completed") ?? [],
  }), [data]);

  if (busy) return <div className="grid gap-4" role="status"><div className="h-24 animate-pulse rounded-[1.75rem] bg-white/70" /><div className="h-72 animate-pulse rounded-[1.75rem] bg-white/70" /><span className="sr-only">Loading revision queue</span></div>;
  if (!data) return <Failure error={error} retry={reload} />;

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Revision" title="Review what the backend scheduled." description={`Queue generated ${new Date(data.generatedAt).toLocaleString()}. Spark displays supplied statuses and dates without calculating intervals.`} />

      {groups.due.length ? (
        <section aria-labelledby="due-revision">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><Badge tone="yellow">{groups.due.length} due</Badge><h2 id="due-revision" className="mt-2 font-display text-2xl font-black">Choose due items</h2></div>
            <JourneyStart mode="revision" revisionItemIds={selected} label={`Start selected revision (${selected.length})`} disabled={selected.length === 0} />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {groups.due.map((item) => (
              <label key={item.id} className="cursor-pointer">
                <Card className={`h-full p-5 shadow-none ${selected.includes(item.id) ? "border-primary bg-[#e7f7f4]" : ""}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} className="mt-1 size-4 accent-primary" />
                    <div><h3 className="font-extrabold">{conceptById.get(item.conceptId)?.title ?? item.conceptId}</h3><p className="mt-2 text-sm leading-6 text-muted">{item.reason}</p><p className="mt-2 text-xs font-bold text-[#7a5710]">Due <DateText value={item.dueAt} /></p></div>
                  </div>
                </Card>
              </label>
            ))}
          </div>
        </section>
      ) : (
        <EmptyState icon={RotateCcw} title="Nothing is due" description="The backend has not supplied any due revision items. Upcoming and recently completed items remain visible below." />
      )}

      <RevisionGroup id="upcoming-revision" title="Upcoming" icon={CalendarClock} items={groups.upcoming} />
      <RevisionGroup id="completed-revision" title="Recently completed" icon={CheckCircle2} items={groups.completed} />
    </div>
  );
}

function RevisionGroup({ id, title, icon: Icon, items }: { id: string; title: string; icon: typeof Clock3; items: RevisionItem[] }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="flex items-center gap-2 font-display text-2xl font-black"><Icon className="size-5 text-primary" aria-hidden="true" /> {title}</h2>
      {items.length ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <Card key={item.id} className="p-5 shadow-none">
              <h3 className="font-extrabold">{conceptById.get(item.conceptId)?.title ?? item.conceptId}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{item.reason}</p>
              <p className="mt-2 text-xs text-muted">Scheduled <DateText value={item.dueAt} /></p>
              {item.status === "completed" ? <p className="mt-1 text-xs font-bold text-primary-dark">Completed <DateText value={item.completedAt} /></p> : null}
            </Card>
          ))}
        </div>
      ) : <p className="mt-3 text-sm text-muted">No {title.toLowerCase()} items supplied.</p>}
    </section>
  );
}
