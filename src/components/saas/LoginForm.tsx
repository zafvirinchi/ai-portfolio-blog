"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { signInWithOAuth } from "@/lib/auth/oauth-service";
import { OAUTH_PROVIDERS, OAuthProviderId } from "@/lib/auth/auth-schema";

const PROVIDER_LABELS: Record<OAuthProviderId, string> = {
  google: "Google",
  azure: "Microsoft",
  github: "GitHub",
  linkedin_oidc: "LinkedIn",
};

type Step = "credentials" | "mfa-choice" | "mfa-totp" | "mfa-email" | "mfa-backup";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createSupabaseBrowserClient();
  const redirectTo = searchParams.get("redirect") || "/settings/organization";

  const [step, setStep] = useState<Step>("credentials");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoOpen, setSsoOpen] = useState(false);
  const [ssoDomain, setSsoDomain] = useState("");

  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);

  function finish() {
    router.push(redirectTo);
    router.refresh();
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email"));
    const password = String(formData.get("password"));

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Login failed");
      }

      if (data.mfaRequired) {
        setFactorId(data.factorId);
        setChallengeId(data.challengeId);
        setStep("mfa-totp");
        return;
      }

      finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function verifyMfa(endpoint: string, body: Record<string, unknown>) {
    setError("");
    setLoading(true);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, trustDevice }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Verification failed");
      }

      finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleTotpVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId) return;
    await verifyMfa("/api/auth/mfa/totp/verify", { factorId, challengeId, code, context: "login" });
  }

  async function handleEmailCode() {
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/mfa/email/send", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to send code");
      setChallengeId(data.challengeId);
      setStep("mfa-email");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await verifyMfa("/api/auth/mfa/email/verify", { challengeId, code });
  }

  async function handleBackupVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await verifyMfa("/api/auth/mfa/backup-codes/verify", { code });
  }

  async function handleOAuth(provider: OAuthProviderId) {
    setError("");
    const { error: oauthError } = await signInWithOAuth(supabase, provider, redirectTo);
    if (oauthError) setError(oauthError.message);
  }

  async function handleSso(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/sso/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: ssoDomain }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "SSO is not available for this domain yet.");
      }

      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "SSO initiation failed");
      setLoading(false);
    }
  }

  if (step === "mfa-totp" || step === "mfa-email" || step === "mfa-backup") {
    return (
      <div className="mt-8 space-y-5">
        {step === "mfa-totp" && (
          <form onSubmit={handleTotpVerify} className="space-y-4">
            <p className="text-sm text-slate-600">Enter the 6-digit code from your authenticator app.</p>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              maxLength={6}
              required
              placeholder="123456"
              className="w-full rounded-xl border px-4 py-3 tracking-widest"
            />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={trustDevice} onChange={(event) => setTrustDevice(event.target.checked)} />
              Trust this device for 30 days
            </label>
            <button type="submit" disabled={loading} className="w-full rounded-xl bg-blue-600 px-5 py-3 font-medium text-white disabled:opacity-50">
              {loading ? "Verifying..." : "Verify"}
            </button>
          </form>
        )}

        {step === "mfa-email" && (
          <form onSubmit={handleEmailVerify} className="space-y-4">
            <p className="text-sm text-slate-600">Enter the 6-digit code we emailed you (check the server console — no mail provider is configured for this demo).</p>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              maxLength={6}
              required
              placeholder="123456"
              className="w-full rounded-xl border px-4 py-3 tracking-widest"
            />
            <button type="submit" disabled={loading} className="w-full rounded-xl bg-blue-600 px-5 py-3 font-medium text-white disabled:opacity-50">
              {loading ? "Verifying..." : "Verify"}
            </button>
          </form>
        )}

        {step === "mfa-backup" && (
          <form onSubmit={handleBackupVerify} className="space-y-4">
            <p className="text-sm text-slate-600">Enter one of your unused backup codes.</p>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
              placeholder="XXXXX-XXXXX"
              className="w-full rounded-xl border px-4 py-3 tracking-widest"
            />
            <button type="submit" disabled={loading} className="w-full rounded-xl bg-blue-600 px-5 py-3 font-medium text-white disabled:opacity-50">
              {loading ? "Verifying..." : "Verify"}
            </button>
          </form>
        )}

        <div className="flex justify-between text-xs text-slate-500">
          <button type="button" onClick={() => setStep("mfa-totp")} className="hover:underline">
            Authenticator app
          </button>
          <button type="button" onClick={handleEmailCode} className="hover:underline">
            Email me a code
          </button>
          <button type="button" onClick={() => setStep("mfa-backup")} className="hover:underline">
            Use a backup code
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-5">
      <form onSubmit={handleLogin} className="space-y-5">
        <input name="email" type="email" required placeholder="Email" className="w-full rounded-xl border px-4 py-3" />
        <input name="password" type="password" required placeholder="Password" className="w-full rounded-xl border px-4 py-3" />

        <div className="text-right text-xs">
          <a href="/forgot-password" className="text-blue-600 hover:underline">
            Forgot password?
          </a>
        </div>

        <button type="submit" disabled={loading} className="w-full rounded-xl bg-blue-600 px-5 py-3 font-medium text-white disabled:opacity-50">
          {loading ? "Logging in..." : "Log In"}
        </button>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      <div className="flex items-center gap-3 text-xs text-slate-400">
        <div className="h-px flex-1 bg-slate-200" />
        or continue with
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {OAUTH_PROVIDERS.map((provider) => (
          <button
            key={provider}
            type="button"
            onClick={() => handleOAuth(provider)}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {PROVIDER_LABELS[provider]}
          </button>
        ))}
      </div>

      <button type="button" onClick={() => setSsoOpen((open) => !open)} className="text-xs text-slate-500 hover:underline">
        {ssoOpen ? "Hide enterprise SSO" : "Sign in with enterprise SSO"}
      </button>

      {ssoOpen && (
        <form onSubmit={handleSso} className="flex gap-2">
          <input
            value={ssoDomain}
            onChange={(event) => setSsoDomain(event.target.value)}
            placeholder="yourcompany.com"
            required
            className="flex-1 rounded-xl border px-3 py-2 text-sm"
          />
          <button type="submit" disabled={loading} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
            Continue
          </button>
        </form>
      )}
    </div>
  );
}
