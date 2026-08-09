# Phase 14 Milestone 2 — Enterprise Authentication

## Goal

Upgrade authentication itself into an enterprise-grade platform: MFA
(TOTP/email-OTP/backup codes/trusted devices), OAuth, enterprise SSO
(code-ready), account lockout and brute-force protection, password
policy/history/expiration, real session visibility and control, a
security dashboard, and an `[auth]` audit trail — entirely additive.
Identity remains Supabase Auth (never replaced); RBAC remains sourced
entirely from Milestone 1's `organization_roles`/`organization_members`
(never duplicated).

## Architecture

```
Supabase Auth (auth.users) — still the sole identity authority
        │
        ▼
src/proxy.ts  (Next.js 16 renamed "Middleware" to "Proxy" — see below)
  refreshes the session cookie on every navigation via createServerClient
        │
        ▼
permission-service.ts  getAuthContext()
  session (cookie) + AAL (aal1/aal2, from supabase.auth.mfa.getAuthenticatorAssuranceLevel())
        │
        ▼
AuthContext { userId, email, sessionId, mfaVerified }
        │
        ├─► auth-service.ts       login/register/logout/deleteAccount/exportPersonalData
        ├─► session-service.ts    auth_sessions CRUD (Active Sessions UI)
        ├─► security-service.ts   lockout, rate-limit hooks, CSRF, suspicious-login detection
        ├─► password-service.ts   policy, history (scrypt), expiration
        ├─► mfa-service.ts        TOTP (native) + email-OTP/backup-codes/trusted-devices (built)
        ├─► oauth-service.ts      signInWithOAuth wrapper (4 providers)
        ├─► sso-service.ts        signInWithSSO wrapper (code-ready)
        ├─► rbac-service.ts       thin delegation to saas/permission-service.ts + tenant-context.ts
        └─► audit-auth.ts         [auth] events into Milestone 1's audit_logs table
```

7 new tables, no RLS (matches every existing table): `security_events`,
`security_alerts`, `auth_sessions`, `trusted_devices`,
`mfa_backup_codes`, `mfa_email_challenges`, `password_history`.
`audit_logs` (Milestone 1's, protected) is reused as-is for `[auth]`
events with `organization_id: null` — no DDL against it.

## A note on `src/proxy.ts`

This project's `AGENTS.md` warns that this Next.js version has breaking
changes from training data. That warning was directly relevant here:
**Next.js 16 deprecated `middleware.ts` and renamed it to `proxy.ts`**
(exporting a function named `proxy`, not `middleware`), confirmed via
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`
before writing any code. `src/proxy.ts` is the first Proxy file in this
repo. Its only job is refreshing the Supabase session cookie — it fixes
a real pre-existing gap: `src/lib/supabase-server.ts`'s
`createSupabaseServerClient()` has a documented cookie-write no-op
(Server Components/layouts can't write cookies), so a server-refreshed
token was previously never persisted back to the browser. A new,
additive `createSupabaseRouteClient()` was added alongside it (the
original function is untouched) for the Route Handlers that need a real
cookie write — login, register, logout, MFA verification, and the
OAuth/SSO/recovery callback. Proxy defaults to the **Node.js runtime**
in this Next.js version (not Edge), so no runtime restrictions applied
to anything written here.

## Authentication flow

`POST /api/auth/login` — checks `security-service.checkLoginLockout()`
(5 failed attempts / 15 minutes, via the new `security_events` table,
generalizing the exact reserve-before-work pattern
`src/lib/ai/job-match/rate-limiter.ts` already established) → calls
`supabase.auth.signInWithPassword()` via `createSupabaseRouteClient()`
→ records the attempt → checks for a trusted-device cookie and a
verified TOTP factor; if both a factor exists and the device isn't
trusted, returns `{mfaRequired: true, factorId, challengeId}` instead
of finishing the login. Otherwise `auth-service.ts`'s `finalizeLogin()`
runs: records an `auth_sessions` row, runs
`security-service.detectSuspiciousLogin()` (new IP/user-agent vs. that
user's own history → `security_alerts`), and writes `[auth] Login
Success` to `audit_logs`.

`POST /api/auth/register` seeds a `password_history` baseline (so
history/expiration checks have something to compare against
immediately) and otherwise mirrors `login`'s finalize step when no
email confirmation is required.

OAuth (Google/Microsoft via `azure`/GitHub/LinkedIn) and Enterprise SSO
both land on `src/app/auth/callback/route.ts` (the standard Supabase
Next.js redirect target), which exchanges the PKCE `code` via
`exchangeCodeForSession()` and then also calls `finalizeLogin()` — OAuth
and SSO logins are treated as already strongly authenticated by the
external IdP, so no additional TOTP challenge is layered on top, unlike
the email+password path.

## Session management

`auth_sessions` is this app's own lightweight session record — one row
per login — since Supabase's internal session store isn't queryable
through `supabase-js`. The `auth_session_id` cookie (same
httpOnly/sameSite=lax/secure/path conventions as Milestone 1's
`active_org_id` cookie) points at which row is "this device." `src/proxy.ts`
calls `session-service.touch()` on every navigation, which only writes
when the row is more than 5 minutes stale — cheap enough to run on
every request.

**Logout is honestly scoped to what Supabase actually supports**:
`signOut({scope})` only offers `local` (this device), `others` (every
other device), or `global` (everywhere). There is no API to target one
specific *other* session — so `/settings/sessions` offers "Logout This
Device" and "Logout All Other Devices" as the two real actions; other
listed sessions are shown for visibility, not individually revocable.
This is documented in the UI itself, not silently faked.

A password change or reset always calls `signOut({scope: "others"})` —
a strong, real security behavior: your other devices are logged out the
moment your password changes.

## JWT strategy

Supabase Auth is already this app's JWT issuer, verifier, and
refresh-rotation system — `jwt-service.ts` does **not** implement a
parallel JWT system. It only decodes (never verifies) the current
session's own access-token payload via a plain base64url decode, for
display purposes (security dashboard, expiry checks). Verification
happens exactly where it already did: inside Supabase's own API, every
time the token is actually used.

## Refresh token design

Before this milestone, a refreshed token had nowhere to go (the no-op
`setAll()` above). Two real fixes now exist: `src/proxy.ts` refreshes
the session on every page navigation, and `createSupabaseRouteClient()`
persists a fresh session immediately after any Route Handler that
establishes one (login, register, MFA verification, OAuth/SSO
callback). Token rotation itself is entirely Supabase Auth's own
mechanism — this milestone's job was making sure the *result* of that
rotation actually reaches the browser, not reimplementing rotation.

## RBAC

Unchanged from Milestone 1, by design. `rbac-service.ts` is a thin
re-export of `saas/tenant-context.ts` and `saas/permission-service.ts`
— no duplicate role/permission system. `permission-service.ts` (this
package's own file, distinct from `saas/permission-service.ts`) adds
route-guard helpers on top: `requireAuthContext()` and
`requireMfaVerified()`, the latter checking the session's AAL (via
`supabase.auth.mfa.getAuthenticatorAssuranceLevel()`) rather than
inventing a parallel "is MFA done" flag.

## MFA flow

**TOTP** is native Supabase Auth MFA (`auth.mfa.enroll/challenge/
verify/unenroll`) — Supabase itself generates the QR code SVG and
secret; no `otpauth`/`qrcode` dependency was needed. Enrollment
confirmation (`POST /api/auth/mfa/totp/verify` with `context: "enroll"`)
also generates 10 backup codes, shown exactly once.

**Email OTP** and **backup codes** are built from scratch, since
Supabase's MFA framework only natively supports TOTP (and phone).
Codes are scrypt-hashed (`password-service.ts`'s `hashSecret()`/
`verifySecret()`, Node's built-in `crypto.scryptSync` — no new
dependency) before storage; "sending" the email code is a
`console.log`, the same honest stub Milestone 1 used for invitation
delivery, since no mail provider is configured anywhere in this
project.

**Trusted devices**: after any successful MFA verification with
"trust this device" checked, an HMAC-style scrypt-hashed token is
issued as a 30-day cookie (`trusted_device`) and mirrored in the new
`trusted_devices` table for the user-visible "manage/revoke" list. A
valid, unexpired match on a later login skips the MFA challenge
entirely.

## Enterprise SSO

`sso-service.ts` calls Supabase's real `signInWithSSO({domain})` API —
this is genuinely wired, not a stub. What it depends on that this
environment cannot provide is **registering an SSO provider for a
domain**, which requires Supabase's `sso` CLI command (Management API)
— no CLI/MCP tool is available here, the same limitation already
established in Milestone 1 for running SQL migrations directly. This
matches the spec's own "SAML (future-ready architecture)" framing
exactly: the moment a provider is registered for a domain (Azure AD,
Google Workspace, Okta, Auth0 — all speak SAML/OIDC to Supabase the
same way), `/login`'s "Sign in with enterprise SSO" flow will work with
zero code changes.

## Security best practices applied

- **Account lockout / brute force**: 5 failed attempts per 15 minutes
  per email, enforced *before* calling Supabase's own auth API (so a
  lockout never even reaches Supabase).
- **Suspicious login detection**: a first-seen IP or user-agent for a
  user (compared against their own `auth_sessions` history) writes a
  `security_alerts` row — a heuristic, not a full ML system, and never
  blocks the login itself.
- **Password policy**: 8+ characters, upper/lower/number/special,
  enforced both client-side (live checklist) and server-side (Zod
  schema) — Supabase itself only configures a bare minimum length.
- **Password history**: last 5 passwords rejected on reuse, via scrypt
  hash comparison, never storing plaintext.
- **Password expiration**: 90-day default, checked against the most
  recent `password_history` row.
- **CSRF**: `security-service.verifySameOrigin()` checks Origin/Referer
  against Host on state-changing auth routes, combined with the
  existing SameSite=Lax cookie convention project-wide.
- **Rate-limit hooks**: `security-service.checkAndRecordRequestLimit()`
  generalizes the job-match rate limiter's reserve-before-work pattern
  for password-reset requests and OTP sends.
- **Anti-enumeration**: `/api/auth/forgot-password` never reveals
  whether an email is registered — it always returns success.

## Known limitations

- OAuth/SSO are real, working code paths that activate only once their
  respective provider credentials are configured outside this
  environment (Supabase dashboard for OAuth, Supabase CLI for SSO) —
  no code change will be needed when that happens.
- "Logout this one other device" isn't offered, because Supabase itself
  doesn't expose single-session targeting — only `local`/`others`/
  `global` scopes exist.
- Account deletion cleans up every table this milestone created plus
  Milestone 1's membership rows, but refuses if the user still owns an
  active organization (asks them to transfer ownership first) and can
  still fail on deeper Milestone 1 history (invitations sent, workspaces
  created) that has `NOT NULL` foreign keys to `auth.users` — surfaced
  as a clear error rather than a silent partial deletion.
- IP geolocation ("Location") is not implemented — no geolocation
  API/key is configured anywhere in this project; the security
  dashboard shows the raw IP address only, honestly, rather than
  faking a location.
- As with Milestone 1, this repo has no migration tooling — the new
  7-table migration (`supabase/migrations/20260807000000_add_enterprise_auth_tables.sql`)
  must be run manually in the Supabase SQL Editor before any of this
  milestone's features will work end-to-end; confirmed via a
  read+write probe against the live project that it had not been run
  yet as of this writing.

## Future enhancements

- Real usage-based billing enforcement on `Manage AI Credits`
  (Milestone 1 left this permission unused; `security-service.ts`'s
  rate-limit hooks are the natural place to add quota checks once a
  metering system exists).
- WebAuthn/Passkeys — supabase-js's MFA API already models a
  `webauthn` factor type; only enrollment/challenge UI is missing.
- Per-session remote logout, once/if Supabase Auth exposes
  single-session revocation.
- IP geolocation, if a geolocation provider is ever configured.
