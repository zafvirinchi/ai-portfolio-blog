// Phase 18 Milestone 3 originally added its own isAdmin() check here,
// since the outer /admin/layout.tsx only verified a session existed at
// the time (documented gap, see that file's own history). Phase 18
// Milestone 4, Step 2 fixed the outer layout to enforce isAdmin() for
// the entire /admin/** tree, which now always runs first — Next.js
// renders parent layouts before nested ones, so no request reaches this
// file without already being confirmed ADMIN. Re-checking here would be
// a second, redundant role-resolution call for the same request
// (explicitly to avoid, per that milestone's own instructions) with no
// safety benefit, so only this file's layout/spacing wrapper remains.
export default function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}
