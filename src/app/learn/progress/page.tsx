import type { Metadata } from "next";

import { ProgressHistory } from "@/components/learning/progress-history";

export const metadata: Metadata = { title: "Progress" };

export default function ProgressPage() {
  return <ProgressHistory />;
}
