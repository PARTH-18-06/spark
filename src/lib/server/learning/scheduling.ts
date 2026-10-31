import "server-only";

import type { ConceptId, RevisionItem, RevisionQueue } from "@/contracts/tutor";
import { LEARNING_POLICY, type GradedOutcome } from "@/lib/server/learning/policy";

export interface RevisionRecord {
  id: string;
  conceptId: ConceptId;
  status: "due" | "upcoming" | "completed";
  dueAt: Date;
  reason: string;
  completedAt: Date | null;
  completedSessionId: string | null;
}

function iso(date: Date): string { return date.toISOString(); }

export function scheduleNextReview(status: GradedOutcome, evidenceCount: number, now: Date): Date {
  if (!Number.isInteger(evidenceCount) || evidenceCount < 1) throw new Error("Evidence count must be positive");
  const milliseconds = status === "incorrect"
    ? LEARNING_POLICY.revision.incorrectHours * 3_600_000
    : status === "partial"
      ? LEARNING_POLICY.revision.partialHours * 3_600_000
      : (LEARNING_POLICY.revision.correctIntervalsDays[Math.min(evidenceCount, LEARNING_POLICY.revision.correctIntervalsDays.length) - 1] ?? 14) * 86_400_000;
  return new Date(now.getTime() + milliseconds);
}

export function classifyRevision(record: RevisionRecord, now: Date): RevisionItem {
  const status = record.status === "completed" ? "completed" : record.dueAt.getTime() <= now.getTime() ? "due" : "upcoming";
  return { id: record.id, conceptId: record.conceptId, status, dueAt: iso(record.dueAt), reason: record.reason, completedAt: record.completedAt ? iso(record.completedAt) : null, completedSessionId: record.completedSessionId };
}

export function buildRevisionQueue(records: readonly RevisionRecord[], now: Date): RevisionQueue {
  return { generatedAt: iso(now), items: records.map((record) => classifyRevision(record, now)).sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id)) };
}

export function earliestOutstandingReview(records: readonly RevisionRecord[], conceptId: ConceptId): string | null {
  const outstanding = records.filter((record) => record.conceptId === conceptId && record.status !== "completed");
  if (!outstanding.length) return null;
  return iso(new Date(Math.min(...outstanding.map(({ dueAt }) => dueAt.getTime()))));
}

export function completeRevisionItems(records: readonly RevisionRecord[], selectedIds: readonly string[], sessionId: string, completedAt: Date): RevisionRecord[] {
  const selected = new Set(selectedIds);
  for (const id of selected) if (!records.some((record) => record.id === id)) throw new Error(`Unknown revision item: ${id}`);
  return records.map((record) => selected.has(record.id) && record.status !== "completed"
    ? { ...record, status: "completed", completedAt, completedSessionId: sessionId }
    : { ...record });
}
