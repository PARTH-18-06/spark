"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, History, Sparkles } from "lucide-react";

import { DateText, Failure } from "@/components/learning/shared";
import { LearningStateBadge } from "@/components/learning/learning-state-badge";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useTutorApi, useTutorRuntime } from "@/lib/tutor-api/context";
import { ELECTRICITY_CONCEPTS, type AttemptHistoryItem, type ProgressResponse, type SessionHistoryItem } from "@/src/contracts/tutor";

const conceptById = new Map(ELECTRICITY_CONCEPTS.map((concept) => [concept.id, concept]));

export function ProgressHistory() {
  const api = useTutorApi();
  const runtime = useTutorRuntime();
  const userId = runtime.auth?.authenticated ? runtime.auth.user.id : "anonymous";
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [sessions, setSessions] = useState<SessionHistoryItem[]>([]);
  const [sessionCursor, setSessionCursor] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<AttemptHistoryItem[]>([]);
  const [attemptCursor, setAttemptCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState<"sessions" | "attempts" | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextProgress, nextAttempts] = await Promise.all([
        api.getProgress({ limit: 5 }),
        api.getAttemptHistory({ limit: 5 }),
      ]);
      setProgress(nextProgress);
      setSessions(nextProgress.sessions.items);
      setSessionCursor(nextProgress.sessions.nextCursor);
      setAttempts(nextAttempts.items);
      setAttemptCursor(nextAttempts.nextCursor);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load, userId]);

  async function moreSessions() {
    if (!sessionCursor) return;
    setLoadingMore("sessions");
    setError(null);
    try {
      const next = await api.getProgress({ cursor: sessionCursor, limit: 5 });
      setSessions((current) => [...current, ...next.sessions.items]);
      setSessionCursor(next.sessions.nextCursor);
    } catch (nextError) { setError(nextError); } finally { setLoadingMore(null); }
  }

  async function moreAttempts() {
    if (!attemptCursor) return;
    setLoadingMore("attempts");
    setError(null);
    try {
      const next = await api.getAttemptHistory({ cursor: attemptCursor, limit: 5 });
      setAttempts((current) => [...current, ...next.items]);
      setAttemptCursor(next.nextCursor);
    } catch (nextError) { setError(nextError); } finally { setLoadingMore(null); }
  }

  if (loading) return <div className="grid gap-4" role="status"><div className="h-24 animate-pulse rounded-[1.75rem] bg-white/70" /><div className="h-96 animate-pulse rounded-[1.75rem] bg-white/70" /><span className="sr-only">Loading progress and history</span></div>;
  if (!progress) return <Failure error={error} retry={() => void load()} />;

  return (
    <div className="space-y-9">
      <PageHeader eyebrow="Learning progress" title="Evidence, not guesswork." description="Mastery estimates, misconceptions, session history, and attempt feedback are displayed exactly as TutorApi returns them." />
      <Failure error={error} />

      <section className="grid gap-5 sm:grid-cols-2" aria-label="Progress principles">
        <Card className="p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-muted">Mastery</p><h2 className="mt-2 font-display text-2xl font-black">Backend estimates</h2></div><BarChart3 className="size-6 text-primary" aria-hidden="true" /></div><p className="mt-3 text-sm leading-6 text-muted">Null is shown as unassessed, never as zero.</p></Card>
        <Card className="p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-muted">Rewards</p><h2 className="mt-2 font-display text-2xl font-black">Rewards disabled</h2></div><Sparkles className="size-6 text-[#9a6a00]" aria-hidden="true" /></div><p className="mt-3 text-sm leading-6 text-muted">Rewards remain disabled in AGREED v1.1.0.</p></Card>
      </section>

      <section aria-labelledby="concept-progress-title">
        <h2 id="concept-progress-title" className="font-display text-2xl font-black">Concept states</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {progress.concepts.map((concept) => (
            <Card key={concept.conceptId} className="p-5 shadow-none">
              <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-extrabold">{conceptById.get(concept.conceptId)?.title ?? concept.conceptId}</h3><LearningStateBadge state={concept.state} /></div>
              <Progress value={concept.mastery === null ? null : concept.mastery * 100} label="Mastery estimate" className="mt-4" />
              <p className="mt-2 text-xs text-muted">{concept.evidenceCount} assessed question{concept.evidenceCount === 1 ? "" : "s"}</p>
              {concept.recentMisconceptions.length ? <ul className="mt-4 space-y-2">{concept.recentMisconceptions.map((item) => <li key={`${item.misconceptionCode}:${item.observedAt}`} className="rounded-xl bg-[#fff5cf] p-3 text-xs"><p className="font-extrabold">{item.label}</p>{item.evidence ? <p className="mt-1 italic text-muted">“{item.evidence}”</p> : null}<p className="mt-1 break-all text-muted">{item.misconceptionCode}</p></li>)}</ul> : null}
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="session-history">
        <h2 id="session-history" className="flex items-center gap-2 font-display text-2xl font-black"><History className="size-5 text-primary" aria-hidden="true" /> Session history</h2>
        {sessions.length ? <div className="mt-4 grid gap-3">{sessions.map((session) => <Card key={session.id} className="flex flex-col gap-3 p-5 shadow-none sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><Badge tone={session.status === "completed" ? "teal" : session.status === "abandoned" ? "neutral" : "yellow"}>{session.status}</Badge><span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">{session.mode}</span></div><p className="mt-2 text-sm text-muted">{session.answeredCount} assessed · <DateText value={session.updatedAt} /></p></div><a href={`/learn/session/${encodeURIComponent(session.id)}`} className="font-extrabold text-primary-dark underline underline-offset-4">View session</a></Card>)}</div> : <p className="mt-3 text-sm text-muted">No session history supplied.</p>}
        {sessionCursor ? <Button variant="secondary" className="mt-4" onClick={() => void moreSessions()} disabled={loadingMore !== null}>{loadingMore === "sessions" ? "Loading…" : "Load more sessions"}</Button> : null}
      </section>

      <section aria-labelledby="attempt-history">
        <h2 id="attempt-history" className="font-display text-2xl font-black">Attempt history</h2>
        {attempts.length ? <div className="mt-4 grid gap-4">{attempts.map((attempt) => <Card key={`${attempt.sessionId}:${attempt.feedback.attemptId}`} className="p-5 shadow-none"><div className="flex flex-wrap items-center gap-2"><Badge tone={attempt.feedback.status === "correct" ? "teal" : attempt.feedback.status === "needs_clarification" ? "navy" : "yellow"}>{attempt.feedback.status.replaceAll("_", " ")}</Badge><span className="text-xs font-bold text-muted">{conceptById.get(attempt.conceptId)?.title ?? attempt.conceptId}</span></div><h3 className="mt-3 font-extrabold leading-6">{attempt.question.prompt}</h3><p className="mt-3 text-sm leading-6 text-muted">{attempt.feedback.feedback}</p><div className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><p><strong>Final answer:</strong> {attempt.feedback.selectedOptionId ? optionText(attempt) : attempt.feedback.finalAnswerText}</p><p><strong>Reasoning:</strong> {attempt.feedback.reasoningText || "Not provided"}</p></div>{attempt.feedback.misconception ? <div className="mt-3 rounded-xl bg-[#fff5cf] p-3 text-xs"><p className="font-extrabold">{attempt.feedback.misconception.label}</p><p className="mt-1 break-all text-muted">{attempt.feedback.misconception.misconceptionCode}</p></div> : null}{attempt.feedback.clarificationOfAttemptId ? <p className="mt-2 text-xs text-muted">Clarification of {attempt.feedback.clarificationOfAttemptId}</p> : null}</Card>)}</div> : <p className="mt-3 text-sm text-muted">No submitted attempts supplied.</p>}
        {attemptCursor ? <Button variant="secondary" className="mt-4" onClick={() => void moreAttempts()} disabled={loadingMore !== null}>{loadingMore === "attempts" ? "Loading…" : "Load more attempts"}</Button> : null}
      </section>
    </div>
  );
}

function optionText(attempt: AttemptHistoryItem) {
  if (attempt.question.format !== "multiple_choice") return attempt.feedback.selectedOptionId;
  return attempt.question.options.find((option) => option.id === attempt.feedback.selectedOptionId)?.text ?? attempt.feedback.selectedOptionId;
}
