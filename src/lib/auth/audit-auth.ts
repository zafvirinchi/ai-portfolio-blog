import { supabaseAdmin } from "../supabase/admin";

import { extractIp, extractUserAgent } from "./security-service";

// Reuses Milestone 1's audit_logs table as-is (organization_id/user_id
// are already nullable, action/object_type/ip_address/user_agent are
// already generic) rather than a new table — confirmed with the user.
// organization_id is always null for [auth] events; the org-scoped
// /settings/audit page (src/lib/saas/audit-service.ts) queries by
// organization_id and never sees these rows.
import type { AuditLogEntry } from "../saas/organization-types";

const LOG_PREFIX = "[auth]";

export interface AuthAuditInput {
  action: string;
  userId: string;
  objectType?: string | null;
  objectId?: string | null;
}

export async function record(req: Request, input: AuthAuditInput): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("audit_logs").insert({
      organization_id: null,
      user_id: input.userId,
      action: input.action,
      object_type: input.objectType ?? null,
      object_id: input.objectId ?? null,
      ip_address: extractIp(req),
      user_agent: extractUserAgent(req),
    });

    if (error) {
      throw new Error(error.message);
    }

    console.log(`${LOG_PREFIX} ${input.action}`, { userId: input.userId });
  } catch (error) {
    console.error(`${LOG_PREFIX} Audit logging failed`, error);
  }
}

/** Fails OPEN (logs, returns an empty list) rather than throwing — matches record()'s own already-correct behavior above. */
export async function list(userId: string, limit = 50): Promise<AuditLogEntry[]> {
  const { data, error } = await supabaseAdmin
    .from("audit_logs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`${LOG_PREFIX} Audit list failed, returning empty`, error);
    return [];
  }

  return data ?? [];
}
