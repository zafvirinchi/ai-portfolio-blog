// Architecture-ready for a real tax provider (Stripe Tax/Avalara/
// TaxJar) — none is configured in this environment, so this is a small
// static rate table, not a live lookup. Swapping it for a real
// provider call later is a one-function change; call sites never need
// to change, since calculateTax()'s signature already models what a
// real provider needs (amount + country/region).

const STATIC_RATES: Record<string, number> = {
  US: 0, // US sales tax varies by state/nexus — left to a real provider
  IN: 0.18, // GST
  GB: 0.2, // VAT
  DE: 0.19, // VAT
  FR: 0.2, // VAT
  CA: 0.05, // GST (federal component only)
  AU: 0.1, // GST
};

export interface TaxResult {
  rate: number;
  taxCents: number;
  totalCents: number;
}

export function calculateTax(amountCents: number, countryCode?: string | null): TaxResult {
  const rate = countryCode ? (STATIC_RATES[countryCode.toUpperCase()] ?? 0) : 0;
  const taxCents = Math.round(amountCents * rate);

  return { rate, taxCents, totalCents: amountCents + taxCents };
}
