import { supabaseAdmin } from "../supabase/admin";

import { ActivityType } from "./organization-schema";
import { ActivityLogEntry } from "./organization-types";
import { getTenantContext } from "./tenant-context";

const LOG_PREFIX = "[organization]";

export interface ActivityRecordOverrides {
  organizationId?: string | null;
  workspaceId?: string | null;
  userId?: string | null;
}

/**
 * Feature-usage logging (design decision 6). Never throws — every
 * caller, including the ~8 existing AI routes this is wired into, gets
 * a pure no-op on any failure or when there's no organization to
 * attribute the activity to (true for every anonymous request, which
 * is all of them today). Existing behavior of every prior milestone's
 * routes is completely unaffected by this function's presence.
 */
export async function record(
  type: ActivityType | string,
  description: string,
  metadata: Record<string, unknown> = {},
  overrides?: ActivityRecordOverrides
): Promise<void> {
  try {
    let organizationId = overrides?.organizationId ?? null;
    const workspaceId = overrides?.workspaceId ?? null;
    let userId = overrides?.userId ?? null;

    if (organizationId === null && userId === null) {
      const context = await getTenantContext();
      if (!context) return;

      organizationId = context.organizationId;
      userId = context.userId;
    }

    if (!organizationId) return;

    const { error } = await supabaseAdmin.from("activity_logs").insert({
      organization_id: organizationId,
      workspace_id: workspaceId,
      user_id: userId,
      activity_type: type,
      description,
      metadata,
    });

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Activity logging failed`, error);
  }
}

export interface ActivityListFilters {
  organizationId: string;
  activityType?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export async function list(filters: ActivityListFilters): Promise<ActivityLogEntry[]> {
  let query = supabaseAdmin
    .from("activity_logs")
    .select("*")
    .eq("organization_id", filters.organizationId)
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 50);

  if (filters.activityType) query = query.eq("activity_type", filters.activityType);
  if (filters.since) query = query.gte("created_at", filters.since);
  if (filters.until) query = query.lte("created_at", filters.until);

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}
