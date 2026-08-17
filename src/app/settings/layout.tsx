import Link from "next/link";
import { redirect } from "next/navigation";

import CreateFirstOrganizationForm from "@/components/saas/CreateFirstOrganizationForm";
import OrgSwitcher from "@/components/saas/OrgSwitcher";
import SaasLogoutButton from "@/components/saas/SaasLogoutButton";
import { getTenantContext, listMyOrganizations } from "@/lib/saas/tenant-context";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const NAV_ITEMS = [
  { href: "/settings/organization", label: "Organization" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/workspaces", label: "Workspaces" },
  { href: "/settings/activity", label: "Activity" },
  { href: "/settings/audit", label: "Audit" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/sessions", label: "Sessions" },
  { href: "/settings/profile", label: "Profile" },
  // Phase 18 Milestone 2 — account-level, individual-user Stripe billing
  // (Job Seeker / Recruiter plans) — distinct from the header's own
  // "Billing" link above, which is the existing organization/team
  // billing area (/billing). Labeled "My Billing" specifically to avoid
  // the two being confused for the same feature.
  { href: "/settings/billing", label: "My Billing" },
];

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/settings/organization");
  }

  const [context, organizations] = await Promise.all([getTenantContext(), listMyOrganizations()]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <Link href="/settings/organization" className="text-xl font-bold text-slate-900">
              Settings
            </Link>
            <p className="text-xs text-slate-500">Organizations, teams, and workspaces</p>
          </div>

          <div className="flex items-center gap-4">
            {organizations.length > 0 && <OrgSwitcher organizations={organizations} currentOrgId={context?.organizationId ?? null} />}
            <span className="hidden text-sm text-slate-600 md:inline">{user.email}</span>
            <Link href="/billing" className="text-sm font-medium text-blue-600">
              Billing
            </Link>
            <Link href="/" className="text-sm font-medium text-blue-600">
              Website
            </Link>
            <SaasLogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {organizations.length === 0 ? (
          <div className="mx-auto mb-6 max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-2xl font-bold text-slate-900">Create your first organization</h2>
            <p className="mt-2 text-sm text-slate-600">
              You&apos;re not a member of any organization yet. Create one to start inviting your team and managing
              workspaces — or manage your account security and profile below in the meantime.
            </p>
            <CreateFirstOrganizationForm />
          </div>
        ) : !context ? (
          <div className="mx-auto mb-6 max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm">
            <h2 className="text-xl font-bold text-amber-900">This organization is suspended</h2>
            <p className="mt-2 text-sm text-amber-800">
              The organization you last had active is suspended. Switch to another organization above, or ask the
              owner to reactivate it.
            </p>
          </div>
        ) : null}

        {/* Security/Sessions/Profile are account-level and stay reachable regardless of organization state; Organization/Team/Workspaces/Activity/Audit are org-scoped and handle a missing organization gracefully on their own. */}
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
