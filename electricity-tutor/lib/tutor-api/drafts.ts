export interface AnswerDraft {
  finalAnswerText: string;
  reasoningText: string;
  selectedOptionId: string | null;
  updatedAt: string;
}

export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const draftKey = (userId: string, sessionId: string, questionId: string) =>
  `spark:${encodeURIComponent(userId)}:draft:${encodeURIComponent(sessionId)}:${encodeURIComponent(questionId)}`;

function browserStorage(): DraftStorage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

function isDraft(value: unknown): value is AnswerDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<AnswerDraft>;
  return typeof draft.finalAnswerText === "string"
    && typeof draft.reasoningText === "string"
    && (draft.selectedOptionId === null || typeof draft.selectedOptionId === "string")
    && typeof draft.updatedAt === "string"
    && Number.isFinite(Date.parse(draft.updatedAt));
}

export function readDraft(
  userId: string,
  sessionId: string,
  questionId: string,
  storage: DraftStorage | null = browserStorage(),
): AnswerDraft | null {
  if (!storage) return null;
  const key = draftKey(userId, sessionId, questionId);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!isDraft(value)) {
      storage.removeItem(key);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function saveDraft(
  userId: string,
  sessionId: string,
  questionId: string,
  draft: Omit<AnswerDraft, "updatedAt">,
  storage: DraftStorage | null = browserStorage(),
): AnswerDraft {
  const value: AnswerDraft = { ...draft, updatedAt: new Date().toISOString() };
  storage?.setItem(draftKey(userId, sessionId, questionId), JSON.stringify(value));
  return value;
}

export function clearDraft(
  userId: string,
  sessionId: string,
  questionId: string,
  storage: DraftStorage | null = browserStorage(),
): void {
  storage?.removeItem(draftKey(userId, sessionId, questionId));
}

export function clearSessionDrafts(
  userId: string,
  sessionId: string,
  storage: DraftStorage | null = browserStorage(),
): void {
  if (!storage || typeof window === "undefined") return;
  const prefix = `spark:${encodeURIComponent(userId)}:draft:${encodeURIComponent(sessionId)}:`;
  for (const key of Object.keys(window.sessionStorage)) {
    if (key.startsWith(prefix)) storage.removeItem(key);
  }
}
