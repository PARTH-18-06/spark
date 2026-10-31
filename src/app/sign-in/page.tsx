import type { Metadata } from "next";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import Link from "next/link";

import { AppLogo } from "@/components/brand/app-logo";
import { SparkMascot } from "@/components/brand/spark-mascot";
import { SignInForm } from "@/components/auth/sign-in-form";
import { DemoBanner } from "@/components/shell/demo-banner";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <>
      <DemoBanner />
      <main id="main-content" className="mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-2">
        <section className="mx-auto max-w-md text-center lg:text-left">
          <AppLogo />
          <SparkMascot state="encouraging" className="mx-auto mt-8 w-44 lg:mx-0" />
          <h1 className="mt-4 font-display text-4xl font-black tracking-[-0.045em]">Welcome back, bright spark.</h1>
          <p className="mt-3 text-base leading-7 text-muted">
            Sign in through the selected TutorApi adapter, or use a clearly labeled demo persona to explore the scaffold.
          </p>
        </section>

        <Card className="mx-auto w-full max-w-md p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#e7f7f4] text-primary-dark">
              <LockKeyhole className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-primary-dark">Account access</p>
              <h2 className="font-display text-2xl font-black">Sign in</h2>
            </div>
          </div>
          <SignInForm />
          <div className="my-6 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.12em] text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">or</div>
          <ButtonLink href="/learn" variant="secondary" className="w-full">Explore demo mode</ButtonLink>
          <Link href="/" className="mt-6 flex items-center justify-center gap-2 rounded-lg text-sm font-extrabold text-primary-dark underline decoration-2 underline-offset-4">
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to Spark
          </Link>
        </Card>
      </main>
    </>
  );
}
