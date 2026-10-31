import type { Metadata } from "next";

import { SessionJourney } from "@/components/learning/session-journey";

export const metadata: Metadata = { title: "Learning session" };

export default async function SessionPage({ params }: PageProps<"/learn/session/[sessionId]">) {
  const { sessionId } = await params;
  return <SessionJourney sessionId={sessionId} />;
}
