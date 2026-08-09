import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "../supabase/admin";

import { PASSWORD_POLICY } from "./auth-schema";

const SCRYPT_KEY_LENGTH = 64;

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

/** Throws if newPassword matches any of the user's last N password hashes. Never sees or stores the plaintext beyond this call. */
export async function checkHistory(userId: string, newPassword: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("password_history")
    .select("password_hash")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(PASSWORD_POLICY.historyLimit);

  if (error) {
    throw new Error(error.message);
  }

  for (const row of data ?? []) {
    if (verifySecret(newPassword, row.password_hash)) {
      throw new Error(`This password was used recently. Choose one you haven't used in your last ${PASSWORD_POLICY.historyLimit} passwords.`);
    }
  }
}

export async function recordPasswordChange(userId: string, newPassword: string): Promise<void> {
  const { error } = await supabaseAdmin.from("password_history").insert({ user_id: userId, password_hash: hashSecret(newPassword) });

  if (error) {
    throw new Error(error.message);
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
