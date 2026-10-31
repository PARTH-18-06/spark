# Authentication and onboarding

Spark uses backend-managed sessions. The browser never receives a Supabase
access or refresh token and does not use bearer authentication or localStorage.
It sends same-origin `/api/v1` requests with `credentials: "include"`.

## Lifecycle

- Sign-in validates an explicitly allowed `Origin`, validates the strict v1.1.0
  body, consumes a PostgreSQL-backed rate-limit attempt, and calls Supabase Auth
  with a new non-persisting client.
- The backend verifies the returned access token with `auth.getUser(token)` and
  loads roles/display names/profile from server-controlled tables.
- The browser cookie is a random opaque handle. It is HttpOnly, SameSite=Lax,
  Path=/, and Secure whenever configured or served over HTTPS. Provider tokens
  and the CSRF value are encrypted at rest with AES-256-GCM; only hashes are
  used for lookup/comparison.
- `GET /auth/me` verifies the provider user on every authenticated request. An
  expiring access token is refreshed using the stored refresh token, and the
  rotated provider tokens remain server-side. Invalid sessions become the
  documented anonymous state and clear the cookie. Provider outages return a
  retryable contract error instead of pretending the user is anonymous.
- Authenticated mutations require an allowed Origin plus the CSRF header whose
  SHA-256 hash matches that session. A new login creates a new CSRF value.
- Sign-out invokes Supabase’s server-side local-session invalidation, revokes
  the backend row, and clears the cookie with matching attributes. An already
  anonymous sign-out remains an empty 204.

The implementation follows the installed Supabase JS SDK’s server guidance:
[server-side auth](https://supabase.com/docs/guides/auth/server-side),
[creating a server client](https://supabase.com/docs/guides/auth/server-side/creating-a-client),
[refreshSession](https://supabase.com/docs/reference/javascript/auth-refreshsession),
and [signOut](https://supabase.com/docs/reference/javascript/auth-signout).

## Required environment

The four auth routes require these values at request time, not module import or
build time:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AUTH_ALLOWED_ORIGINS`
- `AUTH_TOKEN_ENCRYPTION_KEY` (32 random bytes, base64 encoded)
- `AUTH_RATE_LIMIT_SECRET` (at least 32 random characters)

Cookie name/security, backend TTL, refresh skew, limiter thresholds, and trusted
proxy behavior have explicit placeholders/defaults in `.env.example`. Keep
`AUTH_TRUST_PROXY=false` unless the deployment proxy replaces forwarding
headers. The limiter state lives in PostgreSQL, so enforcement is shared across
application instances. It always limits an HMAC of normalized email and, when
trusted proxy addressing is enabled, also limits an HMAC of the client-address
bucket. Successful sign-in clears those keys.

## Authorization and onboarding

Roles come only from `user_roles`; browser-supplied IDs or roles are rejected by
strict schemas. `save_student_profile` verifies the provisioned student role
and atomically updates `user_directory` plus `student_profiles`. This keeps
student, profile, and teacher-facing display names aligned. Teacher-only users
remain valid with `studentProfile=null` and cannot call the profile update.

Reusable guards cover authentication, student/teacher roles, completed
onboarding, assigned classes, and assigned rosters. The latter guards are ready
for the remaining teacher routes but do not make those routes implemented.

## Verification boundary

Handler tests use injected in-memory provider/store doubles and exercise all
four route behaviors without credentials. Database migration tests execute the
real SQL in PGlite. Neither is a live Supabase Auth/PostgREST check. Once an
isolated project is configured, run real sign-in, refresh, persistence,
permission, and sign-out probes before claiming live integration.
