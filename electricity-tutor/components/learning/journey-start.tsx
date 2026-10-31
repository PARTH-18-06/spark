"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Failure } from "@/components/learning/shared";
import { Button } from "@/components/ui/button";
import { useTutorRuntime } from "@/lib/tutor-api/context";
import { newKey } from "@/lib/tutor-api/pending";
import type { ConceptId, SessionMode } from "@/src/contracts/tutor";

export function JourneyStart({
  mode,
  conceptId,
  revisionItemIds,
  label,
  variant = "primary",
  className,
  disabled = false,
}: {
  mode: SessionMode;
  conceptId?: ConceptId;
  revisionItemIds?: string[];
  label: string;
  variant?: "primary" | "secondary" | "ghost" | "yellow";
  className?: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const runtime = useTutorRuntime();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const locked = useRef(false);
  const pendingStart = runtime.pending?.operation === "start";
  const blocked = !!runtime.pending && !pendingStart;

  async function run() {
    if (locked.current || blocked || disabled) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const session = pendingStart
        ? await runtime.retryPendingMutation()
        : await runtime.startSession({
            mode,
            ...(conceptId ? { conceptId } : {}),
            ...(revisionItemIds ? { revisionItemIds } : {}),
            idempotencyKey: newKey(),
          });
      const snapshot = "session" in session ? session.session : session;
      router.push(`/learn/session/${encodeURIComponent(snapshot.id)}`);
    } catch (nextError) {
      setError(nextError);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <Button type="button" variant={variant} onClick={() => void run()} disabled={busy || blocked || disabled}>
        {busy ? "Preparing…" : pendingStart ? "Retry pending session start" : label}
      </Button>
      {blocked ? (
        <p className="mt-2 text-xs leading-5 text-[#7a5710]" role="status">
          Resolve the pending {runtime.pending?.operation} action before starting another session.
        </p>
      ) : null}
      <Failure error={error} retry={runtime.pending?.operation === "start" ? () => void run() : undefined} />
    </div>
  );
}
