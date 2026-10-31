"use client";

import { ArrowRight, CalendarDays, RotateCcw, Sparkles, UserRound } from "lucide-react";

import { JourneyStart } from "@/components/learning/journey-start";
import { DateText, Failure, Mastery, SessionLink, useLoad } from "@/components/learning/shared";
import { LearningStateBadge } from "@/components/learning/learning-state-badge";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTutorApi, useTutorRuntime } from "@/lib/tutor-api/context";
import { ELECTRICITY_CONCEPTS } from "@/src/contracts/tutor";

const conceptById = new Map(ELECTRICITY_CONCEPTS.map((concept) => [concept.id, concept]));

export function StudentDashboard() {
  const api = useTutorApi();
  const runtime = useTutorRuntime();
  const userId = runtime.auth?.authenticated ? runtime.auth.user.id : "anonymous";
  const { data, error, busy, reload } = useLoad(() => api.getStudentDashboard(), [api, userId]);

  if (busy) return <DashboardLoading />;
  if (!data) return <Failure error={error} retry={reload} />;

  const recommended = data.recommendedConceptId ? conceptById.get(data.recommendedConceptId) : null;
  const isNew = data.recentSessions.length === 0 && data.concepts.every((concept) => concept.mastery === null);

  return (
    <div className="space-y-9">
      <PageHeader
        eyebrow="Student home"
        title={`Ready when you are, ${data.profile.displayName}.`}
        description="Every estimate, recommendation, and review count below comes from the selected TutorApi adapter."
        action={data.activeSession ? <ButtonLink href={`/learn/session/${encodeURIComponent(data.activeSession.id)}`}>Continue session</ButtonLink> : <JourneyStart mode="diagnostic" label="Start diagnostic" />}
      />

      <section className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]" aria-label="Learning overview">
        <Card className="p-6 sm:p-8">
          {data.activeSession ? (
            <>
              <Badge tone="yellow">Active {data.activeSession.mode}</Badge>
              <h2 className="mt-4 font-display text-3xl font-black">Pick up exactly where you stopped.</h2>
              <p className="mt-3 text-sm leading-7 text-muted">{data.activeSession.answeredCount} assessed · updated <DateText value={data.activeSession.updatedAt} /></p>
              <ButtonLink href={`/learn/session/${encodeURIComponent(data.activeSession.id)}`} className="mt-6">Continue active session <ArrowRight className="size-4" aria-hidden="true" /></ButtonLink>
            </>
          ) : recommended ? (
            <>
              <Badge tone="teal">Backend recommendation</Badge>
              <h2 className="mt-4 font-display text-3xl font-black">{recommended.title}</h2>
              <p className="mt-3 text-sm leading-7 text-muted">{recommended.description}</p>
              <JourneyStart mode="practice" conceptId={recommended.id} label="Practise this concept" className="mt-6" />
            </>
          ) : (
            <>
              <Badge tone="teal">Choose your next activity</Badge>
              <h2 className="mt-4 font-display text-3xl font-black">The backend has no single recommendation right now.</h2>
              <ButtonLink href="/learn/concepts" className="mt-6">Explore concepts</ButtonLink>
            </>
          )}
        </Card>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.12em] text-muted">Revision</p><p className="mt-2 text-3xl font-black">{data.dueRevisionCount}</p></div><RotateCcw className="size-7 text-primary" aria-hidden="true" /></div>
            <p className="mt-2 text-sm text-muted">due item{data.dueRevisionCount === 1 ? "" : "s"}</p>
            <ButtonLink href="/learn/revision" variant="ghost" className="mt-3 px-0">Open revision <ArrowRight className="size-4" aria-hidden="true" /></ButtonLink>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-3"><UserRound className="size-5 text-primary" aria-hidden="true" /><h2 className="font-display text-lg font-black">Profile</h2></div>
            <p className="mt-3 font-extrabold">{data.profile.displayName}</p>
            <p className="mt-1 flex items-center gap-2 text-xs text-muted"><CalendarDays className="size-4" aria-hidden="true" /> Exam: {data.profile.examDate ?? "Not set"}</p>
            <p className="mt-1 text-xs text-muted">{data.profile.timeZone}</p>
          </Card>
        </div>
      </section>

      {isNew ? (
        <EmptyState
          icon={Sparkles}
          title="Your chapter is ready for its first evidence"
          description="Nothing is treated as zero. These concepts are unassessed until the backend evaluates an answer."
          action={<JourneyStart mode="diagnostic" label="Start the diagnostic" />}
        />
      ) : null}

      <section aria-labelledby="home-concepts">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[0.14em] text-primary-dark">Mastery estimates</p><h2 id="home-concepts" className="mt-2 font-display text-2xl font-black">All eight concepts</h2></div>
          <ButtonLink href="/learn/concepts" variant="ghost">Open concept map <ArrowRight className="size-4" aria-hidden="true" /></ButtonLink>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {data.concepts.map((progress) => (
            <Card key={progress.conceptId} className="p-5 shadow-none">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-extrabold">{conceptById.get(progress.conceptId)?.title ?? progress.conceptId}</h3>
                <LearningStateBadge state={progress.state} />
              </div>
              <Mastery progress={progress} />
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="recent-sessions">
        <h2 id="recent-sessions" className="font-display text-2xl font-black">Recent sessions</h2>
        {data.recentSessions.length ? (
          <div className="mt-4 grid gap-3">
            {data.recentSessions.map((session) => (
              <Card key={session.id} className="flex flex-col gap-3 p-5 shadow-none sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><Badge tone={session.status === "abandoned" ? "neutral" : session.status === "completed" ? "teal" : "yellow"}>{session.status}</Badge><span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">{session.mode}</span></div>
                  <p className="mt-2 text-sm text-muted">{session.answeredCount} assessed · updated <DateText value={session.updatedAt} /></p>
                </div>
                <SessionLink id={session.id}>{session.status === "active" ? "Continue" : "View saved session"}</SessionLink>
              </Card>
            ))}
          </div>
        ) : <p className="mt-3 text-sm text-muted">No sessions yet.</p>}
      </section>
    </div>
  );
}

function DashboardLoading() {
  return <div className="grid gap-5" role="status"><div className="h-24 animate-pulse rounded-[1.75rem] bg-white/70" /><div className="h-56 animate-pulse rounded-[1.75rem] bg-white/70" /><span className="sr-only">Loading student dashboard</span></div>;
}
