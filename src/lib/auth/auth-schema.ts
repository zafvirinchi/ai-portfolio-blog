import { z } from "zod";

// Phase 14 Milestone 2. Snake_case kept verbatim throughout (matching
// src/lib/saas/organization-schema.ts's established convention for
// this project) rather than a camelCase mapping layer.

// Subset of supabase-js's own Provider union — the 4 the spec names
// (Azure = Microsoft's OIDC provider id in Supabase Auth).
export const OAUTH_PROVIDERS = ["google", "azure", "github", "linkedin_oidc"] as const;
export type OAuthProviderId = (typeof OAUTH_PROVIDERS)[number];

// "totp" is Supabase's own native MFA factor type. "email" and
// "backup_code" are second-factor mechanisms this milestone builds
// itself (Supabase's MFA framework doesn't natively support them).
export const MFA_FACTOR_TYPES = ["totp", "email", "backup_code"] as const;
export type MfaFactorType = (typeof MFA_FACTOR_TYPES)[number];

// Matches supabase-js's own SIGN_OUT_SCOPES exactly.
export const SIGN_OUT_SCOPES = ["local", "others", "global"] as const;
export type SignOutScope = (typeof SIGN_OUT_SCOPES)[number];

// Matches the security_events.event_type check constraint.
export const SECURITY_EVENT_TYPES = ["login_attempt", "password_reset_request", "otp_request"] as const;
export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

export const SECURITY_ALERT_TYPES = ["new_device", "new_location_ip"] as const;
export type SecurityAlertType = (typeof SECURITY_ALERT_TYPES)[number];

// Password policy — Supabase Auth itself only configures a bare
// minimum length; composition rules and history/expiration are
// enforced entirely in password-service.ts using this config.
export const PASSWORD_POLICY = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecialChar: true,
  historyLimit: 5,
  expirationDays: 90,
} as const;

// Rate-limit thresholds security-service.ts's checkRateLimit() enforces.
export const LOCKOUT_POLICY = {
  maxFailedLoginAttempts: 5,
  loginWindowMinutes: 15,
  maxPasswordResetRequests: 3,
  passwordResetWindowMinutes: 60,
  maxOtpRequests: 5,
  otpWindowMinutes: 15,
} as const;

export const passwordSchema = z
  .string()
  .min(PASSWORD_POLICY.minLength, `Password must be at least ${PASSWORD_POLICY.minLength} characters`)
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[0-9]/, "Password must contain a number")
  .regex(/[^A-Za-z0-9]/, "Password must contain a special character");

// ---------------------------------------------------------------------------
// API request-body validation schemas.
// ---------------------------------------------------------------------------

export const registerSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional().default(false),
});

export const logoutSchema = z.object({
  scope: z.enum(SIGN_OUT_SCOPES).default("local"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  newPassword: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const resendVerificationSchema = z.object({
  email: z.string().email(),
});

export const mfaTotpVerifySchema = z.object({
  factorId: z.string().min(1),
  challengeId: z.string().min(1).optional(),
  code: z.string().length(6),
  context: z.enum(["enroll", "login"]).default("login"),
  trustDevice: z.boolean().optional().default(false),
});

export const mfaTotpUnenrollSchema = z.object({
  factorId: z.string().min(1),
});

export const mfaEmailSendSchema = z.object({});

export const mfaEmailVerifySchema = z.object({
  challengeId: z.string().min(1),
  code: z.string().length(6),
  trustDevice: z.boolean().optional().default(false),
});

export const mfaBackupCodeVerifySchema = z.object({
  code: z.string().min(1),
  trustDevice: z.boolean().optional().default(false),
});

export const ssoInitiateSchema = z.object({
  domain: z.string().min(1),
});

export const profileUpdateSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
});
