import { Info, MessageSquareText } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function VoiceAnswerPreview() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-[#e7f7f4] text-primary-dark">
            <MessageSquareText className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-primary-dark">
              Answer and reasoning
            </p>
            <h2 className="font-display text-xl font-black">Show the answer and the thinking</h2>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          <div>
            <label htmlFor="final-answer" className="text-sm font-extrabold text-ink">
              Final answer
            </label>
            <input
              id="final-answer"
              type="text"
              placeholder="Example: 2 A"
              className="mt-2 min-h-12 w-full rounded-2xl border-2 border-line bg-white px-4 text-base text-ink placeholder:text-[#8b989f] focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="explanation" className="text-sm font-extrabold text-ink">
              Explain your thinking
            </label>
            <p id="voice-instruction" className="mt-1 text-sm leading-6 text-muted">
              Click the answer box, activate Wispr Flow, and explain your thinking.
            </p>
            <textarea
              id="explanation"
              rows={5}
              aria-describedby="voice-instruction demo-input-note"
              placeholder="Use an equation, explain each step, and include units."
              className="mt-2 w-full resize-y rounded-2xl border-2 border-line bg-white px-4 py-3 text-base leading-6 text-ink placeholder:text-[#8b989f] focus:border-primary focus:outline-none"
            />
          </div>
          <div
            id="demo-input-note"
            className="flex gap-2 rounded-2xl border border-[#e6c466] bg-[#fff5cf] p-3 text-xs leading-5 text-[#6d5214]"
          >
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            These ordinary fields are ready for typed input and Wispr Flow dictation; the session journey submits them through the existing TutorApi boundary.
          </div>
          <ButtonLink href="/learn" className="w-full sm:w-auto">
            Try the student journey
          </ButtonLink>
        </div>
      </CardContent>
    </Card>
  );
}
