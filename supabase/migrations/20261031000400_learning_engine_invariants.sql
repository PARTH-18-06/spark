-- Learning-engine idempotency invariants. These constraints make retries safe
-- before the session/evaluation route transaction is implemented.

create unique index attempts_one_graded_evidence_per_assignment
  on public.attempts (assignment_id)
  where status <> 'needs_clarification';

create unique index attempts_one_open_clarification_per_assignment
  on public.attempts (assignment_id)
  where status = 'needs_clarification';

alter table public.revision_items
  add column source_attempt_id uuid references public.attempts(id) on delete set null;

create unique index revision_items_one_source_attempt
  on public.revision_items (source_attempt_id)
  where source_attempt_id is not null;

comment on column public.revision_items.source_attempt_id is
  'Canonical graded attempt that created this review item; retries must reuse it.';
