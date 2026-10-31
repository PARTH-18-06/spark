import { SearchX } from "lucide-react";

import { EmptyState } from "@/components/states/empty-state";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main-content" className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
      <EmptyState
        icon={SearchX}
        title="That circuit does not connect"
        description="The page may have moved, or the address may be incomplete."
        action={<ButtonLink href="/">Return home</ButtonLink>}
      />
    </main>
  );
}
