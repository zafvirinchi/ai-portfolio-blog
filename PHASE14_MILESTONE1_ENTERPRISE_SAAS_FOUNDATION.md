# Phase 14 Milestone 1 — Enterprise SaaS Foundation

## Goal

Convert the application from a single-user portfolio/AI-features demo
into a true multi-tenant SaaS platform: Organizations, Workspaces,
Teams, RBAC, invitations, activity/audit logging, and a platform-wide
admin dashboard — all additive, none of it touching any protected
Phase 9-13 service (`ConversationService`, LangGraph, Planner,
PortfolioChain, Knowledge Pipeline, Resume Parser, ATS Engine, Resume
Optimizer, Resume Rewrite, JD Engine, Interview Preparation, Mock
Interview, Recruiter Workspace, Recruitment Pipeline, Knowledge
Base/Manager) or any table those services already use.

This is the first milestone in this project's whole arc to introduce
**real persistence** (every Phase 13 milestone was pure in-memory,
process-local `Map` state) and **real user identity** outside the
single hardcoded `/admin` content-CMS login.

## Architecture

```
Supabase Auth (auth.users)
        │
        ▼
tenant-context.ts  getTenantContext()
  session (cookie) + active_org_id (cookie, first-write in this repo)
        │
        ▼
TenantContext { userId, email, organizationId, role, permissions }
        │
        ├─► organization-service.ts   create/rename/suspend/delete/
        │                              reactivate/transferOwnership
        ├─► workspace-service.ts      create/update/archive/reactivate/delete
        ├─► membership-service.ts     members (org + workspace) + invitations
        ├─► team-service.ts           read-oriented roster aggregation
        ├─► permission-service.ts     DB-backed RBAC checks
        ├─► activity-service.ts       feature-usage log (8 existing routes)
        └─► audit-service.ts          security-relevant admin-action log
```

Every one of the 8 new tables (`organizations`, `organization_roles`,
`organization_members`, `organization_invitations`, `workspaces`,
`workspace_members`, `activity_logs`, `audit_logs`) is accessed
exclusively through the service-role `supabaseAdmin` client — **no
RLS**, matching every existing table in this project. Permission
enforcement is 100% application-level, via `permission-service.ts` and
each API route's own `requirePermission()` call.

## Multi-tenant design

Identity is Supabase Auth's own `auth.users` — there is still no
`users`/`profiles` table. `getTenantContext()` resolves the current
organization from the `active_org_id` cookie, falling back to the
user's first active membership if the cookie is missing, stale, or
points at an org the user no longer belongs to. **A suspended or
deleted organization blocks every member, including its owner** — this
is checked inside `getTenantContext()` itself, so the block is
impossible to bypass from any route that calls it. The one deliberate
exception is `.../reactivate`, which cannot use `getTenantContext()`
(it would permanently lock the owner out of undoing their own
suspension) — it checks `organization_members` directly instead.

"Switch organization without logout" is `POST
/api/saas/organizations/switch {organizationId}` — verifies real
membership first, then sets the `active_org_id` cookie and the client
calls `router.refresh()`. No `middleware.ts` was introduced (none
exists in this repo); the auth gate lives in `src/app/settings/layout.tsx`,
the same pattern `admin/layout.tsx` already established for the
site-owner CMS login.

## RBAC

Eight roles (Owner, Admin, Recruiter, Hiring Manager, HR, Interviewer,
Candidate, Viewer) × eight permissions (Manage Users, Manage Billing,
Manage Candidates, Manage Jobs, Manage Interviews, Manage Knowledge,
Manage Resume Analysis, Manage AI Credits). Unlike a static
permissions matrix, `organization_roles` is a **real per-organization
table** — seeded from `DEFAULT_ROLE_PERMISSIONS` at organization-creation
time, then independently editable per org afterward via `PATCH
/api/saas/organizations/[orgId]/roles`. `permission-service.ts`'s
`hasPermission()` always reads that org's own DB row (falling back to
the built-in default only if the row is somehow missing) — so an
org's own admin genuinely controls what each role in *their*
organization can do, not just a hardcoded global default.

## Workspace model

Each organization can own multiple workspaces (e.g. "Engineering
Hiring", "Campus Hiring", "AI Recruitment", "Internal Mobility").
Workspace membership is independent of org-level role — a user is an
org member first, then optionally added to specific workspaces with
their own `role_key`. Workspaces are archived (soft-deleted, can be
reactivated) or hard-deleted; both go through the same `setStatus()`
pattern `organization-service.ts` uses.

## Invitations

`membershipService.invite()` creates a real `organization_invitations`
row with a real `token` (`gen_random_uuid()`) and 7-day expiry, lazily
marked `expired` on read past that window (the same "purge on read"
discipline every prior milestone's in-memory TTL used, applied here to
a real DB row instead of a `Map`). **Email delivery is out of scope**
— no mail provider exists in this project (`api/contact/route.ts` only
`console.log`s). The invite API returns a shareable `acceptUrl`
(`/invite/[token]`) for the inviter to copy/send manually instead.

## Activity logging

`activity-service.ts`'s `record()` is a pure no-op whenever there's no
resolvable tenant context — true for every anonymous request, which is
all of them today, since none of the public AI feature pages require
login. It's wired into 8 existing route files with a minimal,
non-blocking, try/caught call added after each operation succeeds:

| Route | Activity type |
|---|---|
| `api/ai/resume/route.ts` | Resume Uploaded |
| `api/ai/recruiter/candidates/import/route.ts` | Candidate Added |
| `api/ai/recruitment/jobs/route.ts` | Job Created |
| `api/admin/rag-documents/route.ts` | Knowledge Uploaded |
| `api/ai/recruitment/interviews/route.ts` | Interview Scheduled |
| `api/ai/cover-letter/route.ts` | Cover Letter Generated |
| `api/ai/linkedin/route.ts` | LinkedIn Optimized |
| `api/ai/resume-rewriter/route.ts` | Resume Rewritten |

None of these routes' existing request/response shape changed —
anonymous usage of every AI feature remains completely unaffected.

## Audit logging

Scoped strictly to this milestone's own SaaS actions (organization
create/rename/suspend/delete/reactivate/ownership-transfer, member
add/role-change/remove, workspace create/archive/delete, invitation
create/accept/reject/revoke) — never wired into the 8 AI routes above,
per the spec's own two-section split (Activity Log = feature usage,
Audit Log = security-relevant admin actions). Each entry captures
user, timestamp, IP (`x-forwarded-for`/`x-real-ip`), browser
(User-Agent), action, and object. `audit-service.ts`'s `record()`
never throws — a failure to write an audit row is logged and
swallowed, never blocking the action it's auditing.

## Admin dashboard

`/admin/saas` lives inside the existing, already-gated `/admin` area
(reusing `admin/layout.tsx` as-is) rather than introducing a new auth
surface — it's the site owner's own god-view over every organization.
Storage Used / AI Usage / API Usage are explicitly labeled
**"(approx.)"**, derived from existing row counts
(`rag_documents`/`rag_document_chunks`/`activity_logs`/`audit_logs`) —
this project has no real usage-metering system, and building one is
called out below as future work tied to billing.

## Chat integration

Unlike every prior milestone's `xMode`/`xId` `ChatBox` prop,
organization context is **never client-supplied**. `/api/ai/chat/route.ts`
calls `getTenantContext()` itself on every request and, if it resolves,
wraps the whole existing tool chain in
`organizationRequestContext.run({organizationId, userId, role}, ...)`.
`resume.tool.ts` gets one new branch, checked first (an intent-keyword
regex gate, so it never intercepts unrelated questions), answering "who
uploaded/created/scheduled/generated/optimized/rewrote/imported/added
X", "show hiring activity", and "show activity yesterday/today/this
week" from real `activity_logs` data — resolving the acting user's
email via `team-service.ts`'s `resolveEmail()`. Every request without a
resolvable tenant context behaves exactly as before this milestone.

## What real testing found (and fixed)

1. **Next.js dynamic-route collision (crash, caught immediately on
   dev-server start).** `src/app/api/saas/invitations/[id]/revoke/route.ts`
   sat alongside `src/app/api/saas/invitations/[token]/...` — three
   sibling routes using `[token]`, one using `[id]`, at the same path
   depth. Next.js requires the same dynamic-segment name across all
   sibling routes and refuses to build otherwise
   (`You cannot use different slug names for the same dynamic path`).
   **Fixed** by moving revoke to
   `api/saas/organizations/[orgId]/invitations/[id]/revoke/route.ts` —
   which is also more correct: it now verifies the invitation actually
   belongs to `orgId` (via `listInvitations(orgId)`) before revoking,
   closing a latent cross-tenant gap where any org admin who guessed
   another org's invitation id could have revoked it. Updated the one
   frontend caller (`settings/organization/page.tsx`'s `handleRevoke`)
   to the new URL shape. Re-verified clean via `npx tsc --noEmit`,
   `npm run lint`, and a full `npm run build` afterward.
2. **PostgREST schema-cache staleness on the live Supabase project
   (write path only).** After the user ran the migration, `SELECT`
   queries against all 8 new tables succeeded immediately, but
   `INSERT` failed with `PGRST205: Could not find the table
   'public.organizations' in the schema cache` — confirmed via a
   direct `supabase-js` insert test, isolated from application code.
   This is a known Supabase/PostgREST behavior: the schema cache can
   lag behind a DDL change made through the SQL Editor until it's
   manually reloaded (Project Settings → API → "Reload schema", or
   Table Editor → open any table). I have no tool in this environment
   to run raw SQL or trigger that reload myself (confirmed earlier in
   this milestone — no Supabase CLI/MCP available), so a full write-path
   HTTP walkthrough (sign up → create org → invite → accept →
   RBAC-gated action → activity log entry) is the one verification
   step **not yet completed**. Everything else — 8-table migration
   (schema confirmed present via read queries), the full `src/lib/saas/`
   service layer, every `/api/saas/*` route, all UI pages, chat
   integration, `npx tsc --noEmit`, `npm run lint`, and `npm run
   build` — is verified clean.

**Next step for the user:** reload the Supabase project's PostgREST
schema cache (Project Settings → API → "Reload schema" button is the
fastest path), after which every write path should work immediately —
the application code itself required no changes for this, since it was
never the bug.

## Known limitations

- No billing/metering system — Storage/AI/API Usage on `/admin/saas`
  are honest approximations from row counts, not real metering.
- No email delivery — invitations produce a real, real-expiring token
  and shareable link, but nothing sends it; the inviter must copy/send
  the link manually.
- Activity Log only starts populating once a user is logged in with an
  active organization; every prior milestone's anonymous, no-login
  usage pattern is untouched and still the default experience.
- RBAC permissions are enforced application-level only (no RLS),
  matching every existing table in this project — a bug in a route's
  own `requirePermission()` call is the only thing standing between a
  request and the data, exactly as it already was for every other
  table before this milestone.

## Future billing integration

`organization_roles`' one currently-unused permission (`Manage AI
Credits`) and the `/admin/saas` dashboard's explicitly-labeled
approximate usage counters are the two seams intended for a future
billing phase: a real metering table (per-org token/request counts,
replacing the `activity_logs`/`rag_*` row-count approximation), a
plan/quota concept on `organizations`, and enforcement hooks in
`permission-service.ts` (e.g. blocking `Manage AI Credits`-gated
actions once a quota is exhausted) — none of which exists yet, by
design, since billing was explicitly out of scope for this milestone.
