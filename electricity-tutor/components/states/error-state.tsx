import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function ErrorState({
  title = "Something interrupted the circuit",
  description = "Try this view again. Your unsent work has not been submitted.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="mx-auto max-w-xl p-7 text-center" role="alert">
      <TriangleAlert className="mx-auto size-9 text-danger" aria-hidden="true" />
      <h2 className="mt-4 font-display text-xl font-black">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      {onRetry ? (
        <Button className="mt-6" onClick={onRetry}>Try again</Button>
      ) : null}
    </Card>
  );
}
