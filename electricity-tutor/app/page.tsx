import {
  ArrowRight,
  BookOpenCheck,
  BrainCircuit,
  Check,
  GitBranch,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { AppLogo } from "@/components/brand/app-logo";
import { SparkMascot } from "@/components/brand/spark-mascot";
import { DemoBanner } from "@/components/shell/demo-banner";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ELECTRICITY_CONCEPTS,
  TUTOR_CONTRACT_VERSION,
} from "@/src/contracts/tutor";

const principles = [
  {
    icon: MessageSquareText,
    title: "Say how you got there",
    description:
      "Final answers and explanations stay separate, so the tutor can respond to both.",
  },
  {
    icon: GitBranch,
    title: "Follow the physics",
    description:
      "Eight connected concepts show prerequisite relationships without turning them into game locks.",
  },
  {
    icon: ShieldCheck,
    title: "Practice without penalties",
    description:
      "No lives, fake scores, or invented progress. Practice stays available when you need it.",
  },
];

export default function LandingPage() {
  return (
    <>
      <DemoBanner />
      <header className="border-b border-line/80 bg-surface/70 backdrop-blur">
        <div className="mx-auto flex min-h-18 max-w-7xl items-center px-4 sm:px-6">
          <AppLogo />
          <nav className="ml-auto flex items-center gap-2" aria-label="Public navigation">
            <ButtonLink href="/sign-in" variant="ghost" className="hidden sm:inline-flex">
              Sign in
            </ButtonLink>
            <ButtonLink href="/learn" size="sm">
              Enter demo
              <ArrowRight className="size-4" aria-hidden="true" />
            </ButtonLink>
          </nav>
        </div>
      </header>

      <main id="main-content">
        <section className="paper-grid overflow-hidden border-b-2 border-line/70">
          <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
            <div className="max-w-2xl">
              <Badge tone="teal">Class 10 · Electricity</Badge>
              <h1 className="mt-6 font-display text-5xl font-black leading-[0.97] tracking-[-0.055em] text-ink sm:text-6xl lg:text-7xl">
                Make electricity
                <span className="block text-primary-dark">click.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-muted">
                Spark turns one big chapter into short, approachable activities where your answer and your reasoning both have a place.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/learn" size="lg">
                  Explore the demo
                  <ArrowRight className="size-5" aria-hidden="true" />
                </ButtonLink>
                <ButtonLink href="/learn/concepts" variant="secondary" size="lg">
                  See the concept trail
                </ButtonLink>
              </div>
              <p className="mt-5 text-xs font-bold leading-5 text-muted">
                Demo interface. Sample state stays on this device; production grading remains backend-owned.
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-[34rem] pt-10 lg:pt-0">
              <div className="absolute left-4 top-1 rounded-2xl border-2 border-ink bg-highlight px-4 py-2 text-sm font-black shadow-[0_4px_0_0_var(--ink)] sm:left-10">
                You bring the thinking.
              </div>
              <Card className="relative overflow-hidden p-5 sm:p-7">
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <Badge tone="yellow">Illustrative activity</Badge>
                    <p className="mt-4 text-sm font-bold text-muted">Use Ohm&apos;s law</p>
                    <p className="equation mt-1 text-4xl font-bold text-ink">I = V ÷ R</p>
                  </div>
                  <SparkMascot state="celebrating" className="w-28 shrink-0 sm:w-36" />
                </div>
                <div className="mt-5 rounded-2xl border-2 border-line bg-[#f5f1e6] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-primary-dark">
                    Thinking prompt
                  </p>
                  <p className="mt-2 text-sm font-bold leading-6 text-ink">
                    If voltage doubles while resistance stays fixed, what happens to current—and why?
                  </p>
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs font-bold text-muted">
                  <Check className="size-4 text-success" aria-hidden="true" />
                  Ordinary text entry, ready for Wispr Flow dictation
                </div>
              </Card>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24" aria-labelledby="learning-shape">
          <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
            <div className="lg:sticky lg:top-8">
              <Badge tone="navy">A clear route through the chapter</Badge>
              <h2 id="learning-shape" className="mt-5 font-display text-4xl font-black tracking-[-0.045em] sm:text-5xl">
                Eight concepts. One connected trail.
              </h2>
              <p className="mt-5 text-base leading-7 text-muted">
                The trail mirrors the shared v{TUTOR_CONTRACT_VERSION} concept graph. Dependencies explain which ideas support the next one; they never block a learner from opening a concept.
              </p>
              <ButtonLink href="/learn/concepts" variant="secondary" className="mt-7">
                Open the full trail
                <ArrowRight className="size-4" aria-hidden="true" />
              </ButtonLink>
            </div>
            <ol className="grid gap-3 sm:grid-cols-2">
              {ELECTRICITY_CONCEPTS.map((concept, index) => (
                <li
                  key={concept.id}
                  className="flex items-start gap-4 rounded-2xl border-2 border-line bg-surface p-4"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#e7f7f4] text-sm font-black text-primary-dark">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="font-extrabold text-ink">{concept.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-muted">
                      {concept.prerequisiteIds.length === 0
                        ? "Chapter starting point"
                        : `${concept.prerequisiteIds.length} prerequisite relationship${concept.prerequisiteIds.length === 1 ? "" : "s"}`}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-y-2 border-line bg-[#eef7f3]">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="max-w-2xl">
              <Badge tone="teal">Designed for active learning</Badge>
              <h2 className="mt-4 font-display text-3xl font-black tracking-[-0.04em] sm:text-4xl">
                A playful interface with honest boundaries.
              </h2>
            </div>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {principles.map((principle) => {
                const Icon = principle.icon;
                return (
                  <Card key={principle.title} className="p-6 shadow-none">
                    <span className="grid size-11 place-items-center rounded-2xl bg-highlight text-ink">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-5 font-display text-xl font-black">{principle.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted">{principle.description}</p>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
          <Card className="relative overflow-hidden border-ink bg-ink px-6 py-10 text-white shadow-[0_8px_0_0_#081827] sm:px-10 sm:py-12">
            <Sparkles className="absolute right-7 top-7 size-8 text-highlight opacity-80" aria-hidden="true" />
            <div className="relative max-w-2xl">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[#8ee0d7]">
                <BrainCircuit className="size-4" aria-hidden="true" />
                Student and teacher journeys ready
              </div>
              <h2 className="mt-4 font-display text-3xl font-black tracking-[-0.04em] sm:text-4xl">
                Explore the complete learning journey.
              </h2>
              <p className="mt-4 text-sm leading-7 text-[#cdd7df] sm:text-base">
                Navigation, responsive layouts, concept relationships, answer fields, teacher separation, and the shared TutorApi adapters now power the complete mock learning journey.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/learn" variant="yellow" size="lg">
                  Enter student demo
                  <ArrowRight className="size-5" aria-hidden="true" />
                </ButtonLink>
                <ButtonLink href="/teacher" variant="secondary" size="lg">
                  <BookOpenCheck className="size-5" aria-hidden="true" />
                  Teacher workspace
                </ButtonLink>
              </div>
            </div>
          </Card>
        </section>
      </main>

      <footer className="border-t-2 border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <AppLogo compact />
          <p>AGREED v1.1.0 frontend · Local sample data only · Rewards disabled.</p>
        </div>
      </footer>
    </>
  );
}
