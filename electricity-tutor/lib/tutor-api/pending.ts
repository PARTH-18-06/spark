import type {
  AdvanceSessionInput,
  EndSessionInput,
  StartSessionInput,
  SubmitAttemptInput,
} from "../../src/contracts/tutor";
import { canonical } from "./validation";

export type PendingOperation = "start" | "submit" | "advance" | "end";
export type PendingInput = StartSessionInput | SubmitAttemptInput | AdvanceSessionInput | EndSessionInput;

export interface PendingRequest {
  operation: PendingOperation;
  input: PendingInput;
  state: "ready" | "unknown";
  createdAt: string;
}

export interface PendingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class PendingMutationConflictError extends Error {
  constructor() {
    super("Another learning action has an unknown outcome. Retry or reconcile it before starting a different action.");
    this.name = "PendingMutationConflictError";
  }
}

export const pendingKey = (userId: string) => `spark:${userId}:pending`;

function browserStorage(): PendingStorage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) freeze(item);
  }
  return value;
}

function validPending(value: unknown): value is PendingRequest {
  if (!value || typeof value !== "object") return false;
  const pending = value as Partial<PendingRequest>;
  const input = pending.input as Partial<PendingInput> | undefined;
  return ["start", "submit", "advance", "end"].includes(pending.operation ?? "")
    && ["ready", "unknown"].includes(pending.state ?? "")
    && typeof pending.createdAt === "string"
    && Number.isFinite(Date.parse(pending.createdAt))
    && !!input
    && typeof input.idempotencyKey === "string"
    && input.idempotencyKey.length > 0;
}

export function readPending(userId: string, storage: PendingStorage | null = browserStorage()): PendingRequest | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(pendingKey(userId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!validPending(value)) {
      storage.removeItem(pendingKey(userId));
      return null;
    }
    return freeze(clone(value));
  } catch {
    return null;
  }
}

export function savePending(userId: string, pending: PendingRequest, storage: PendingStorage | null = browserStorage()): PendingRequest {
  const immutable = freeze(clone(pending));
  storage?.setItem(pendingKey(userId), JSON.stringify(immutable));
  return immutable;
}

export function clearPending(userId: string, storage: PendingStorage | null = browserStorage()): void {
  storage?.removeItem(pendingKey(userId));
}

export function newKey(): string {
  return crypto.randomUUID();
}

/** Network, protocol, and server-marked retryable failures may have committed. */
export function isUnknown(error: unknown): boolean {
  if (!error || typeof error !== "object") return true;
  const candidate = error as { kind?: string; outcome?: string; body?: { error?: { retryable?: boolean } } };
  return candidate.kind === "network"
    || (candidate.kind === "protocol" && candidate.outcome === "unknown")
    || candidate.body?.error?.retryable === true;
}

export function sameIntent(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

/** Owns one in-flight learning mutation per student and preserves exact retries. */
export class PendingMutationCoordinator {
  constructor(
    private readonly userId: string,
    private readonly storage: PendingStorage | null = browserStorage(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  current(): PendingRequest | null {
    return readPending(this.userId, this.storage);
  }

  begin(operation: PendingOperation, input: PendingInput): PendingRequest {
    const existing = this.current();
    if (existing) {
      if (existing.operation === operation && sameIntent(existing.input, input)) return existing;
      throw new PendingMutationConflictError();
    }
    return savePending(this.userId, {
      operation,
      input: clone(input),
      state: "ready",
      createdAt: this.clock().toISOString(),
    }, this.storage);
  }

  async execute<T>(operation: PendingOperation, input: PendingInput, send: (input: PendingInput) => Promise<T>): Promise<T> {
    return this.send(this.begin(operation, input), send);
  }

  async retry<T>(send: (input: PendingInput) => Promise<T>): Promise<T> {
    const pending = this.current();
    if (!pending) throw new Error("There is no pending learning action to retry.");
    return this.send(pending, send);
  }

  discardDefinitive(): void {
    clearPending(this.userId, this.storage);
  }

  private async send<T>(pending: PendingRequest, send: (input: PendingInput) => Promise<T>): Promise<T> {
    try {
      const result = await send(pending.input);
      clearPending(this.userId, this.storage);
      return result;
    } catch (error) {
      if (isUnknown(error)) {
        savePending(this.userId, { ...pending, state: "unknown" }, this.storage);
      } else {
        clearPending(this.userId, this.storage);
      }
      throw error;
    }
  }
}
