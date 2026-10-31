"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Failure } from "@/components/learning/shared";
import { Button, ButtonLink } from "@/components/ui/button";
import { useTutorRuntime } from "@/lib/tutor-api/context";
import { CHAPTER_ID } from "@/src/contracts/tutor";

const field = "mt-2 min-h-12 w-full rounded-2xl border-2 border-line bg-white px-4 focus:border-primary focus:outline-none";

export function ProfileForm() {
  const router = useRouter();
  const runtime = useTutorRuntime();
  const profile = runtime.auth?.authenticated ? runtime.auth.studentProfile : null;
  const [displayName, setDisplayName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [timeZone, setTimeZone] = useState("UTC");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setDisplayName(profile?.displayName ?? "");
    setExamDate(profile?.examDate ?? "");
    setTimeZone(profile?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC");
  }, [profile]);

  if (runtime.authError) return <Failure error={runtime.authError} retry={() => void runtime.refreshAuth()} />;
  if (!runtime.auth) return <p role="status">Loading your account…</p>;
  if (!runtime.auth.authenticated) return <div className="sm:col-span-2"><p className="text-sm text-muted">Sign in before saving a student profile.</p><ButtonLink href="/sign-in" className="mt-4">Sign in</ButtonLink></div>;
  if (!runtime.auth.user.roles.includes("student")) return <p role="alert" className="sm:col-span-2 rounded-2xl border-2 border-line p-4">This account does not have student profile access.</p>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await runtime.saveProfile({ displayName, chapterId: CHAPTER_ID, examDate: examDate || null, timeZone });
      router.replace("/learn");
    } catch (nextError) {
      setError(nextError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-6 sm:grid-cols-2" aria-describedby="onboarding-note" onSubmit={submit}>
      <div className="sm:col-span-2">
        <label htmlFor="display-name" className="text-sm font-extrabold">Display name</label>
        <input id="display-name" name="displayName" type="text" autoComplete="name" required minLength={1} maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="What should Spark call you?" className={field} />
      </div>
      <div>
        <label htmlFor="exam-date" className="text-sm font-extrabold">Exam date <span className="font-normal text-muted">(optional)</span></label>
        <input id="exam-date" name="examDate" type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} className={field} />
      </div>
      <div>
        <label htmlFor="time-zone" className="text-sm font-extrabold">Time zone</label>
        <input id="time-zone" name="timeZone" type="text" required value={timeZone} onChange={(event) => setTimeZone(event.target.value)} className={field} />
      </div>
      <div className="sm:col-span-2 rounded-2xl border-2 border-line bg-[#f5f1e6] p-4">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-muted">Chapter</p>
        <p className="mt-1 font-extrabold">Class 10 Physics — Electricity</p>
        <p className="mt-1 break-all text-xs text-muted">{CHAPTER_ID}</p>
      </div>
      <p id="onboarding-note" className="sm:col-span-2 text-xs leading-5 text-muted">Student identity comes from the authenticated session; no student ID is sent with this form.</p>
      <Failure error={error} />
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row">
        <Button type="submit" disabled={busy} className="sm:min-w-48">{busy ? "Saving…" : "Save profile"}</Button>
        <ButtonLink href="/learn" variant="secondary">Cancel</ButtonLink>
      </div>
    </form>
  );
}
