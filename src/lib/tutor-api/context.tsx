"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type {
  AuthState,
  AdvanceSessionInput,
  AttemptResult,
  EndSessionInput,
  EvaluationStatus,
  SaveStudentProfileInput,
  SessionSnapshot,
  SignInInput,
  StartSessionInput,
  StudentProfile,
  SubmitAttemptInput,
  TutorApi,
} from "@/src/contracts/tutor";
import { HttpTutorApi } from "./http";
import { MockTutorApi, type Persona } from "./mock";
import {
  PendingMutationCoordinator,
  type PendingInput,
  type PendingOperation,
  type PendingRequest,
} from "./pending";

const TutorApiContext = createContext<TutorApi | null>(null);
type PendingMutationResult = SessionSnapshot | AttemptResult;

export interface TutorRuntime {
  mode: "mock" | "http";
  auth: AuthState | null;
  authError: unknown;
  refreshAuth: () => Promise<AuthState | null>;
  signIn: (input: SignInInput) => Promise<AuthState>;
  signOut: () => Promise<void>;
  saveProfile: (input: SaveStudentProfileInput) => Promise<StudentProfile>;
  pending: PendingRequest | null;
  startSession: (input: StartSessionInput) => Promise<SessionSnapshot>;
  submitAttempt: (input: SubmitAttemptInput) => Promise<AttemptResult>;
  advanceSession: (input: AdvanceSessionInput) => Promise<SessionSnapshot>;
  endSession: (input: EndSessionInput) => Promise<SessionSnapshot>;
  retryPendingMutation: () => Promise<PendingMutationResult>;
  discardPendingMutation: () => void;
  choosePersona: (persona: Persona) => void;
  persona: Persona;
  outcome: EvaluationStatus;
  setOutcome: (status: EvaluationStatus) => void;
  failNext: () => void;
  resetDemo: () => void;
}

const RuntimeContext = createContext<TutorRuntime | null>(null);

function clearPrivateClientState(): void {
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith("spark:")) sessionStorage.removeItem(key);
  }
}

export function TutorApiProvider({ api, children }: { api: TutorApi | null; children: ReactNode }) {
  return <TutorApiContext.Provider value={api}>{children}</TutorApiContext.Provider>;
}

export function useTutorApi(): TutorApi {
  const api = useContext(TutorApiContext);
  if (!api) throw new Error("TutorApi is not configured.");
  return api;
}

export function useTutorRuntime(): TutorRuntime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error("Tutor runtime is missing.");
  return runtime;
}

export function TutorApplication({ children }: { children: ReactNode }) {
  const mode = process.env.NEXT_PUBLIC_TUTOR_API_MODE === "http" ? "http" : "mock";
  const [api, setApi] = useState<TutorApi | null>(null);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [authError, setAuthError] = useState<unknown>(null);
  const [persona, setPersona] = useState<Persona>("student-new");
  const [outcome, setOutcomeState] = useState<EvaluationStatus>("correct");
  const [generation, setGeneration] = useState(0);
  const [pending, setPending] = useState<PendingRequest | null>(null);

  const applyAuth = useCallback((next: AuthState): AuthState => {
    const nextUserId = next.authenticated ? next.user.id : null;
    const previousUserId = sessionStorage.getItem("spark:active-user");
    if (previousUserId && previousUserId !== nextUserId) clearPrivateClientState();
    if (nextUserId) sessionStorage.setItem("spark:active-user", nextUserId);
    else clearPrivateClientState();
    setAuth(next);
    setPending(nextUserId ? new PendingMutationCoordinator(nextUserId).current() : null);
    return next;
  }, []);

  useEffect(() => {
    let active = true;
    const stored = localStorage.getItem("spark-demo-persona");
    const chosen: Persona = stored === "student-returning" || stored === "teacher" ? stored : "student-new";
    const storedOutcome = localStorage.getItem("spark-demo-outcome");
    const nextOutcome: EvaluationStatus = storedOutcome === "partial" || storedOutcome === "incorrect" || storedOutcome === "needs_clarification" ? storedOutcome : "correct";
    setPersona(chosen);
    setOutcomeState(nextOutcome);
    const instance: TutorApi = mode === "http"
      ? new HttpTutorApi(process.env.NEXT_PUBLIC_TUTOR_API_BASE_URL || "/api/v1")
      : new MockTutorApi(chosen, localStorage);
    if (instance instanceof MockTutorApi) instance.outcome = nextOutcome;
    setApi(instance);
    setAuth(null);
    setAuthError(null);
    instance.getCurrentUser()
      .then((next) => { if (active) applyAuth(next); })
      .catch((error: unknown) => { if (active) setAuthError(error); });
    return () => { active = false; };
  }, [applyAuth, generation, mode]);

  const refreshAuth = useCallback(async () => {
    if (!api) return null;
    setAuthError(null);
    try {
      return applyAuth(await api.getCurrentUser());
    } catch (error) {
      setAuthError(error);
      return null;
    }
  }, [api, applyAuth]);

  const signIn = useCallback(async (input: SignInInput) => {
    if (!api) throw new Error("TutorApi is still loading.");
    setAuthError(null);
    try {
      return applyAuth(await api.signIn(input));
    } catch (error) {
      setAuthError(error);
      throw error;
    }
  }, [api, applyAuth]);

  const saveProfile = useCallback(async (input: SaveStudentProfileInput) => {
    if (!api) throw new Error("TutorApi is still loading.");
    const profile = await api.saveStudentProfile(input);
    setAuth((current) => current?.authenticated ? { ...current, studentProfile: profile } : current);
    return profile;
  }, [api]);

  const signOut = useCallback(async () => {
    if (!api) return;
    await api.signOut();
    clearPrivateClientState();
    setPending(null);
    applyAuth(await api.getCurrentUser());
  }, [api, applyAuth]);

  const coordinator = useMemo(
    () => auth?.authenticated ? new PendingMutationCoordinator(auth.user.id) : null,
    [auth],
  );

  const runLearningMutation = useCallback(async <T,>(operation: PendingOperation, input: PendingInput, send: (input: PendingInput) => Promise<T>) => {
    if (!coordinator) throw new Error("Sign in as a student before starting a learning action.");
    try {
      return await coordinator.execute(operation, input, send);
    } finally {
      setPending(coordinator.current());
    }
  }, [coordinator]);

  const retryPendingMutation = useCallback(async (): Promise<PendingMutationResult> => {
    if (!coordinator) throw new Error("Sign in as a student before retrying a learning action.");
    const operation = coordinator.current()?.operation;
    if (!operation || !api) throw new Error("There is no pending learning action to retry.");
    try {
      return await coordinator.retry<PendingMutationResult>((input): Promise<PendingMutationResult> => {
        if (operation === "start") return api.startSession(input as StartSessionInput);
        if (operation === "submit") return api.submitAttempt(input as SubmitAttemptInput);
        if (operation === "advance") return api.advanceSession(input as AdvanceSessionInput);
        return api.endSession(input as EndSessionInput);
      });
    } finally {
      setPending(coordinator.current());
    }
  }, [api, coordinator]);

  const choosePersona = useCallback((next: Persona) => {
    if (mode !== "mock") return;
    clearPrivateClientState();
    localStorage.setItem("spark-demo-persona", next);
    localStorage.removeItem("spark-demo-outcome");
    setPersona(next);
    setOutcomeState("correct");
    setGeneration((value) => value + 1);
  }, [mode]);

  const setOutcome = useCallback((status: EvaluationStatus) => {
    setOutcomeState(status);
    localStorage.setItem("spark-demo-outcome", status);
    if (api instanceof MockTutorApi) api.outcome = status;
  }, [api]);

  const resetDemo = useCallback(() => {
    if (!(api instanceof MockTutorApi)) return;
    api.reset();
    clearPrivateClientState();
    localStorage.removeItem("spark-demo-outcome");
    setGeneration((value) => value + 1);
  }, [api]);

  const value: TutorRuntime = {
    mode,
    auth,
    authError,
    refreshAuth,
    signIn,
    signOut,
    saveProfile,
    pending,
    startSession: (input) => runLearningMutation("start", input, (pendingInput) => api!.startSession(pendingInput as StartSessionInput)),
    submitAttempt: (input) => runLearningMutation("submit", input, (pendingInput) => api!.submitAttempt(pendingInput as SubmitAttemptInput)),
    advanceSession: (input) => runLearningMutation("advance", input, (pendingInput) => api!.advanceSession(pendingInput as AdvanceSessionInput)),
    endSession: (input) => runLearningMutation("end", input, (pendingInput) => api!.endSession(pendingInput as EndSessionInput)),
    retryPendingMutation,
    discardPendingMutation: () => {
      coordinator?.discardDefinitive();
      setPending(null);
    },
    choosePersona,
    persona,
    outcome,
    setOutcome,
    resetDemo,
    failNext: () => { if (api instanceof MockTutorApi) api.failNext = true; },
  };

  return (
    <RuntimeContext.Provider value={value}>
      <TutorApiProvider api={api}>
        {api ? children : <div className="p-10 text-center" role="status">Preparing your learning space…</div>}
      </TutorApiProvider>
    </RuntimeContext.Provider>
  );
}
