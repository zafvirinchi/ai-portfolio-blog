import { supabaseAdmin } from "../supabase/admin";

import { AuditLogEntry } from "./organization-types";
import { getTenantContext } from "./tenant-context";

const LOG_PREFIX = "[organization]";

export interface AuditRecordInput {
  action: string;
  objectType?: string | null;
  objectId?: string | null;
  /** Pass explicitly when the caller already knows these (e.g. right
   * after creating an organization, before any membership/cookie
   * exists to resolve via getTenantContext()). Omit to auto-resolve. */
  organizationId?: string | null;
  userId?: string | null;
}

function extractIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

/** Security-relevant SaaS action logging (design decision 7) — scoped to this milestone's own new routes only. */
export async function record(req: Request, input: AuditRecordInput): Promise<void> {
  try {
    let organizationId = input.organizationId ?? null;
    let userId = input.userId ?? null;

    if (organizationId === null && userId === null) {
      const context = await getTenantContext();
      organizationId = context?.organizationId ?? null;
      userId = context?.userId ?? null;
    }

    const { error } = await supabaseAdmin.from("audit_logs").insert({
      organization_id: organizationId,
      user_id: userId,
      action: input.action,
      object_type: input.objectType ?? null,
      object_id: input.objectId ?? null,
      ip_address: extractIp(req),
      user_agent: req.headers.get("user-agent"),
    });

    if (error) {
      throw new Error(error.message);
    }

    console.log(`${LOG_PREFIX} Audit Recorded`, { action: input.action, objectType: input.objectType, objectId: input.objectId });
  } catch (error) {
    console.error(`${LOG_PREFIX} Audit logging failed`, error);
  }
}

export async function list(organizationId: string, limit = 50): Promise<AuditLogEntry[]> {
  const { data, error } = await supabaseAdmin
    .from("audit_logs")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}
