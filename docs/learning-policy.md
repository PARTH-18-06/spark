# Spark learning policy (prototype)

The learning engine is deterministic server policy. It is deliberately a
prototype estimate, not a validated educational measurement. The API example
scores are illustrative and are not used as constants.

## Mastery and evidence

An unassessed concept has `mastery=null`, `evidenceCount=0`, and state
`unassessed`. Every accepted graded assignment contributes exactly one evidence
unit. A clarification contributes zero; resolving it contributes one for the
same assignment. Persistence must enforce one non-clarification attempt per
assignment and perform attempt, mastery, misconception, and revision writes in
one transaction.

The policy converts an evaluation into prototype credit:

- correct + sound reasoning: 1.00
- correct with unclear/not-provided reasoning: 0.75/0.70
- correct with a supported misconception: 0.65
- partial: 0.55 sound, 0.35 misconception, 0.40 otherwise
- incorrect: 0.10 sound, 0.05 otherwise

The first credit becomes mastery. Later values use `0.7 * previous + 0.3 *
credit`, clamped to `[0,1]`. States are `needs_practice` below 0.40,
`developing` below 0.75, and `strong` at or above 0.75 only after at least
three independent graded assignments. State labels are always derived on the
server. Attempt feedback stores before/after mastery and both evidence counts.

## Selection

Diagnostic sessions target eight questions, one per agreed electricity concept.
Practice targets five questions; an explicit concept gets first priority, then
weak prerequisites may fill remaining slots without becoming mandatory locks.
Without an explicit concept, weak concepts and their prerequisites are ranked
by low mastery/evidence. Revision selects at least one question per selected
revision item and never marks an uncovered item complete.

Difficulty is easy for unassessed/low-evidence or mastery below 0.40, medium
below 0.75, and hard at/above 0.75. Supported recent misconception codes give
matching bank questions a preference. Unseen bank questions are preferred, and
the deterministic seed/tie-break makes verification reproducible. If eligible
alternatives are exhausted, the selector uses a bounded repeat fallback and
marks that fallback internally; if a concept has no question at all it fails
explicitly rather than shortening a diagnostic/revision session.

Assigned question IDs are generated separately from immutable question-bank
IDs. Only the public `Question` shape leaves the service.

The production loader reads the active reviewed rows from `question_bank` and
their stable links from `question_misconceptions`; it never exposes rubric or
answer data to the selector output.

## Misconceptions

Codes and labels come from the seeded server catalog. A code must belong to the
question concept, its label must match the catalog, and evidence must be a
nonempty exact substring of the confirmed reasoning text. A later evaluator
must reject or downgrade an unexpected model code to `reasoningStatus:
"unclear"`; it must not invent a catalog identity or persist an unsupported
code.

## Revision scheduling

Prototype intervals are 1 hour after incorrect, 12 hours after partial, and
1/3/7/14 days after correct evidence according to the resulting evidence
count. Clarification leaves mastery, schedule, and queue unchanged. `due` is
`dueAt <= now`; otherwise an outstanding item is `upcoming`. `nextReviewAt` is
the earliest outstanding review date for the concept. Existing overdue items
remain due while a new review is scheduled; a completed revision item changes
status only when its revision session completes validly. Abandoning a session
preserves graded progress and leaves selected items available. A source-attempt
unique constraint prevents replayed attempts from creating duplicate reviews.

Queue classification is calculated on read with an injectable clock; no worker
or external scheduler is required.
