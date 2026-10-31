import type { Metadata } from "next";

import { DiagnosticIntro } from "@/components/learning/diagnostic-intro";

export const metadata: Metadata = { title: "Diagnostic" };

export default function DiagnosticPage() {
  return <DiagnosticIntro />;
}
