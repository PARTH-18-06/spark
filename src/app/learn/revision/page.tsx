import type { Metadata } from "next";

import { RevisionQueueView } from "@/components/learning/revision-queue";

export const metadata: Metadata = { title: "Revision" };

export default function RevisionPage() {
  return <RevisionQueueView />;
}
