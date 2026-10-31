# Student learning sessions

The v1.1.0 student surface is implemented under `src/app/api/v1`:

- `GET /api/v1/concepts`
- `POST /api/v1/sessions`
- `GET /api/v1/sessions/{sessionId}`
- `POST /api/v1/sessions/{sessionId}/attempts`
- `POST /api/v1/sessions/{sessionId}/advance`
- `POST /api/v1/sessions/{sessionId}/end`

Successful responses are the contract object directly. Learning mutations
require `Idempotency-Key`, an allowed `Origin`, and the session-bound
`X-CSRF-Token`; the browser does not send a bearer token. `Rewards` is always
`{account:null,grants:[]}`.

## Mutation protocol

Each mutation first claims `(user, operation, path, key)` in a short SQL
transaction. The claim stores a payload hash and a lease token. Groq evaluation
runs after that transaction has committed. Finalization receives the lease
token and expected session version, so a stale worker cannot commit after a
lease recovery or a competing mutation. A successful response is retained for
replay; a same-key/different-payload request is `IDEMPOTENCY_CONFLICT`, and an
active claim is `REQUEST_IN_PROGRESS`.

The injected repository is deterministic and is used by the local handler
tests. Production uses `SupabaseSessionRepository` and the named `spark_*`
RPC boundary. Claim functions are included in migration
`20261031000500_learning_idempotency_claims.sql`; the complete session read,
start, finalize, advance, and end RPCs are in
`20261031000600_learning_session_rpc.sql`. Applying these migrations to a
hosted project and running PostgREST/Auth integration tests remains an
explicit deployment step because this workspace has no Supabase credentials.

The seven non-mutating tutor reads are implemented by
`20261031000700_read_models_rpc.sql`; see
[session-persistence-matrix.md](./session-persistence-matrix.md) for their
operation-to-RPC and authorization mapping.

See [session-persistence-matrix.md](./session-persistence-matrix.md) for the
operation-to-SQL trace and verification status.

## Lifecycle invariants

`answering` accepts an initial answer; `clarification` accepts only a new
answer referencing the latest unresolved attempt; `feedback` accepts only
`advanceSession`; and all three active phases accept `endSession`. Graded
attempts increment `answeredCount` once, update mastery and review scheduling,
and preserve misconception evidence. Clarification does none of those things.
`advanceSession` creates the terminal summary only after the final feedback;
`endSession` abandons without grading drafts, completing revisions, or making a
summary, while preserving prior graded feedback.

