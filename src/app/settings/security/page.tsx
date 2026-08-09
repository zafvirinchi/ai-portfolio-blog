"use client";

import { useCallback, useEffect, useState } from "react";

import type { EnrolledMfaFactor, MfaEnrollResult, SecurityOverview, TrustedDeviceSummary } from "@/lib/auth/auth-types";

export default function SecuritySettingsPage() {
  const [overview, setOverview] = useState<SecurityOverview | null>(null);
  const [factors, setFactors] = useState<EnrolledMfaFactor[]>([]);
  const [devices, setDevices] = useState<TrustedDeviceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [enrollment, setEnrollment] = useState<MfaEnrollResult | null>(null);
  const [enrollCode, setEnrollCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [overviewRes, factorsRes, devicesRes] = await Promise.all([
        fetch("/api/auth/security/overview"),
        fetch("/api/auth/mfa/factors"),
        fetch("/api/auth/mfa/trusted-devices"),
      ]);

      if (!overviewRes.ok) throw new Error((await overviewRes.json()).error || "Failed to load security data");

      setOverview(await overviewRes.json());
      setFactors(factorsRes.ok ? await factorsRes.json() : []);
      setDevices(devicesRes.ok ? await devicesRes.json() : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load security data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function startEnroll() {
    setBusy("enroll");
    setError(null);
    setBackupCodes(null);

    try {
      const response = await fetch("/api/auth/mfa/totp/enroll", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Enrollment failed");
      setEnrollment(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enrollment failed.");
    } finally {
      setBusy(null);
    }
  }

  async function confirmEnroll() {
    if (!enrollment) return;
    setBusy("confirm");
    setError(null);

    try {
      const response = await fetch("/api/auth/mfa/totp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factorId: enrollment.factorId, code: enrollCode, context: "enroll" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Verification failed");

      setBackupCodes(data.backupCodes ?? null);
      setEnrollment(null);
      setEnrollCode("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setBusy(null);
    }
  }

  async function disableFactor(factorId: string) {
    if (!window.confirm("Disable authenticator app MFA?")) return;
    setBusy(factorId);
    setError(null);

    try {
      const response = await fetch("/api/auth/mfa/totp/unenroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factorId }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Failed to disable");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disable MFA.");
    } finally {
      setBusy(null);
    }
  }

  async function regenerateBackupCodes() {
    setBusy("backup");
    setError(null);
    setBackupCodes(null);

    try {
      const response = await fetch("/api/auth/mfa/backup-codes/generate", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to generate codes");
      setBackupCodes(data.codes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate backup codes.");
    } finally {
      setBusy(null);
    }
  }

  async function revokeDevice(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/auth/mfa/trusted-devices/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;

  const totpFactor = factors.find((factor) => factor.type === "totp" && factor.status === "verified");

  return (
    <div className="space-y-6">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-400">Recent Logins</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{overview?.recentLogins.length ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-400">Failed Logins (24h)</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{overview?.failedLoginAttempts24h ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-400">Security Alerts</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{overview?.alerts.length ?? 0}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-700">Multi-Factor Authentication</h2>

        {totpFactor ? (
          <div className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 p-4">
            <span className="text-sm text-green-800">Authenticator app is enabled.</span>
            <button
              onClick={() => disableFactor(totpFactor.id)}
              disabled={busy === totpFactor.id}
              className="text-xs font-semibold text-red-600 hover:underline"
            >
              Disable
            </button>
          </div>
        ) : enrollment ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Scan this QR code with your authenticator app, or enter the secret manually.</p>
            <div className="max-w-[200px]" dangerouslySetInnerHTML={{ __html: enrollment.qrCodeSvg }} />
            <p className="font-mono text-xs text-slate-500">{enrollment.secret}</p>
            <input
              value={enrollCode}
              onChange={(event) => setEnrollCode(event.target.value)}
              maxLength={6}
              placeholder="123456"
              className="w-full max-w-[200px] rounded-xl border px-4 py-2 tracking-widest"
            />
            <button
              onClick={confirmEnroll}
              disabled={busy === "confirm"}
              className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy === "confirm" ? "Verifying..." : "Confirm"}
            </button>
          </div>
        ) : (
          <button
            onClick={startEnroll}
            disabled={busy === "enroll"}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Enable Authenticator App
          </button>
        )}

        {backupCodes && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">Save these backup codes — shown only once:</p>
            <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs text-amber-900">
              {backupCodes.map((code) => (
                <span key={code}>{code}</span>
              ))}
            </div>
          </div>
        )}

        {totpFactor && (
          <button onClick={regenerateBackupCodes} disabled={busy === "backup"} className="mt-4 text-xs font-semibold text-blue-600 hover:underline">
            Regenerate backup codes
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Trusted Devices</h2>
        </div>
        {devices.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No trusted devices remembered.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {devices.map((device) => (
              <li key={device.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>
                  {device.ip_address ?? "Unknown IP"} — {(device.user_agent ?? "Unknown device").slice(0, 60)}
                  <span className="ml-2 text-xs text-slate-400">expires {new Date(device.expires_at).toLocaleDateString()}</span>
                </span>
                <button onClick={() => revokeDevice(device.id)} disabled={busy === device.id} className="text-xs font-semibold text-red-600 hover:underline">
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Recent Logins</h2>
        </div>
        {!overview || overview.recentLogins.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No login history yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {overview.recentLogins.map((session) => (
              <li key={session.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>
                  {session.ip_address ?? "Unknown IP"} — {(session.user_agent ?? "Unknown device").slice(0, 60)}
                  {session.is_current && <span className="ml-2 text-xs font-semibold text-green-600">this device</span>}
                </span>
                <span className="text-xs text-slate-400">{new Date(session.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Security Alerts</h2>
        </div>
        {!overview || overview.alerts.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No security alerts.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {overview.alerts.map((alert) => (
              <li key={alert.id} className="px-5 py-3 text-sm">
                <span className="font-semibold text-amber-700">{alert.alert_type}</span> — {alert.description}
                <span className="ml-2 text-xs text-slate-400">{new Date(alert.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
