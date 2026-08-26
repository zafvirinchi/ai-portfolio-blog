import Link from "next/link";
import { redirect } from "next/navigation";

import OrgSwitcher from "@/components/saas/OrgSwitcher";
import SaasLogoutButton from "@/components/saas/SaasLogoutButton";
import { getTenantContext, listMyOrganizations } from "@/lib/saas/tenant-context";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const NAV_ITEMS = [
  { href: "/billing", label: "Overview" },
  { href: "/billing/plans", label: "Plans" },
  { href: "/billing/usage", label: "AI Usage" },
  { href: "/billing/history", label: "Usage History" },
  { href: "/billing/invoices", label: "Invoices" },
];

// Same auth-gate/org-switcher pattern as src/app/settings/layout.tsx —
// billing is organization-scoped by design (Phase 14 Milestone 3
// decision 1), so this mirrors that layout's shape rather than nesting
// under /settings, matching the spec's own top-level /billing routes.
export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/billing");
  }

  const [context, organizations] = await Promise.all([getTenantContext(), listMyOrganizations()]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <Link href="/billing" className="text-xl font-bold text-slate-900">
              Billing
            </Link>
            <p className="text-xs text-slate-500">Plan, credits, invoices, and payment history</p>
          </div>

          <div className="flex items-center gap-4">
            {organizations.length > 0 && <OrgSwitcher organizations={organizations} currentOrgId={context?.organizationId ?? null} />}
            <span className="hidden text-sm text-slate-600 md:inline">{user.email}</span>
            <Link href="/settings/organization" className="text-sm font-medium text-blue-600">
              Settings
            </Link>
            <SaasLogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {organizations.length === 0 ? (
          <div className="mx-auto mb-6 max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">Create an organization first</h2>
            <p className="mt-2 text-sm text-slate-600">
              Billing is scoped to your organization. <Link href="/settings/organization" className="font-semibold text-blue-600">Create one</Link> to see plans and manage a subscription.
            </p>
            {/* Phase 23 Milestone 3 — audit finding: a JOB_SEEKER/RECRUITER
                looking for their OWN individual plan (not a team's) had no
                way to discover /settings/billing from here. */}
            <p className="mt-4 text-xs text-slate-500">
              Looking for your personal Job Seeker or Recruiter plan instead?{" "}
              <Link href="/settings/billing" className="font-semibold text-blue-600">
                Go to My Billing
              </Link>
              .
            </p>
          </div>
        ) : !context ? (
          <div className="mx-auto mb-6 max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm">
            <h2 className="text-xl font-bold text-amber-900">This organization is suspended</h2>
            <p className="mt-2 text-sm text-amber-800">Switch to another organization above, or ask the owner to reactivate it.</p>
          </div>
        ) : null}

        <nav className="mb-6 flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
              {item.label}
            </Link>
          ))}
        </nav>

        {children}
      </div>
    </div>
  );
}
