import type { Metadata } from "next";

import { AppLogo } from "@/components/brand/app-logo";
import { ProfileForm } from "@/components/auth/profile-form";
import { DemoBanner } from "@/components/shell/demo-banner";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Set up your profile" };

export default function OnboardingPage() {
  return (
    <>
      <DemoBanner />
      <header className="border-b-2 border-line bg-surface/90 px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-4xl"><AppLogo /></div>
      </header>
      <main id="main-content" className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="max-w-2xl">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-primary-dark">Profile setup</p>
          <h1 className="mt-3 font-display text-4xl font-black tracking-[-0.045em]">A little context makes practice feel personal.</h1>
          <p className="mt-3 text-base leading-7 text-muted">This form saves through the selected adapter and keeps student identity in the authenticated session.</p>
        </div>
        <Card className="mt-8 p-5 sm:p-8">
          <ProfileForm />
        </Card>
      </main>
    </>
  );
}
