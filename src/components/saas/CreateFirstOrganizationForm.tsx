"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function CreateFirstOrganizationForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/saas/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug: slugify(name) || `org-${Date.now()}` }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Creating the organization failed");
      }

      await fetch("/api/saas/organizations/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: data.id }),
      });

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creating the organization failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleCreate} className="mt-6 space-y-4">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Organization name (e.g. Acme Recruiting)"
        className="w-full rounded-xl border border-slate-300 px-4 py-3"
      />

      <button
        type="submit"
        disabled={loading || !name.trim()}
        className="w-full rounded-xl bg-blue-600 px-5 py-3 font-medium text-white disabled:opacity-50"
      >
        {loading ? "Creating..." : "Create Organization"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
