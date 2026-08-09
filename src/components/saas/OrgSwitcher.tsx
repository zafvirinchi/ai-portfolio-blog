"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MemberRole } from "@/lib/saas/organization-schema";
import type { Organization } from "@/lib/saas/organization-types";

type Props = {
  organizations: { organization: Organization; role: MemberRole }[];
  currentOrgId: string | null;
};

export default function OrgSwitcher({ organizations, currentOrgId }: Props) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  async function handleSwitch(organizationId: string) {
    if (organizationId === currentOrgId) return;

    setSwitching(true);

    try {
      await fetch("/api/saas/organizations/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });

      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  return (
    <select
      value={currentOrgId ?? ""}
      onChange={(event) => handleSwitch(event.target.value)}
      disabled={switching}
      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
    >
      {organizations.map(({ organization }) => (
        <option key={organization.id} value={organization.id}>
          {organization.name}
        </option>
      ))}
    </select>
  );
}
