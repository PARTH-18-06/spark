"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/states/error-state";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main-content" className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
      <ErrorState onRetry={reset} />
    </main>
  );
}
