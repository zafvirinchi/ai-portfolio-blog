"use client";

import { useEffect, useState } from "react";

import type { Invoice, Payment } from "@/lib/billing/billing-types";

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

export default function BillingInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetch("/api/billing/invoices").then((r) => r.json()), fetch("/api/billing/payments").then((r) => r.json())])
      .then(([invoiceData, paymentData]) => {
        setInvoices(invoiceData);
        setPayments(paymentData);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Invoices</h2>
        </div>
        {invoices.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No invoices yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {invoices.map((invoice) => (
              <li key={invoice.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>
                  <span className="font-semibold text-slate-800">{invoice.invoice_number}</span> —{" "}
                  {formatCents(invoice.amount_cents, invoice.currency)} ({invoice.status})
                  <span className="ml-2 text-xs text-slate-400">{new Date(invoice.created_at).toLocaleDateString()}</span>
                </span>
                <a href={`/api/billing/invoices/${invoice.id}/pdf`} className="text-xs font-semibold text-blue-600 hover:underline">
                  Download PDF
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Payment History</h2>
        </div>
        {payments.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No payments yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {payments.map((payment) => (
              <li key={payment.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>
                  {formatCents(payment.amount_cents, payment.currency)} — {payment.status}
                </span>
                <span className="text-xs text-slate-400">{new Date(payment.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
