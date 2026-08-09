import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "../supabase/admin";
import { createSupabaseRouteClient } from "../supabase-server";

import { LOCKOUT_POLICY, SignOutScope } from "./auth-schema";
import * as auditAuth from "./audit-auth";
import { LoginResult, PersonalDataExport } from "./auth-types";
import { listFactors, challengeTotp, isTrustedDevice, TRUSTED_DEVICE_COOKIE_NAME } from "./mfa-service";
import { recordPasswordChange } from "./password-service";
import { AUTH_SESSION_COOKIE_NAME } from "./session-service";
import * as sessionService from "./session-service";
import { checkLoginLockout, recordLoginAttempt, detectSuspiciousLogin, extractIp, extractUserAgent } from "./security-service";

const LOG_PREFIX = "[auth]";
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  };
}

/** Completes login bookkeeping once we're sure the user is fully authenticated (no MFA pending). Shared by login() and every MFA-verify route. */
export async function finalizeLogin(req: Request, userId: string): Promise<void> {
  const ip = extractIp(req);
  const ua = extractUserAgent(req);

  const session = await sessionService.record(userId, ip, ua);

  const cookieStore = await cookies();
  cookieStore.set(AUTH_SESSION_COOKIE_NAME, session.id, sessionCookieOptions());

  await detectSuspiciousLogin(userId, ip, ua);
  await auditAuth.record(req, { action: "Login Success", userId });
  console.log(`${LOG_PREFIX} Login Success`, { userId });
}

export async function login(req: Request, email: string, password: string): Promise<LoginResult> {
  const lockout = await checkLoginLockout(email);

  if (lockout.locked) {
    console.log(`${LOG_PREFIX} Login Failed`, { email, reason: "locked_out" });
    return { success: false, mfaRequired: false, error: `Too many failed attempts. Try again in ${LOCKOUT_POLICY.loginWindowMinutes} minutes.` };
  }

  const supabase = await createSupabaseRouteClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  await recordLoginAttempt(email, Boolean(data.user) && !error);

  if (error || !data.user) {
    console.log(`${LOG_PREFIX} Login Failed`, { email });
    return { success: false, mfaRequired: false, error: error?.message ?? "Invalid credentials" };
  }

  const cookieStore = await cookies();
  const trustedCookie = cookieStore.get(TRUSTED_DEVICE_COOKIE_NAME)?.value;
  const trusted = await isTrustedDevice(data.user.id, trustedCookie);

  const factors = await listFactors(supabase);
  const totpFactor = factors.find((factor) => factor.type === "totp" && factor.status === "verified");

  if (totpFactor && !trusted) {
    const challengeId = await challengeTotp(supabase, totpFactor.id);
    return { success: true, mfaRequired: true, factorId: totpFactor.id, challengeId };
  }

  await finalizeLogin(req, data.user.id);

  return { success: true, mfaRequired: false };
}

export interface RegisterResult {
  success: boolean;
  needsConfirmation: boolean;
  error?: string;
}

export async function register(req: Request, email: string, password: string): Promise<RegisterResult> {
  const supabase = await createSupabaseRouteClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { success: false, needsConfirmation: false, error: error.message };
  }

  if (!data.user) {
    return { success: false, needsConfirmation: false, error: "Registration failed" };
  }

  await recordPasswordChange(data.user.id, password);
  console.log(`${LOG_PREFIX} Register`, { userId: data.user.id });

  if (!data.session) {
    return { success: true, needsConfirmation: true };
  }

  await finalizeLogin(req, data.user.id);

  return { success: true, needsConfirmation: false };
}

export async function logout(req: Request, scope: SignOutScope): Promise<void> {
  const supabase = await createSupabaseRouteClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const cookieStore = await cookies();
  const currentSessionId = cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value ?? null;

  const { error } = await supabase.auth.signOut({ scope });

  if (error) {
    throw new Error(error.message);
  }

  if (user) {
    if (scope === "others" || scope === "global") {
      await sessionService.revokeOthers(user.id, scope === "global" ? null : currentSessionId);
    }

    if (scope === "local" || scope === "global") {
      if (currentSessionId) {
        await sessionService.revoke(currentSessionId);
      }
      cookieStore.delete(AUTH_SESSION_COOKIE_NAME);
    }

    await auditAuth.record(req, { action: "Logout", userId: user.id });
    console.log(`${LOG_PREFIX} Logout`, { userId: user.id, scope });
  }
}

export async function resendVerification(supabase: SupabaseClient, email: string): Promise<void> {
  const { error } = await supabase.auth.resend({ type: "signup", email });

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteAccount(userId: string): Promise<void> {
  const { data: ownedOrgs } = await supabaseAdmin.from("organizations").select("id, name").eq("owner_id", userId).neq("status", "deleted");

  if (ownedOrgs && ownedOrgs.length > 0) {
    throw new Error(`Transfer ownership or delete these organizations first: ${ownedOrgs.map((org) => org.name).join(", ")}`);
  }

  await Promise.all([
    supabaseAdmin.from("auth_sessions").delete().eq("user_id", userId),
    supabaseAdmin.from("trusted_devices").delete().eq("user_id", userId),
    supabaseAdmin.from("mfa_backup_codes").delete().eq("user_id", userId),
    supabaseAdmin.from("mfa_email_challenges").delete().eq("user_id", userId),
    supabaseAdmin.from("password_history").delete().eq("user_id", userId),
    supabaseAdmin.from("security_alerts").delete().eq("user_id", userId),
    supabaseAdmin.from("organization_members").delete().eq("user_id", userId),
    supabaseAdmin.from("workspace_members").delete().eq("user_id", userId),
  ]);

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (error) {
    throw new Error(
      `Account deletion failed (${error.message}). This can happen if your account has organization history (invitations sent, workspaces created) that still references it.`
    );
  }

  console.log(`${LOG_PREFIX} Account Deleted`, { userId });
}

export async function exportPersonalData(userId: string): Promise<PersonalDataExport> {
  const { data: userData, error } = await supabaseAdmin.auth.admin.getUserById(userId);

  if (error || !userData.user) {
    throw new Error(error?.message ?? "User not found");
  }

  const [{ data: memberships }, sessions, auditEvents] = await Promise.all([
    supabaseAdmin.from("organization_members").select("organization_id, role_key").eq("user_id", userId),
    sessionService.list(userId, null),
    auditAuth.list(userId, 200),
  ]);

  const metadata = (userData.user.user_metadata as Record<string, unknown> | undefined) ?? {};

  return {
    profile: {
      id: userData.user.id,
      email: userData.user.email ?? null,
      createdAt: userData.user.created_at ?? null,
      displayName: typeof metadata.display_name === "string" ? metadata.display_name : null,
    },
    organizations: (memberships ?? []).map((row) => ({ organizationId: row.organization_id, role: row.role_key })),
    sessions,
    auditEvents,
    exportedAt: new Date().toISOString(),
  };
}
