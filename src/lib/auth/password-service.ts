import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "../supabase/admin";

import { PASSWORD_POLICY } from "./auth-schema";

const SCRYPT_KEY_LENGTH = 64;
const LOG_PREFIX = "[auth]";

/** Node's built-in scrypt KDF — no new dependency. Format: "<saltHex>:<hashHex>". */
export function hashSecret(secret: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(secret, salt, SCRYPT_KEY_LENGTH);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifySecret(secret: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(secret, salt, SCRYPT_KEY_LENGTH);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Same rules as auth-schema.ts's passwordSchema, exposed as a violation list for live UI feedback (rather than a single pass/fail). */
export function getPolicyViolations(password: string): string[] {
  const violations: string[] = [];

  if (password.length < PASSWORD_POLICY.minLength) {
    violations.push(`At least ${PASSWORD_POLICY.minLength} characters`);
  }
  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) {
    violations.push("An uppercase letter");
  }
  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) {
    violations.push("A lowercase letter");
  }
  if (PASSWORD_POLICY.requireNumber && !/[0-9]/.test(password)) {
    violations.push("A number");
  }
  if (PASSWORD_POLICY.requireSpecialChar && !/[^A-Za-z0-9]/.test(password)) {
    violations.push("A special character");
  }

  return violations;
}

/**
 * Throws if newPassword matches any of the user's last N password hashes.
 * Never sees or stores the plaintext beyond this call. Fails OPEN (logs,
 * skips the check) if the lookup itself fails — e.g. password_history not
 * migrated yet — rather than blocking password change/reset/registration
 * entirely over a secondary hygiene check. The only throw that remains is
 * a genuine reuse match, unaffected by this.
 */
export async function checkHistory(userId: string, newPassword: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("password_history")
    .select("password_hash")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(PASSWORD_POLICY.historyLimit);

  if (error) {
    console.error(`${LOG_PREFIX} Password history lookup failed, skipping reuse check`, error);
    return;
  }

  for (const row of data ?? []) {
    if (verifySecret(newPassword, row.password_hash)) {
      throw new Error(`This password was used recently. Choose one you haven't used in your last ${PASSWORD_POLICY.historyLimit} passwords.`);
    }
  }
}

/**
 * Records a password-history bookkeeping row — never the real password
 * itself (Supabase Auth already owns that). Fails OPEN (logs, returns)
 * rather than throwing: this is pure bookkeeping for the reuse/expiration
 * checks above, and must never block registration or a password change
 * that Supabase Auth has already genuinely completed.
 */
export async function recordPasswordChange(userId: string, newPassword: string): Promise<void> {
  const { error } = await supabaseAdmin.from("password_history").insert({ user_id: userId, password_hash: hashSecret(newPassword) });

  if (error) {
    console.error(`${LOG_PREFIX} Password history record failed, continuing without recording this change`, error);
  }
}

export async function isExpired(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("password_history")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return false; // no recorded change yet (e.g. pre-milestone account) — nothing to expire against

  const ageDays = (Date.now() - new Date(data.created_at).getTime()) / (24 * 60 * 60 * 1000);
  return ageDays > PASSWORD_POLICY.expirationDays;
}
