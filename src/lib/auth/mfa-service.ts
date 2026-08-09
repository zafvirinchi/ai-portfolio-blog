import { randomBytes, randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "../supabase/admin";

import { hashSecret, verifySecret } from "./password-service";
import { EnrolledMfaFactor, MfaEmailChallengeResult, MfaEnrollResult, TrustedDeviceSummary } from "./auth-types";

const LOG_PREFIX = "[auth]";
const EMAIL_CHALLENGE_TTL_MS = 10 * 60 * 1000;
const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const BACKUP_CODE_COUNT = 10;

// -----------------------------------------------------------------------
// TOTP — native Supabase Auth MFA. Supabase itself generates the QR
// code image and secret; no otpauth/qrcode dependency needed. Every
// function here takes the caller's own SupabaseClient (server or
// browser) since enroll/challenge/verify/unenroll are all
// session-scoped operations, same pattern as oauth-service.ts.
// -----------------------------------------------------------------------

export async function enrollTotp(supabase: SupabaseClient): Promise<MfaEnrollResult> {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });

  if (error || !data) {
    throw new Error(error?.message ?? "TOTP enrollment failed");
  }

  return { factorId: data.id, qrCodeSvg: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri };
}

export async function challengeTotp(supabase: SupabaseClient, factorId: string): Promise<string> {
  const { data, error } = await supabase.auth.mfa.challenge({ factorId });

  if (error || !data) {
    throw new Error(error?.message ?? "TOTP challenge failed");
  }

  return data.id;
}

export async function verifyTotp(supabase: SupabaseClient, factorId: string, challengeId: string, code: string): Promise<void> {
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code });

  if (error) {
    throw new Error(error.message);
  }
}

export async function unenrollTotp(supabase: SupabaseClient, factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });

  if (error) {
    throw new Error(error.message);
  }
}

export async function listFactors(supabase: SupabaseClient): Promise<EnrolledMfaFactor[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();

  if (error) {
    throw new Error(error.message);
  }

  return (data?.all ?? []).map((factor) => ({
    id: factor.id,
    type: factor.factor_type as EnrolledMfaFactor["type"],
    status: factor.status,
    createdAt: factor.created_at,
  }));
}

// -----------------------------------------------------------------------
// Email OTP as a second factor. Supabase's MFA framework only natively
// supports TOTP (and phone), so this is built ourselves — a real code
// with a real 10-minute expiry, "sent" via console.log since no mail
// provider is configured anywhere in this project (same posture as
// Milestone 1's invitation links).
// -----------------------------------------------------------------------

export async function sendEmailChallenge(userId: string, email: string | null): Promise<MfaEmailChallengeResult> {
  const code = randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + EMAIL_CHALLENGE_TTL_MS).toISOString();

  const { data, error } = await supabaseAdmin
    .from("mfa_email_challenges")
    .insert({ user_id: userId, code_hash: hashSecret(code), expires_at: expiresAt })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  console.log(`${LOG_PREFIX} MFA email code for ${email ?? userId}: ${code} (expires ${expiresAt})`);

  return { challengeId: data.id, expiresAt };
}

export async function verifyEmailChallenge(challengeId: string, code: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("mfa_email_challenges").select("*").eq("id", challengeId).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.verified_at || new Date(data.expires_at).getTime() < Date.now()) {
    return false;
  }

  if (!verifySecret(code, data.code_hash)) {
    return false;
  }

  await supabaseAdmin.from("mfa_email_challenges").update({ verified_at: new Date().toISOString() }).eq("id", challengeId);

  return true;
}

// -----------------------------------------------------------------------
// Backup recovery codes — generated once at TOTP-enroll time, single use.
// -----------------------------------------------------------------------

function formatBackupCode(): string {
  return randomBytes(5).toString("hex").toUpperCase().match(/.{1,5}/g)!.join("-");
}

/** Returns the plaintext codes exactly once — only hashes are persisted. */
export async function generateBackupCodes(userId: string): Promise<string[]> {
  await supabaseAdmin.from("mfa_backup_codes").delete().eq("user_id", userId).is("used_at", null);

  const codes = Array.from({ length: BACKUP_CODE_COUNT }, formatBackupCode);
  const rows = codes.map((code) => ({ user_id: userId, code_hash: hashSecret(code) }));

  const { error } = await supabaseAdmin.from("mfa_backup_codes").insert(rows);

  if (error) {
    throw new Error(error.message);
  }

  return codes;
}

export async function verifyBackupCode(userId: string, code: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("mfa_backup_codes").select("id, code_hash").eq("user_id", userId).is("used_at", null);

  if (error) {
    throw new Error(error.message);
  }

  const match = (data ?? []).find((row) => verifySecret(code, row.code_hash));
  if (!match) return false;

  await supabaseAdmin.from("mfa_backup_codes").update({ used_at: new Date().toISOString() }).eq("id", match.id);

  return true;
}

// -----------------------------------------------------------------------
// Trusted devices — "remember this device for 30 days" after a
// successful MFA verification. Only the HMAC-style scrypt hash of the
// token is ever stored; the raw token lives only in an httpOnly cookie,
// same conventions (sameSite/secure/path) as saas/tenant-context.ts's
// active_org_id cookie.
// -----------------------------------------------------------------------

export const TRUSTED_DEVICE_COOKIE_NAME = "trusted_device";
export const TRUSTED_DEVICE_MAX_AGE_SECONDS = TRUSTED_DEVICE_TTL_MS / 1000;

export async function issueTrustedDevice(userId: string, ipAddress: string | null, userAgent: string | null): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TRUSTED_DEVICE_TTL_MS).toISOString();

  const { data, error } = await supabaseAdmin
    .from("trusted_devices")
    .insert({
      user_id: userId,
      device_token_hash: hashSecret(rawToken),
      ip_address: ipAddress,
      user_agent: userAgent,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return `${data.id}.${rawToken}`;
}

export async function isTrustedDevice(userId: string, cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;

  const [id, rawToken] = cookieValue.split(".");
  if (!id || !rawToken) return false;

  const { data } = await supabaseAdmin.from("trusted_devices").select("*").eq("id", id).eq("user_id", userId).maybeSingle();

  if (!data || new Date(data.expires_at).getTime() < Date.now()) return false;
  if (!verifySecret(rawToken, data.device_token_hash)) return false;

  await supabaseAdmin.from("trusted_devices").update({ last_used_at: new Date().toISOString() }).eq("id", id);

  return true;
}

export async function listTrustedDevices(userId: string): Promise<TrustedDeviceSummary[]> {
  const { data, error } = await supabaseAdmin
    .from("trusted_devices")
    .select("id, label, ip_address, user_agent, created_at, last_used_at, expires_at")
    .eq("user_id", userId)
    .order("last_used_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function revokeTrustedDevice(userId: string, deviceId: string): Promise<void> {
  const { error } = await supabaseAdmin.from("trusted_devices").delete().eq("id", deviceId).eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }
}
