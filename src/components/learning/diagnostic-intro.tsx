"use client";

import { BrainCircuit, Check, Clock3, Route } from "lucide-react";

import { SparkMascot } from "@/components/brand/spark-mascot";
import { JourneyStart } from "@/components/learning/journey-start";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const points = [
  { icon: Route, text: "Touches ideas from across the eight-concept chapter graph." },
  { icon: BrainCircuit, text: "Keeps your final answer separate from your explanation." },
  { icon: Clock3, text: "Uses a backend-selected adaptive length; there is no invented timer." },
];

export function DiagnosticIntro() {
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Chapter diagnostic" title="Find a useful starting point." description="The backend selects every question and returns the persisted concept results and recommendations." />
      <div className="grid gap-6 lg:grid-cols-[1fr_0.7fr]">
        <Card className="p-6 sm:p-8">
          <Badge tone="teal">Ready to begin</Badge>
          <h2 className="mt-5 font-display text-3xl font-black tracking-[-0.04em]">A short tour across Electricity</h2>
          <p className="mt-3 text-sm leading-7 text-muted">Answer at your own pace. Refresh restores the persisted backend session, and leaving the page does not abandon it.</p>
          <ul className="mt-6 space-y-4">
            {points.map((point) => {
              const Icon = point.icon;
              return <li key={point.text} className="flex gap-3 text-sm leading-6"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#e7f7f4] text-primary-dark"><Icon className="size-4" aria-hidden="true" /></span><span className="pt-1.5">{point.text}</span></li>;
            })}
          </ul>
          <div className="mt-7 rounded-2xl border border-[#e6c466] bg-[#fff5cf] p-4 text-sm leading-6 text-[#6d5214]">
            <div className="flex gap-2"><Check className="mt-1 size-4 shrink-0" aria-hidden="true" /><p><strong>No penalties:</strong> there are no lives, fake scores, or speed bonuses.</p></div>
          </div>
          <JourneyStart mode="diagnostic" label="Start diagnostic" className="mt-6" />
        </Card>
        <Card className="flex flex-col items-center justify-center p-7 text-center">
          <SparkMascot state="thinking" className="w-48" />
          <h2 className="mt-2 font-display text-xl font-black">Take your time with the why.</h2>
          <p className="mt-2 max-w-xs text-sm leading-6 text-muted">Your confirmed answer and explanation are sent as separate fields.</p>
        </Card>
      </div>
    </div>
  );
}
