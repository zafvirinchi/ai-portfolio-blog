import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { analyticsService } from "@/lib/analytics";
import { analyticsExportQuerySchema, resolveDateRange } from "@/lib/analytics/analytics-schema";
import { requireAdminRoute } from "@/lib/billing/admin-api-guard";

export async function GET(req: Request) {
  try {
    const guard = await requireAdminRoute();
    if (!guard.ok) return guard.response;

    const url = new URL(req.url);
    const parsed = analyticsExportQuerySchema.parse({
      range: url.searchParams.get("range") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      table: url.searchParams.get("table"),
    });

    const range = resolveDateRange(parsed);
    let rows: Record<string, string | number | null>[] = [];

    switch (parsed.table) {
      case "revenue": {
        const revenue = await analyticsService.getRevenue(range);
        rows = revenue.revenueTrend.map((row) => ({ date: row.date, gross_cents: row.grossCents, refunds_cents: row.refundsCents }));
        break;
      }
      case "subscriptions": {
        const subscriptions = await analyticsService.getSubscriptions(range);
        rows = [
          { metric: "active_subscriptions", value: subscriptions.activeSubscriptions },
          { metric: "trials", value: subscriptions.trials },
          { metric: "cancellations_in_range", value: subscriptions.cancellationsInRange },
          { metric: "expired_subscriptions", value: subscriptions.expiredSubscriptions },
          { metric: "free", value: subscriptions.byPlan.free },
          { metric: "professional", value: subscriptions.byPlan.professional },
          { metric: "premium", value: subscriptions.byPlan.premium },
          { metric: "enterprise", value: subscriptions.byPlan.enterprise },
        ];
        break;
      }
      case "ai-usage": {
        const aiUsage = await analyticsService.getAIUsage(range);
        rows = aiUsage.byFeature.map((row) => ({ feature: row.feature, requests: row.requests, credits: row.credits, tokens: row.tokens, estimated_cost_cents: row.estimatedCostCents }));
        break;
      }
      case "users": {
        const topUsers = await analyticsService.getTopUsers(range, 500);
        rows = topUsers.map((row) => ({
          user_id: row.userId,
          email: row.email,
          organization_id: row.organizationId,
          organization_name: row.organizationName,
          plan_key: row.planKey,
          ai_requests: row.aiRequests,
          credits_used: row.creditsUsed,
          last_activity: row.lastActivity,
        }));
        break;
      }
      case "organizations": {
        const organizations = await analyticsService.getOrganizations(range);
        rows = organizations.topOrganizations.map((row) => ({
          organization_id: row.organizationId,
          organization_name: row.organizationName,
          plan_key: row.planKey,
          seats: row.seats,
          active_users: row.activeUsers,
          ai_credits_used: row.aiCreditsUsed,
          estimated_ai_cost_cents: row.estimatedAiCostCents,
          usage_percent: row.usagePercent,
          last_activity: row.lastActivity,
        }));
        break;
      }
    }

    const csv = analyticsService.toCsv(rows);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${parsed.table}-${range.from.toISOString().slice(0, 10)}-to-${range.to.toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid export request" }, { status: 400 });
    }

    console.error("[analytics] Export API route failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Export failed" }, { status: 401 });
  }
}
