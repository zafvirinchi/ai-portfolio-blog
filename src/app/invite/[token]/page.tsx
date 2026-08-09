import { redirect } from "next/navigation";

import InviteActions from "@/components/saas/InviteActions";
import { membershipService } from "@/lib/saas/membership-service";
import { organizationService } from "@/lib/saas/organization-service";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type Params = {
  params: Promise<{ token: string }>;
};

export default async function InvitePage({ params }: Params) {
  const { token } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/invite/${token}`);
  }

  const invitation = await membershipService.getInvitationByToken(token);

  if (!invitation) {
    return (
      <section className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Invitation not found</h1>
        <p className="mt-2 text-sm text-slate-600">This invite link is invalid or has already been used.</p>
      </section>
    );
  }

  const organization = await organizationService.get(invitation.organization_id);

  return (
    <section className="mx-auto max-w-md px-6 py-20">
      <h1 className="text-2xl font-bold text-slate-900">You&apos;ve been invited</h1>

      <p className="mt-3 text-slate-600">
        {organization?.name ?? "An organization"} has invited you to join as <strong>{invitation.role_key}</strong>.
      </p>

      <p className="mt-1 text-xs text-slate-400">Status: {invitation.status}</p>

      <InviteActions token={token} status={invitation.status} />
    </section>
  );
}
