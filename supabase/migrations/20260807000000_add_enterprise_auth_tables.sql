-- Phase 14 Milestone 2 — Enterprise Authentication
--
-- Upgrades authentication itself: MFA (TOTP/email-OTP/backup codes/
-- trusted devices), account lockout + brute-force protection, password
-- history/expiration, session visibility, and suspicious-login
-- detection. RBAC continues to be sourced entirely from Milestone 1's
-- organization_roles/organization_members (protected, not touched or
-- duplicated here). The [auth] audit trail (Login Success, Password
-- Changed, MFA Enabled, ...) reuses Milestone 1's existing audit_logs
-- table as-is (no DDL against it here) — its organization_id/user_id
-- columns are already nullable and its action/object_type/ip_address/
-- user_agent columns are already generic enough for auth events.
--
-- Identity is still Supabase Auth's own auth.users — every user_id
-- column below references it directly, same as every table in the
-- prior migration.
--
-- No RLS on any of these tables, consistent with every existing table
-- in this project: all reads/writes go through the service-role
-- supabaseAdmin client, and enforcement is entirely application-level
-- (src/lib/auth/security-service.ts, password-service.ts, mfa-service.ts).
--
-- This repo has no migration tooling — run this file manually once in
-- the Supabase SQL Editor for this project. Safe to re-run (every
-- statement is if-not-exists).

-- ---------------------------------------------------------------------------
-- security_events — generic rate-limit hook, generalizes the exact
-- reserve-before-work shape job_match_requests already established
-- (see 20260803000000_add_job_match_rate_limit.sql), reused here for
-- login attempts, password-reset requests, and OTP requests instead of
-- one table per feature.
-- ---------------------------------------------------------------------------

create table if not exists security_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('login_attempt', 'password_reset_request', 'otp_request')),
  key text not null,
  success boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists security_events_key_idx on security_events (event_type, key, created_at desc);

comment on table security_events is
  'Generic rate-limit/lockout hook. One row per attempt; key is an email or IP depending on event_type. Checked via security-service.ts checkRateLimit() before the real action runs.';

-- ---------------------------------------------------------------------------
-- security_alerts — suspicious-login detections (new IP/user-agent
-- combination for a user, compared against their own auth_sessions
-- history).
-- ---------------------------------------------------------------------------

create table if not exists security_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  alert_type text not null,
  description text not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists security_alerts_user_idx on security_alerts (user_id, created_at desc);

comment on table security_alerts is
  'Heuristic security alerts (e.g. "new device/location") surfaced on /settings/security. Not a full ML system — a first-seen IP/user-agent check against auth_sessions.';

-- ---------------------------------------------------------------------------
-- auth_sessions — our own lightweight session record (device/IP/browser
-- visibility), independent of Supabase's internal session store, which
-- isn't queryable via supabase-js. One row per login.
-- ---------------------------------------------------------------------------

create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists auth_sessions_user_idx on auth_sessions (user_id, created_at desc);

comment on table auth_sessions is
  'One row per login, for the Active Sessions UI. last_seen_at is touched (at most every 5 minutes) by middleware.ts. Real remote logout only supports the two scopes Supabase itself exposes (local/others) — see mfa-service.ts and /settings/sessions for the exact behavior this backs.';

-- ---------------------------------------------------------------------------
-- trusted_devices — "remember this device" for MFA: after a successful
-- MFA verification, an HMAC-signed cookie is issued and mirrored here
-- so the user can see/revoke it later.
-- ---------------------------------------------------------------------------

create table if not exists trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  device_token_hash text not null,
  label text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists trusted_devices_user_idx on trusted_devices (user_id);
create index if not exists trusted_devices_hash_idx on trusted_devices (device_token_hash);

comment on table trusted_devices is
  'Only the HMAC hash of the device token is stored, never the raw cookie value. A valid, unexpired match lets mfa-service.ts skip the MFA challenge on a subsequent login.';

-- ---------------------------------------------------------------------------
-- mfa_backup_codes — one-time-use recovery codes generated at TOTP
-- enrollment time.
-- ---------------------------------------------------------------------------

create table if not exists mfa_backup_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mfa_backup_codes_user_idx on mfa_backup_codes (user_id);

comment on table mfa_backup_codes is
  'Only the hash of each backup code is stored. used_at is set the first time a code is redeemed; a used code can never be redeemed again.';

-- ---------------------------------------------------------------------------
-- mfa_email_challenges — email-OTP as a second factor. Supabase's own
-- MFA framework only natively supports TOTP, so this is built the same
-- way every real-but-unconfigured-delivery feature in this project is
-- (see organization_invitations): a real code with a real expiry,
-- "sent" via console.log since no mail provider exists here.
-- ---------------------------------------------------------------------------

create table if not exists mfa_email_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  code_hash text not null,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mfa_email_challenges_user_idx on mfa_email_challenges (user_id, created_at desc);

comment on table mfa_email_challenges is
  'Only the hash of the 6-digit code is stored. Expiry is enforced on read (10 minutes), same lazy-expiry discipline as organization_invitations.';

-- ---------------------------------------------------------------------------
-- password_history — prevents immediate password reuse.
-- ---------------------------------------------------------------------------

create table if not exists password_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  password_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists password_history_user_idx on password_history (user_id, created_at desc);

comment on table password_history is
  'Scrypt hash of each password ever set, checked by password-service.ts checkHistory() (last 5) before allowing a change. Never stores the plaintext password.';
