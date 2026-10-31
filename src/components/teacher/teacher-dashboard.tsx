"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpenCheck, School, UsersRound, X } from "lucide-react";

import { DateText, Failure } from "@/components/learning/shared";
import { LearningStateBadge } from "@/components/learning/learning-state-badge";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTutorApi, useTutorRuntime } from "@/lib/tutor-api/context";
import { ELECTRICITY_CONCEPTS, type ClassDashboard, type ClassSummary, type TeacherStudentDetail } from "@/src/contracts/tutor";

const conceptById = new Map(ELECTRICITY_CONCEPTS.map((concept) => [concept.id, concept]));

export function TeacherDashboardView() {
  const api = useTutorApi();
  const runtime = useTutorRuntime();
  const userId = runtime.auth?.authenticated ? runtime.auth.user.id : "anonymous";
  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [dashboard, setDashboard] = useState<ClassDashboard | null>(null);
  const [detail, setDetail] = useState<TeacherStudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setClasses(null);
    setDashboard(null);
    setDetail(null);
    api.getClasses().then((items) => {
      if (!active) return;
      setClasses(items);
      setSelectedClassId(items[0]?.id ?? "");
    }).catch((nextError) => { if (active) setError(nextError); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, userId]);

  useEffect(() => {
    if (!selectedClassId) { setDashboard(null); setDetail(null); return; }
    let active = true;
    setLoading(true);
    setError(null);
    setDashboard(null);
    setDetail(null);
    api.getClassDashboard(selectedClassId).then((value) => { if (active) setDashboard(value); }).catch((nextError) => { if (active) setError(nextError); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, selectedClassId, userId]);

  async function selectStudent(studentId: string) {
    setDetail(null);
    setDetailLoading(true);
    setError(null);
    try {
      const next = await api.getStudentDetail(selectedClassId, studentId);
      setDetail(next);
      requestAnimationFrame(() => detailHeading.current?.focus());
    } catch (nextError) {
      setError(nextError);
    } finally {
      setDetailLoading(false);
    }
  }

  if (loading && !classes) return <TeacherLoading />;
  if (!classes) return <Failure error={error} />;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Teacher workspace" title="Class patterns, with permission." description="Every row, aggregate, and priority below comes from authorized teacher endpoints." action={<Badge tone="yellow">{runtime.mode === "mock" ? "Seeded sample class" : "Authorized data"}</Badge>} />
      <Failure error={error} />

      {classes.length === 0 ? <EmptyState icon={School} title="No assigned classes" description="The backend returned an empty authorized class list for this teacher." /> : (
        <>
          <Card className="p-5">
            <label htmlFor="class-selector" className="text-sm font-extrabold">Class</label>
            <select id="class-selector" value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)} className="mt-2 min-h-12 w-full max-w-md rounded-2xl border-2 border-line bg-white px-4 focus:border-primary focus:outline-none">
              {classes.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.studentCount} students</option>)}
            </select>
          </Card>

          {loading || !dashboard ? <TeacherLoading /> : (
            <>
              <section aria-labelledby="class-mastery">
                <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-primary-dark">{dashboard.class.name}</p><h2 id="class-mastery" className="mt-2 font-display text-2xl font-black">Student-by-concept mastery</h2></div><p className="text-xs text-muted">Generated <DateText value={dashboard.generatedAt} /></p></div>
                {dashboard.students.length ? (
                  <div className="mt-4 overflow-x-auto rounded-[1.5rem] border-2 border-line bg-surface">
                    <table className="min-w-[72rem] border-collapse text-left text-xs">
                      <thead><tr className="border-b-2 border-line bg-[#f5f1e6]"><th className="sticky left-0 z-10 bg-[#f5f1e6] p-3 text-sm">Student</th>{ELECTRICITY_CONCEPTS.map((concept) => <th key={concept.id} className="p-3 font-extrabold">{concept.title}</th>)}</tr></thead>
                      <tbody>{dashboard.students.map((student) => <tr key={student.id} className="border-b border-line last:border-0"><th className="sticky left-0 z-10 bg-surface p-3"><button className="font-extrabold text-primary-dark underline underline-offset-4" onClick={() => void selectStudent(student.id)}>{student.displayName}</button><span className="mt-1 block font-normal text-muted">{student.dueRevisionCount} due</span></th>{ELECTRICITY_CONCEPTS.map((concept) => { const progress = student.concepts.find((item) => item.conceptId === concept.id)!; return <td key={concept.id} className="p-3"><span className="block font-black">{progress.mastery === null ? "Unassessed" : `${Math.round(progress.mastery * 100)}%`}</span><span className="mt-1 block text-muted">{progress.state.replaceAll("_", " ")}</span></td>; })}</tr>)}</tbody>
                    </table>
                  </div>
                ) : <EmptyState icon={UsersRound} title="No students in this class" description="The authorized class dashboard returned an empty roster." />}
              </section>

              <section className="grid gap-5 lg:grid-cols-2" aria-label="Class patterns">
                <Card className="p-6"><div className="flex items-center gap-2"><BookOpenCheck className="size-5 text-primary" aria-hidden="true" /><h2 className="font-display text-xl font-black">Common misconceptions</h2></div>{dashboard.commonMisconceptions.length ? <ul className="mt-4 space-y-3">{dashboard.commonMisconceptions.map((item) => <li key={`${item.conceptId}:${item.misconceptionCode}`} className="rounded-2xl bg-[#fff5cf] p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-extrabold">{item.label}</p><p className="mt-1 text-xs text-muted">{conceptById.get(item.conceptId)?.title ?? item.conceptId}</p><p className="mt-1 break-all text-[0.68rem] text-muted">{item.misconceptionCode}</p></div><Badge tone="yellow">{item.affectedStudentCount} students</Badge></div></li>)}</ul> : <p className="mt-3 text-sm text-muted">No aggregate misconceptions supplied.</p>}</Card>
                <Card className="p-6"><div className="flex items-center gap-2"><School className="size-5 text-primary" aria-hidden="true" /><h2 className="font-display text-xl font-black">Revision priorities</h2></div>{dashboard.revisionPriorities.length ? <ul className="mt-4 space-y-3">{dashboard.revisionPriorities.map((item) => <li key={item.conceptId} className="rounded-2xl border-2 border-line p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-extrabold">{conceptById.get(item.conceptId)?.title ?? item.conceptId}</p><p className="mt-1 text-sm text-muted">{item.reason}</p></div><Badge tone="teal">{item.affectedStudentCount}</Badge></div></li>)}</ul> : <p className="mt-3 text-sm text-muted">No class revision priorities supplied.</p>}</Card>
              </section>
            </>
          )}
        </>
      )}

      {detailLoading ? <p role="status" className="text-sm font-bold">Loading student detail…</p> : null}
      {detail ? <StudentDetail detail={detail} headingRef={detailHeading} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}

function StudentDetail({ detail, headingRef, onClose }: { detail: TeacherStudentDetail; headingRef: React.RefObject<HTMLHeadingElement | null>; onClose: () => void }) {
  return (
    <section className="rounded-[1.75rem] border-2 border-primary bg-surface p-6 shadow-card" aria-labelledby="student-detail-title">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-primary-dark">Student detail</p><h2 id="student-detail-title" ref={headingRef} tabIndex={-1} className="mt-2 font-display text-2xl font-black outline-none">{detail.student.displayName}</h2></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="Close student detail"><X className="size-5" aria-hidden="true" /></Button></div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">{detail.student.concepts.map((progress) => <Card key={progress.conceptId} className="p-4 shadow-none"><h3 className="text-sm font-extrabold">{conceptById.get(progress.conceptId)?.title ?? progress.conceptId}</h3><p className="mt-2 text-xl font-black">{progress.mastery === null ? "Unassessed" : `${Math.round(progress.mastery * 100)}%`}</p><LearningStateBadge state={progress.state} /></Card>)}</div>
      <div className="mt-7 grid gap-6 lg:grid-cols-2">
        <div><h3 className="font-display text-lg font-black">Recent sessions</h3>{detail.recentSessions.length ? <ul className="mt-3 space-y-2">{detail.recentSessions.map((session) => <li key={session.id} className="rounded-2xl border-2 border-line p-3 text-sm"><div className="flex items-center gap-2"><Badge tone={session.status === "completed" ? "teal" : session.status === "abandoned" ? "neutral" : "yellow"}>{session.status}</Badge><strong>{session.mode}</strong></div><p className="mt-2 text-xs text-muted">{session.answeredCount} assessed · <DateText value={session.updatedAt} /></p></li>)}</ul> : <p className="mt-2 text-sm text-muted">No recent sessions.</p>}</div>
        <div><h3 className="font-display text-lg font-black">Recent attempts</h3>{detail.recentAttempts.length ? <ul className="mt-3 space-y-3">{detail.recentAttempts.map((attempt) => <li key={`${attempt.sessionId}:${attempt.feedback.attemptId}`} className="rounded-2xl border-2 border-line p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><Badge tone={attempt.feedback.status === "correct" ? "teal" : attempt.feedback.status === "needs_clarification" ? "navy" : "yellow"}>{attempt.feedback.status.replaceAll("_", " ")}</Badge><span className="text-xs text-muted">{conceptById.get(attempt.conceptId)?.title ?? attempt.conceptId}</span></div><p className="mt-2 font-bold">{attempt.question.prompt}</p><p className="mt-2 text-xs leading-5 text-muted">{attempt.feedback.feedback}</p>{attempt.feedback.misconception ? <p className="mt-2 rounded-xl bg-[#fff5cf] p-2 text-xs"><strong>{attempt.feedback.misconception.label}</strong><span className="mt-1 block break-all text-muted">{attempt.feedback.misconception.misconceptionCode}</span></p> : null}</li>)}</ul> : <p className="mt-2 text-sm text-muted">No recent attempts.</p>}</div>
      </div>
    </section>
  );
}

function TeacherLoading() {
  return <div className="grid gap-4" role="status"><div className="h-20 animate-pulse rounded-[1.75rem] bg-white/70" /><div className="h-72 animate-pulse rounded-[1.75rem] bg-white/70" /><span className="sr-only">Loading teacher dashboard</span></div>;
}
