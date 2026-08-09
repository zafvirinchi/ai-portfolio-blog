import { organizationService } from "@/lib/saas/organization-service";
import { supabaseAdmin } from "@/lib/supabase/admin";

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

export default async function AdminSaasPage() {
  const organizations = await organizationService.listAll();

  const [{ count: workspaceCount }, { count: ragDocsCount }, { count: ragChunksCount }, { count: activityCount }, { count: auditCount }, { data: memberRows }, { data: recentActivity }] =
    await Promise.all([
      supabaseAdmin.from("workspaces").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("rag_documents").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("rag_document_chunks").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("activity_logs").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("audit_logs").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("organization_members").select("user_id"),
      supabaseAdmin.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(10),
    ]);

  const distinctUsers = new Set((memberRows ?? []).map((row) => row.user_id)).size;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">SaaS Platform Overview</h1>
        <p className="mt-1 text-sm text-slate-500">Every organization on this platform — the site owner&apos;s own god-view.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Organizations" value={organizations.length} />
        <StatCard label="Users" value={distinctUsers} />
        <StatCard label="Workspaces" value={workspaceCount ?? 0} />
        <StatCard label="Storage Used (approx.)" value={`${(ragDocsCount ?? 0) + (ragChunksCount ?? 0)} rows`} />
        <StatCard label="AI Usage (approx.)" value={`${activityCount ?? 0} events`} />
        <StatCard label="API Usage (approx.)" value={`${(activityCount ?? 0) + (auditCount ?? 0)} calls`} />
      </div>

      <p className="text-xs text-slate-400">
        Storage/AI/API Usage are approximations derived from existing row counts (knowledge-base documents/chunks and
        activity/audit log entries) — this project has no real usage-metering system yet; genuine metering is future
        work tied to billing (see the milestone documentation).
      </p>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Organizations</h2>
        </div>
        {organizations.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No organizations created yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Slug</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {organizations.map((org) => (
                <tr key={org.id}>
                  <td className="px-5 py-3 font-semibold text-slate-900">{org.name}</td>
                  <td className="px-5 py-3 text-slate-600">{org.slug}</td>
                  <td className="px-5 py-3 text-slate-600">{org.status}</td>
                  <td className="px-5 py-3 text-slate-600">{new Date(org.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Recent Activity</h2>
        </div>
        {!recentActivity || recentActivity.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No activity recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recentActivity.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>
                  <span className="font-semibold text-slate-800">{entry.activity_type}</span> — {entry.description}
                </span>
                <span className="text-xs text-slate-400">{new Date(entry.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
