# Spark hackathon demo (3–5 minutes)

This walkthrough is for the approved dedicated Supabase/Groq test project. It
uses the existing synthetic accounts and the integrated v1.1.0 frontend. Do not
show passwords, service keys, cookies, CSRF tokens, or Supabase/Groq settings on
screen.

## Start

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The live frontend uses
`NEXT_PUBLIC_TUTOR_API_MODE=http` from the ignored `.env.local`; it does not
silently fall back to mocks.

## Walkthrough

1. **Student sign-in and dashboard (30–45 seconds).** Sign in with the
   provisioned new-student account. Complete onboarding if the account is shown
   the profile form. Point out the Electricity chapter concepts, current
   progress, and the active-session/resume card when present.

2. **Adaptive practice and feedback (60–90 seconds).** Open Concepts, choose
   “Resistance and Ohm’s law,” and start practice. Submit a concise answer such
   as `I = V/R` with the explanation `I use Ohm’s law: current is voltage divided
   by resistance.` The exact feedback is AI/provider-dependent; any displayed
   status, feedback, mastery estimate, and next-review time are real response
   data, not a scripted demo result. Continue once to show the next assigned
   question and updated session version.

3. **Persistence and history (30–45 seconds).** Reload while feedback is shown.
   Confirm the same saved feedback is restored without a second submission.
   Open Progress and point out the updated concept estimate, session history,
   and attempt history. Rewards should remain visibly disabled.

4. **Teacher visibility (45–60 seconds).** Sign out, then sign in with the
   assigned synthetic teacher account. Open the teacher workspace, select the
   provisioned class, and open the student row. Show the authorized class
   mastery table, recent session, and recent attempt; these values come from the
   backend read models after the student activity.

5. **Close (15 seconds).** Sign out and return to the sign-in page. Do not open
   an unassigned teacher account except when explicitly demonstrating the
   forbidden/empty authorization path.

The expected wording of AI feedback is illustrative only. The stable things to
demonstrate are the contract-shaped response, adaptive session transition,
reload-safe persistence, backend-managed authentication, and authorized
teacher visibility.

## Pre-demo checklist

- `.env.local` is present, ignored, and points to the approved test project.
- `SPARK_INTEGRATION_ENABLED=true` is set only for this dedicated test target.
- The Supabase project has the seven migrations, repeatable seed, and synthetic
  roster; provisioning opt-in is disabled.
- `pnpm verify:contract`, `pnpm typecheck`, and the latest live integration
  checks pass.
- The local server is running at `http://localhost:3000` and the browser is in
  a clean/private window.
- Groq evaluation is reachable, and the demo presenter knows that response
  wording and classification can vary.
- For Wispr, use a real microphone-enabled browser session and confirm the
  dictated text before submitting.

## Honest fallbacks

If Groq is unavailable, stop the live learning walkthrough and show the saved
dashboard/history or the contract-shaped error/retry state. For interface-only
rehearsal, run `NEXT_PUBLIC_TUTOR_API_MODE=mock pnpm test:e2e` (with an
alternate `NEXT_DIST_DIR` if OneDrive locks `.next`), and label every result as
mocked—not live. Do not present mock feedback or seeded sample teacher data as
evidence of live persistence.

If Wispr is unavailable, type a confirmed explanation into the answer field and
state clearly that microphone dictation was not demonstrated. The application
accepts confirmed text; it does not claim to capture microphone audio itself.

## Manual Wispr check

1. In a live student session, focus **Explain your thinking**.
2. Activate Wispr Flow and dictate: “Current equals voltage divided by
   resistance; with twelve volts and four ohms, the current is three amperes.”
3. Wait for Wispr’s confirmed text, review and edit it in the field, then submit
   the answer.
4. Confirm the real feedback panel appears and that Progress/Attempt history
   reflects the committed attempt.

Physical microphone/dictation remains a manual check until directly observed;
typed confirmed text is not evidence that dictation passed.
