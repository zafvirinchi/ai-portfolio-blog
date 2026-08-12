import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase-server";

// Phase 16 Milestone 2 — the Recruiter Workspace now owns data
// per-recruiter (candidates, active JD), so it can no longer stay
// publicly reachable the way Phase 13 Milestone 8 originally shipped
// it. Mirrors admin/layout.tsx's own redirect-if-signed-out pattern;
// covers both /recruiter and /recruiter/candidates/[candidateId] since
// this layout wraps the whole route segment.
export default async function RecruiterLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/recruiter");
  }

  return <>{children}</>;
}
