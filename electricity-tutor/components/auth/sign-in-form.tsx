"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Failure } from "@/components/learning/shared";
import { Button, ButtonLink } from "@/components/ui/button";
import { useTutorRuntime } from "@/lib/tutor-api/context";

const field = "mt-2 min-h-12 w-full rounded-2xl border-2 border-line bg-white px-4 focus:border-primary focus:outline-none";

export function SignInForm() {
  const router = useRouter();
  const runtime = useTutorRuntime();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (runtime.auth?.authenticated) {
    const teacher = runtime.auth.user.roles.includes("teacher");
    const destination = teacher ? "/teacher" : runtime.auth.studentProfile?.onboardingComplete ? "/learn" : "/onboarding";
    return (
      <div className="mt-7">
        <p className="text-sm leading-6 text-muted">Signed in as <strong className="text-ink">{runtime.auth.user.displayName}</strong>.</p>
        <ButtonLink href={destination} className="mt-5 w-full">Continue to Spark</ButtonLink>
      </div>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await runtime.signIn({ email, password });
      setPassword("");
      const destination = next.authenticated && next.user.roles.includes("teacher")
        ? "/teacher"
        : next.authenticated && next.studentProfile?.onboardingComplete
          ? "/learn"
          : "/onboarding";
      router.replace(destination);
    } catch (nextError) {
      setPassword("");
      setError(nextError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-7 space-y-5" aria-describedby="signin-note" onSubmit={submit}>
      <div>
        <label htmlFor="email" className="text-sm font-extrabold">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="student@example.com" className={field} />
      </div>
      <div>
        <label htmlFor="password" className="text-sm font-extrabold">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" className={field} />
      </div>
      <p id="signin-note" className="rounded-xl bg-[#fff5cf] p-3 text-xs leading-5 text-[#6d5214]">
        {runtime.mode === "mock" ? "Demo mode accepts sample credentials and never stores the password." : "Your password is sent only to the configured same-origin sign-in endpoint and is never stored by Spark."}
      </p>
      <Failure error={error} />
      <Button type="submit" disabled={busy} className="w-full">{busy ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}
