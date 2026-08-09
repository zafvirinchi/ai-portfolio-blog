"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { AuthSession } from "@/lib/auth/auth-types";

export default function SessionsSettingsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/sessions");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load sessions");
      setSessions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function logoutThisDevice() {
    setBusy("local");
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "local" }),
    });
    router.push("/login");
    router.refresh();
  }

  async function logoutOtherDevices() {
    setBusy("others");
    setError(null);

    try {
      const response = await fetch("/api/auth/sessions/revoke-others", { method: "POST" });
      if (!response.ok) throw new Error((await response.json()).error || "Failed to revoke other sessions");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke other sessions.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;

  return (
    <div className="space-y-6">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={logoutThisDevice}
          disabled={busy === "local"}
          className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Logout This Device
        </button>
        <button
          onClick={logoutOtherDevices}
          disabled={busy === "others" || sessions.length <= 1}
          className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          Logout All Other Devices
        </button>
      </div>

      <p className="text-xs text-slate-400">
        Supabase Auth only supports revoking &quot;this device&quot; or &quot;every other device&quot; as a group — there is no
        way to remotely sign out one specific other session individually, so entries below are shown for visibility rather than
        individually revocable.
      </p>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {sessions.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No active sessions.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sessions.map((session) => (
              <li key={session.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <span className="font-semibold text-slate-800">{session.ip_address ?? "Unknown IP"}</span>{" "}
                  <span className="text-slate-500">{(session.user_agent ?? "Unknown device").slice(0, 60)}</span>
                  {session.is_current && <span className="ml-2 text-xs font-semibold text-green-600">this device</span>}
                </div>
                <span className="text-xs text-slate-400">last active {new Date(session.last_seen_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
