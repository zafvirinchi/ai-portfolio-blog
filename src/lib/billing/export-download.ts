import { EntitlementErrorInfo, readEntitlementError } from "./entitlement-client-error";

// Phase 19 Milestone 5 — extracted from RecruiterReportsTab.tsx (Phase 18
// M8's original fix for this exact problem: a plain <a href> pointing at
// an entitlement-gated export route can't intercept a 402 JSON rejection
// — the browser just navigates the whole tab to raw JSON instead of
// downloading a file). This was independently duplicated a 2nd
// (RecruiterComparisonTab.tsx) and 3rd (RecruiterCandidateTable.tsx) time
// this milestone while fixing the same bug class elsewhere — extracted
// here rather than duplicated a 4th time. Fetch+blob is a standard,
// low-risk browser download pattern; the success path still produces an
// identical real browser download (same filename, same content-type) —
// only a rejection's presentation changes, from a navigated-away raw
// JSON body to a structured error the caller can render as UpgradePrompt.
export type ExportDownloadResult = EntitlementErrorInfo | { networkError: string } | null;

export function downloadExport(url: string, filename: string): Promise<ExportDownloadResult> {
  return fetch(url)
    .then(async (response) => {
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        return readEntitlementError(body, "Export failed") ?? { networkError: (body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : null) || "Export failed." };
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
      return null;
    })
    .catch(() => ({ networkError: "Export failed — network error." }));
}
