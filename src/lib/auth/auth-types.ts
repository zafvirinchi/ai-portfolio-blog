import { MfaFactorType, OAuthProviderId, SecurityAlertType, SecurityEventType } from "./auth-schema";

// Non-schema row/wrapper types — mirrors src/lib/saas/organization-types.ts's
// role relative to organization-schema.ts.

export interface AuthSession {
  id: string;
  user_id: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  is_current: boolean;
}

export interface SecurityAlert {
  id: string;
  user_id: string;
  alert_type: SecurityAlertType | string;
  description: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface SecurityEventRow {
  id: string;
  event_type: SecurityEventType;
  key: string;
  success: boolean;
  created_at: string;
}

// device_token_hash is intentionally omitted here — routes never
// return the raw or hashed token to the client, only this metadata.
export interface TrustedDeviceSummary {
  id: string;
  label: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  last_used_at: string;
  expires_at: string;
}

export interface PasswordHistoryEntry {
  id: string;
  user_id: string;
  password_hash: string;
  created_at: string;
}

// Resolved server-side from the Supabase auth session directly
// (independent of organization membership, unlike saas/TenantContext,
// so it resolves for a logged-in user who hasn't joined an org yet).
export interface AuthContext {
  userId: string;
  email: string | null;
  sessionId: string | null;
  mfaVerified: boolean;
}

export interface LoginResult {
  success: boolean;
  mfaRequired: boolean;
  factorId?: string;
  challengeId?: string;
  error?: string;
  /** Present only once fully authenticated (mfaRequired: false, success: true) — the RECRUITER-vs-JOB_SEEKER default landing page (persona-service.ts's resolveDefaultLandingPath()), absent an explicit ?redirect=. */
  defaultLandingPath?: string;
}

export interface MfaEnrollResult {
  factorId: string;
  qrCodeSvg: string;
  secret: string;
  uri: string;
}

export interface MfaEmailChallengeResult {
  challengeId: string;
  expiresAt: string;
}

export interface SecurityOverview {
  recentLogins: AuthSession[];
  alerts: SecurityAlert[];
  failedLoginAttempts24h: number;
}

export interface LinkedIdentity {
  id: string;
  provider: OAuthProviderId | string;
  createdAt: string | null;
}

export interface EnrolledMfaFactor {
  id: string;
  type: MfaFactorType;
  status: "verified" | "unverified";
  createdAt: string;
}

export interface PersonalDataExport {
  profile: { id: string; email: string | null; createdAt: string | null; displayName: string | null };
  organizations: { organizationId: string; role: string }[];
  sessions: AuthSession[];
  auditEvents: unknown[];
  exportedAt: string;
}
