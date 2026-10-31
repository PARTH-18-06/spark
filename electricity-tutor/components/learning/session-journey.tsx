"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  Lightbulb,
  RotateCcw,
  Square,
} from "lucide-react";

import { SparkMascot } from "@/components/brand/spark-mascot";
import { DateText, Failure, Mastery, field } from "@/components/learning/shared";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useTutorApi, useTutorRuntime } from "@/lib/tutor-api/context";
import { clearDraft, clearSessionDrafts, readDraft, saveDraft } from "@/lib/tutor-api/drafts";
import { newKey } from "@/lib/tutor-api/pending";
import {
  ELECTRICITY_CONCEPTS,
  type AttemptFeedback,
  type ConceptId,
  type Question,
  type SessionSnapshot,
  type SubmitAttemptInput,
} from "@/src/contracts/tutor";

const conceptById = new Map(ELECTRICITY_CONCEPTS.map((concept) => [concept.id, concept]));
const statusCopy = {
  correct: { label: "Correct", tone: "teal" as const, title: "That reasoning landed." },
  partial: { label: "Partly there", tone: "yellow" as const, title: "You have the core idea—tighten the explanation." },
  incorrect: { label: "Needs another look", tone: "yellow" as const, title: "Useful attempt. Let’s inspect what changed." },
  needs_clarification: { label: "Clarify", tone: "navy" as const, title: "One more detail will make your thinking clear." },
};

export function SessionJourney({ sessionId }: { sessionId: string }) {
  const api = useTutorApi();
  const runtime = useTutorRuntime();
  const router = useRouter();
  const userId = runtime.auth?.authenticated ? runtime.auth.user.id : null;
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"submit" | "advance" | "end" | "retry" | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [finalAnswerText, setFinalAnswerText] = useState("");
  const [reasoningText, setReasoningText] = useState("");
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [hintVisible, setHintVisible] = useState(false);
  const locked = useRef(false);
  const questionHeading = useRef<HTMLHeadingElement>(null);
  const errorRegion = useRef<HTMLDivElement>(null);
  const previousQuestionId = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSession(await api.getSession(sessionId));
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [api, sessionId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const question = session?.currentQuestion;
    if (!question || !userId) return;
    const stored = readDraft(userId, session.id, question.id);
    const clarification = session.phase === "clarification" ? session.lastAttempt : null;
    setFinalAnswerText(stored?.finalAnswerText ?? clarification?.finalAnswerText ?? "");
    setReasoningText(stored?.reasoningText ?? clarification?.reasoningText ?? "");
    setSelectedOptionId(stored?.selectedOptionId ?? clarification?.selectedOptionId ?? null);
    setValidationError(null);
    setHintVisible(false);
    if (previousQuestionId.current !== question.id) {
      previousQuestionId.current = question.id;
      requestAnimationFrame(() => questionHeading.current?.focus());
    }
  }, [session?.currentQuestion?.id, session?.phase, session?.id, userId]);

  function persistDraft(next: { finalAnswerText?: string; reasoningText?: string; selectedOptionId?: string | null }) {
    if (!userId || !session?.currentQuestion) return;
    saveDraft(userId, session.id, session.currentQuestion.id, {
      finalAnswerText: next.finalAnswerText ?? finalAnswerText,
      reasoningText: next.reasoningText ?? reasoningText,
      selectedOptionId: next.selectedOptionId === undefined ? selectedOptionId : next.selectedOptionId,
    });
  }

  function focusError(message: string) {
    setValidationError(message);
    requestAnimationFrame(() => errorRegion.current?.focus());
  }

  async function submit() {
    const question = session?.currentQuestion;
    if (!session || !question || locked.current || runtime.pending) return;
    if (question.format === "multiple_choice" && !selectedOptionId) {
      focusError("Choose one answer before submitting.");
      return;
    }
    if (question.format === "free_response" && !finalAnswerText.trim()) {
      focusError("Enter a final answer before submitting.");
      return;
    }
    locked.current = true;
    setBusy("submit");
    setError(null);
    setValidationError(null);
    persistDraft({});
    const input: SubmitAttemptInput = {
      sessionId: session.id,
      questionId: question.id,
      expectedSessionVersion: session.version,
      finalAnswerText: question.format === "multiple_choice" ? "" : finalAnswerText,
      reasoningText,
      ...(question.format === "multiple_choice" ? { selectedOptionId: selectedOptionId! } : {}),
      ...(session.phase === "clarification" && session.lastAttempt
        ? { clarificationOfAttemptId: session.lastAttempt.attemptId }
        : {}),
      idempotencyKey: newKey(),
    };
    try {
      const result = await runtime.submitAttempt(input);
      setSession(result.session);
    } catch (nextError) {
      setError(nextError);
      requestAnimationFrame(() => errorRegion.current?.focus());
    } finally {
      locked.current = false;
      setBusy(null);
    }
  }

  async function advance() {
    if (!session || locked.current || runtime.pending) return;
    locked.current = true;
    setBusy("advance");
    setError(null);
    const previousQuestion = session.currentQuestion?.id ?? null;
    try {
      const next = await runtime.advanceSession({
        sessionId: session.id,
        expectedSessionVersion: session.version,
        idempotencyKey: newKey(),
      });
      if (userId && previousQuestion) clearDraft(userId, session.id, previousQuestion);
      if (userId && next.status !== "active") clearSessionDrafts(userId, session.id);
      setSession(next);
    } catch (nextError) {
      setError(nextError);
      requestAnimationFrame(() => errorRegion.current?.focus());
    } finally {
      locked.current = false;
      setBusy(null);
    }
  }

  async function end() {
    if (!session || locked.current || runtime.pending) return;
    locked.current = true;
    setBusy("end");
    setError(null);
    try {
      const ended = await runtime.endSession({
        sessionId: session.id,
        expectedSessionVersion: session.version,
        idempotencyKey: newKey(),
      });
      if (userId) clearSessionDrafts(userId, session.id);
      setSession(ended);
    } catch (nextError) {
      setError(nextError);
      requestAnimationFrame(() => errorRegion.current?.focus());
    } finally {
      locked.current = false;
      setBusy(null);
    }
  }

  async function retryPending() {
    if (!runtime.pending || locked.current) return;
    const operation = runtime.pending.operation;
    const previousQuestion = session?.currentQuestion?.id ?? null;
    locked.current = true;
    setBusy("retry");
    setError(null);
    try {
      const result = await runtime.retryPendingMutation();
      const next = "session" in result ? result.session : result;
      if (next.id !== sessionId) {
        router.replace(`/learn/session/${encodeURIComponent(next.id)}`);
        return;
      }
      if (userId && operation === "advance" && previousQuestion) clearDraft(userId, next.id, previousQuestion);
      if (userId && next.status !== "active") clearSessionDrafts(userId, next.id);
      setSession(next);
    } catch (nextError) {
      setError(nextError);
      requestAnimationFrame(() => errorRegion.current?.focus());
    } finally {
      locked.current = false;
      setBusy(null);
    }
  }

  if (loading) return <SessionLoading />;
  if (!session) return <Failure error={error} retry={() => void load()} />;

  if (session.status === "completed" && session.summary) {
    return <CompletionView session={session} />;
  }
  if (session.status === "abandoned") {
    return <AbandonedView session={session} />;
  }

  const question = session.currentQuestion!;
  const progressValue = session.progress.targetQuestionCount === null
    ? null
    : (session.progress.answeredCount / Math.max(1, session.progress.targetQuestionCount)) * 100;
  const pendingForSession = runtime.pending && "sessionId" in runtime.pending.input
    ? runtime.pending.input.sessionId === session.id
    : runtime.pending?.operation === "start";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/learn" className="inline-flex min-h-10 items-center gap-2 rounded-xl text-sm font-extrabold text-primary-dark underline decoration-2 underline-offset-4">
          <ArrowLeft className="size-4" aria-hidden="true" /> Back to learn
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="teal">{session.mode}</Badge>
          <Badge>{session.phase}</Badge>
        </div>
      </div>

      {pendingForSession ? (
        <Card className="border-[#e6c466] bg-[#fff5cf] p-4" role="status">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-extrabold text-[#6d5214]">A {runtime.pending?.operation} request has an unresolved outcome.</p>
              <p className="mt-1 text-sm leading-6 text-[#6d5214]">Your exact payload and request identity are preserved. Resolve it before another session action.</p>
            </div>
            <Button variant="secondary" onClick={() => void retryPending()} disabled={busy !== null}>
              <RotateCcw className="size-4" aria-hidden="true" /> {busy === "retry" ? "Retrying…" : "Retry exact request"}
            </Button>
          </div>
        </Card>
      ) : null}

      <div ref={errorRegion} tabIndex={-1} className="focus:outline-none">
        {validationError ? <div className="rounded-2xl border-2 border-danger bg-red-50 p-4 text-sm" role="alert">{validationError}</div> : null}
        <Failure error={error} retry={runtime.pending ? () => void retryPending() : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-6">
          <QuestionCard question={question} headingRef={questionHeading} hintVisible={hintVisible} onToggleHint={() => setHintVisible((value) => !value)} />

          {session.phase === "feedback" && session.lastAttempt ? (
            <FeedbackPanel feedback={session.lastAttempt} />
          ) : (
            <AnswerForm
              question={question}
              clarification={session.phase === "clarification" ? session.lastAttempt : null}
              finalAnswerText={finalAnswerText}
              reasoningText={reasoningText}
              selectedOptionId={selectedOptionId}
              disabled={busy !== null || !!runtime.pending}
              onFinalAnswer={(value) => { setFinalAnswerText(value); persistDraft({ finalAnswerText: value }); }}
              onReasoning={(value) => { setReasoningText(value); persistDraft({ reasoningText: value }); }}
              onSelect={(value) => { setSelectedOptionId(value); persistDraft({ finalAnswerText: "", selectedOptionId: value }); }}
              onSubmit={() => void submit()}
              busy={busy === "submit"}
            />
          )}

          {session.phase === "feedback" ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted">Feedback is saved. Refreshing this page will not submit again.</p>
              <Button onClick={() => void advance()} disabled={busy !== null || !!runtime.pending}>
                {busy === "advance" ? "Continuing…" : "Continue"} <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ) : null}
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-muted">Session progress</p>
            <p className="mt-2 text-lg font-black">{session.progress.answeredCount} assessed</p>
            {session.progress.targetQuestionCount === null ? (
              <p className="mt-3 rounded-xl bg-[#f5f1e6] p-3 text-xs leading-5 text-muted">Adaptive length · the backend has not supplied a fixed target.</p>
            ) : (
              <Progress value={progressValue} label={`${session.progress.answeredCount} of ${session.progress.targetQuestionCount}`} className="mt-4" />
            )}
          </Card>
          <Card className="p-5">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-muted">Session controls</p>
            <p className="mt-2 text-sm leading-6 text-muted">Leaving this page does not end the session. Use the action below only when you want to stop.</p>
            <Dialog
              trigger={<Button variant="ghost" className="mt-3 w-full text-danger"><Square className="size-4" aria-hidden="true" /> End session</Button>}
              title="End this session?"
              description="Previously graded progress stays saved. This session will be abandoned, not completed."
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={() => void end()} disabled={busy !== null || !!runtime.pending}>
                  {busy === "end" ? "Ending…" : "End session"}
                </Button>
              </div>
            </Dialog>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function QuestionCard({ question, headingRef, hintVisible, onToggleHint }: { question: Question; headingRef: React.RefObject<HTMLHeadingElement | null>; hintVisible: boolean; onToggleHint: () => void }) {
  const concept = conceptById.get(question.conceptId);
  return (
    <Card className="p-6 sm:p-8">
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-primary-dark">{concept?.title ?? question.conceptId} · {question.difficulty}</p>
          <h1 ref={headingRef} tabIndex={-1} className="mt-4 font-display text-2xl font-black leading-9 outline-none sm:text-3xl">{question.prompt}</h1>
          {question.expectedUnit ? <p className="mt-3 text-sm font-bold text-muted">Use unit: <span className="equation text-ink">{question.expectedUnit}</span></p> : null}
        </div>
        <SparkMascot state="thinking" className="hidden w-28 shrink-0 sm:block" decorative />
      </div>
      {question.hint ? (
        <div className="mt-6">
          <Button type="button" variant="secondary" size="sm" aria-expanded={hintVisible} onClick={onToggleHint}>
            <Lightbulb className="size-4" aria-hidden="true" /> {hintVisible ? "Hide hint" : "Reveal hint"}
          </Button>
          {hintVisible ? <div className="mt-3 rounded-2xl border-2 border-line bg-[#f5f1e6] p-4 text-sm leading-6 text-muted">{question.hint}</div> : null}
        </div>
      ) : null}
    </Card>
  );
}

function AnswerForm({ question, clarification, finalAnswerText, reasoningText, selectedOptionId, disabled, busy, onFinalAnswer, onReasoning, onSelect, onSubmit }: {
  question: Question;
  clarification: AttemptFeedback | null;
  finalAnswerText: string;
  reasoningText: string;
  selectedOptionId: string | null;
  disabled: boolean;
  busy: boolean;
  onFinalAnswer: (value: string) => void;
  onReasoning: (value: string) => void;
  onSelect: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Card className="p-6 sm:p-8">
      {clarification ? (
        <div className="mb-6 rounded-2xl border-2 border-[#9bd8d2] bg-[#e7f7f4] p-4" role="status">
          <div className="flex gap-3">
            <CircleHelp className="mt-0.5 size-5 shrink-0 text-primary-dark" aria-hidden="true" />
            <div>
              <p className="font-black">Clarification requested</p>
              <p className="mt-1 text-sm leading-6">{clarification.clarificationPrompt}</p>
              <p className="mt-2 text-xs text-muted">Your new response will reference attempt {clarification.attemptId}.</p>
            </div>
          </div>
        </div>
      ) : null}

      {question.format === "multiple_choice" ? (
        <fieldset disabled={disabled}>
          <legend className="text-sm font-extrabold">Final answer</legend>
          <div className="mt-3 grid gap-3">
            {question.options.map((option) => (
              <label key={option.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border-2 border-line bg-white px-4 py-3 has-[:checked]:border-primary has-[:checked]:bg-[#e7f7f4]">
                <input type="radio" name="selected-option" value={option.id} checked={selectedOptionId === option.id} onChange={() => onSelect(option.id)} className="size-4 accent-primary" />
                <span className="font-bold">{option.text}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <div>
          <label htmlFor="final-answer" className="text-sm font-extrabold">Final answer</label>
          <textarea id="final-answer" rows={2} maxLength={2000} disabled={disabled} value={finalAnswerText} onChange={(event) => onFinalAnswer(event.target.value)} className={field} placeholder="State your final answer with units where needed." />
        </div>
      )}

      <div className="mt-6">
        <label htmlFor="reasoning" className="text-sm font-extrabold">Explain your thinking</label>
        <p id="wispr-instruction" className="mt-2 text-sm leading-6 text-primary-dark">Click the answer box, activate Wispr Flow, and explain your thinking.</p>
        <textarea id="reasoning" rows={5} maxLength={8000} disabled={disabled} value={reasoningText} onChange={(event) => onReasoning(event.target.value)} aria-describedby="wispr-instruction" className={field} placeholder="Show the equation, substitution, and why the relationship makes sense." />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-muted">Review both fields before submitting. The backend grades the confirmed text.</p>
        <Button type="button" onClick={onSubmit} disabled={disabled}>
          {busy ? "Checking…" : clarification ? "Submit clarification" : "Submit for feedback"}
        </Button>
      </div>
    </Card>
  );
}

function FeedbackPanel({ feedback }: { feedback: AttemptFeedback }) {
  const copy = statusCopy[feedback.status];
  return (
    <Card className="p-6 sm:p-8" aria-live="polite">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Badge tone={copy.tone}>{copy.label}</Badge>
          <h2 className="mt-4 font-display text-2xl font-black">{copy.title}</h2>
          <p className="mt-3 text-sm leading-7 text-muted">{feedback.feedback}</p>
        </div>
        <SparkMascot state={feedback.status === "correct" ? "encouraging" : "thinking"} className="w-28 shrink-0 self-center" decorative />
      </div>
      {feedback.misconception ? (
        <div className="mt-6 rounded-2xl border-2 border-[#efcc74] bg-[#fff5cf] p-4">
          <p className="font-black text-[#6d5214]">{feedback.misconception.label}</p>
          {feedback.misconception.evidence ? <blockquote className="mt-2 border-l-4 border-[#d49b14] pl-3 text-sm italic text-[#6d5214]">“{feedback.misconception.evidence}”</blockquote> : null}
        </div>
      ) : null}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border-2 border-line bg-[#f5f1e6] p-4">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-muted">Mastery estimate</p>
          <p className="mt-2 font-extrabold">{formatMastery(feedback.mastery.before)} → {formatMastery(feedback.mastery.after)}</p>
          <p className="mt-1 text-xs text-muted">{feedback.mastery.evidenceCount} assessed question{feedback.mastery.evidenceCount === 1 ? "" : "s"}</p>
        </div>
        <div className="rounded-2xl border-2 border-line bg-[#f5f1e6] p-4">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-muted">Next review</p>
          <p className="mt-2 font-extrabold"><DateText value={feedback.nextReviewAt} /></p>
        </div>
      </div>
    </Card>
  );
}

function CompletionView({ session }: { session: SessionSnapshot }) {
  const runtime = useTutorRuntime();
  const router = useRouter();
  const summary = session.summary!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function startRecommended(conceptId: ConceptId) {
    setBusy(true);
    setError(null);
    try {
      const next = await runtime.startSession({ mode: "practice", conceptId, idempotencyKey: newKey() });
      router.push(`/learn/session/${encodeURIComponent(next.id)}`);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-8">
      <Card className="overflow-hidden border-primary bg-[#e7f7f4] p-7 text-center sm:p-10">
        <SparkMascot state="celebrating" className="mx-auto w-36" />
        <Badge tone="teal">Session completed</Badge>
        <h1 className="mt-4 font-display text-4xl font-black">Your saved summary is ready.</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-muted">{summary.feedback}</p>
        <div className="mx-auto mt-7 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
          <Count label="Assessed" value={summary.answeredCount} />
          <Count label="Correct" value={summary.correctCount} />
          <Count label="Partial" value={summary.partialCount} />
          <Count label="Incorrect" value={summary.incorrectCount} />
        </div>
      </Card>
      <section aria-labelledby="summary-concepts">
        <h2 id="summary-concepts" className="font-display text-2xl font-black">Concept estimates</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {summary.conceptProgress.map((progress) => (
            <Card key={progress.conceptId} className="p-5 shadow-none">
              <h3 className="font-extrabold">{conceptById.get(progress.conceptId)?.title ?? progress.conceptId}</h3>
              <Mastery progress={progress} />
            </Card>
          ))}
        </div>
      </section>
      <Card className="p-6">
        <h2 className="font-display text-xl font-black">Recommended next concepts</h2>
        {summary.recommendedConceptIds.length ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {summary.recommendedConceptIds.map((conceptId) => (
              <Button key={conceptId} variant="secondary" disabled={busy || !!runtime.pending} onClick={() => void startRecommended(conceptId)}>
                {conceptById.get(conceptId)?.title ?? conceptId}
              </Button>
            ))}
          </div>
        ) : <p className="mt-3 text-sm text-muted">The backend did not recommend a next concept.</p>}
        <Failure error={error} />
        <div className="mt-6 flex flex-wrap gap-3"><ButtonLink href="/learn">Return home</ButtonLink>{session.mode === "revision" ? <ButtonLink href="/learn/revision" variant="secondary">Refresh revision queue</ButtonLink> : null}</div>
      </Card>
    </div>
  );
}

function AbandonedView({ session }: { session: SessionSnapshot }) {
  return (
    <Card className="mx-auto max-w-2xl p-8 text-center sm:p-10">
      <SparkMascot state="idle" className="mx-auto w-28" />
      <Badge tone="neutral">Session ended</Badge>
      <h1 className="mt-4 font-display text-3xl font-black">This session was abandoned.</h1>
      <p className="mt-3 text-sm leading-7 text-muted">Previously graded progress remains saved. No completion summary or celebration was created.</p>
      <p className="mt-2 text-xs text-muted">Ended <DateText value={session.endedAt} /></p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <ButtonLink href="/learn">Return home</ButtonLink>
        <ButtonLink href={session.mode === "revision" ? "/learn/revision" : "/learn/concepts"} variant="secondary">{session.mode === "revision" ? "Return to revision" : "Start something new"}</ButtonLink>
      </div>
    </Card>
  );
}

function SessionLoading() {
  return <Card className="p-10 text-center" role="status"><SparkMascot state="thinking" className="mx-auto w-28" /><p className="mt-4 font-extrabold">Restoring your saved session…</p></Card>;
}

function Count({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border-2 border-line bg-white p-4"><p className="text-2xl font-black">{value}</p><p className="mt-1 text-xs font-bold text-muted">{label}</p></div>;
}

function formatMastery(value: number | null) {
  return value === null ? "Unassessed" : `${Math.round(value * 100)}%`;
}
