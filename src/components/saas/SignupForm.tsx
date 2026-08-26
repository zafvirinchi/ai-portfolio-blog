"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { signInWithOAuth } from "@/lib/auth/oauth-service";
import { OAUTH_PROVIDERS, OAuthProviderId, PASSWORD_POLICY } from "@/lib/auth/auth-schema";

const PROVIDER_LABELS: Record<OAuthProviderId, string> = {
  google: "Google",
  azure: "Microsoft",
  github: "GitHub",
  linkedin_oidc: "LinkedIn",
};

function policyChecklist(password: string) {
  return [
    { label: `At least ${PASSWORD_POLICY.minLength} characters`, met: password.length >= PASSWORD_POLICY.minLength },
    { label: "An uppercase letter", met: /[A-Z]/.test(password) },
    { label: "A lowercase letter", met: /[a-z]/.test(password) },
    { label: "A number", met: /[0-9]/.test(password) },
    { label: "A special character", met: /[^A-Za-z0-9]/.test(password) },
  ];
}

export default function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createSupabaseBrowserClient();
  // Phase 23 Milestone 5 — kept as the RAW explicit param, matching
  // LoginForm.tsx's identical fix: handleOAuth only ever forwards a
  // real, explicit redirect to /auth/callback, which computes its own
  // persona-aware default when absent.
  const explicitRedirect = searchParams.get("redirect") || undefined;

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [password, setPassword] = useState("");

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email"));

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Registration failed");
      }

      if (data.needsConfirmation) {
        setConfirmationSent(true);
        return;
      }

      // Phase 23 Milestone 5 — mirrors LoginForm.tsx's finish(): an
      // explicit ?redirect= always wins; absent one, use the server's
      // persona-aware default (always /resume-analyzer for a brand-new
      // signup today, since every account starts as JOB_SEEKER-only —
      // wired through now for consistency with every other completion
      // path, and to keep working correctly if that ever changes, e.g.
      // a pre-provisioned invite flow).
      router.push(searchParams.get("redirect") || data.defaultLandingPath || "/resume-analyzer");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: OAuthProviderId) {
    setError("");
    const { error: oauthError } = await signInWithOAuth(supabase, provider, explicitRedirect);
    if (oauthError) setError(oauthError.message);
  }

  if (confirmationSent) {
    return (
      <div className="mt-8 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        Check your email to confirm your account, then log in.
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-5">
      <form onSubmit={handleSignup} className="space-y-5">
        <input name="email" type="email" required placeholder="Email" className="w-full rounded-xl border px-4 py-3" />

        <div>
          <input
            name="password"
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            className="w-full rounded-xl border px-4 py-3"
          />
          <ul className="mt-2 space-y-1 text-xs">
            {policyChecklist(password).map((rule) => (
              <li key={rule.label} className={rule.met ? "text-green-600" : "text-slate-400"}>
                {rule.met ? "✓" : "○"} {rule.label}
              </li>
            ))}
          </ul>
        </div>

        <button type="submit" disabled={loading} className="w-full rounded-xl bg-blue-600 px-5 py-3 font-medium text-white disabled:opacity-50">
          {loading ? "Creating account..." : "Sign Up"}
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
    </div>
  );
}
