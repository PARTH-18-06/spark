import type { Metadata } from "next";

import { ConceptMap } from "@/components/learning/concept-map";

export const metadata: Metadata = { title: "Concepts" };

export default function ConceptsPage() {
  return <ConceptMap />;
}
