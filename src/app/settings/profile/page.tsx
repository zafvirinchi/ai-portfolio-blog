"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { OAUTH_PROVIDERS, OAuthProviderId } from "@/lib/auth/auth-schema";
import { signInWithOAuth, unlinkIdentity } from "@/lib/auth/oauth-service";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

interface ProfileData {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string | null;
  identities: { id: string; provider: string; createdAt: string | null }[];
}

const PROVIDER_LABELS: Record<OAuthProviderId, string> = {
  google: "Google",
  azure: "Microsoft",
  github: "GitHub",
  linkedin_oidc: "LinkedIn",
};

export default function ProfileSettingsPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/auth/profile");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load profile");
      setProfile(data);
      setDisplayName(data.displayName ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpdateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("profile");
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Update failed");
      setMessage("Profile updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("password");
    setError(null);
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const currentPassword = String(formData.get("currentPassword"));
    const newPassword = String(formData.get("newPassword"));

    try {
      const response = await fetch("/api/auth/password/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Password change failed");
      setMessage("Password changed. Other devices have been logged out.");
      event.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password change failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleLinkProvider(provider: OAuthProviderId) {
    setError(null);
    const { error: linkError } = await signInWithOAuth(supabase, provider, "/settings/profile");
    if (linkError) setError(linkError.message);
  }

  async function handleUnlinkProvider(identityId: string) {
    setBusy(identityId);
    setError(null);

    try {
      const { data } = await supabase.auth.getUserIdentities();
      const identity = data?.identities.find((entry) => entry.identity_id === identityId || entry.id === identityId);
      if (!identity) throw new Error("Identity not found");

      await unlinkIdentity(supabase, identity);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unlink account.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteAccount() {
    if (!window.confirm("Delete your account permanently? This cannot be undone.")) return;
    setBusy("delete");
    setError(null);

    try {
      const response = await fetch("/api/auth/profile", { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json()).error || "Account deletion failed");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Account deletion failed.");
      setBusy(null);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;
  if (!profile) return null;

  const linkedProviders = new Set(profile.identities.map((identity) => identity.provider));

  return (
    <div className="space-y-6">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">{message}</div>}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-700">Profile</h2>
        <p className="mb-3 text-xs text-slate-500">Email: {profile.email}</p>
        <form onSubmit={handleUpdateProfile} className="flex flex-wrap gap-2">
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Display name"
            className="min-w-[240px] flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy === "profile"}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Save
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-700">Change Password</h2>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <input name="currentPassword" type="password" required placeholder="Current password" className="w-full rounded-xl border px-4 py-2 text-sm" />
          <input name="newPassword" type="password" required placeholder="New password" className="w-full rounded-xl border px-4 py-2 text-sm" />
          <button
            type="submit"
            disabled={busy === "password"}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Change Password
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-700">Connected Accounts</h2>
        <div className="space-y-2">
          {OAUTH_PROVIDERS.map((provider) => {
            const identity = profile.identities.find((entry) => entry.provider === provider);
            return (
              <div key={provider} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                <span>{PROVIDER_LABELS[provider]}</span>
                {identity ? (
                  <button
                    onClick={() => handleUnlinkProvider(identity.id)}
                    disabled={busy === identity.id}
                    className="text-xs font-semibold text-red-600 hover:underline"
                  >
                    Unlink
                  </button>
                ) : (
                  <button onClick={() => handleLinkProvider(provider)} className="text-xs font-semibold text-blue-600 hover:underline">
                    Connect
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {linkedProviders.size === 0 && <p className="mt-2 text-xs text-slate-400">No accounts connected yet.</p>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-700">Your Data</h2>
        <a
          href="/api/auth/profile/export"
          className="inline-block rounded-xl border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Download Personal Data
        </a>
      </div>

      <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-red-700">Danger Zone</h2>
        <button
          onClick={handleDeleteAccount}
          disabled={busy === "delete"}
          className="rounded-xl bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          Delete Account
        </button>
      </div>
    </div>
  );
}
