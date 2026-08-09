import PDFDocument from "pdfkit";

import type { Invoice } from "@/lib/billing/billing-types";

function centsToDisplay(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

export function renderInvoicePdf(invoice: Invoice, organizationName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text("Invoice", { align: "center" });
    doc.moveDown();

    doc.fontSize(10).text(`Invoice Number: ${invoice.invoice_number}`);
    doc.text(`Billed To: ${organizationName}`);
    doc.text(`Date: ${new Date(invoice.created_at).toLocaleDateString()}`);
    doc.text(`Status: ${invoice.status}`);
    doc.moveDown();

    doc.fontSize(16).text("Summary");
    doc.moveDown(0.3);
    doc.fontSize(10).text(`Subtotal: ${centsToDisplay(invoice.amount_cents - invoice.tax_cents + invoice.discount_cents, invoice.currency)}`);
    if (invoice.discount_cents > 0) {
      doc.text(`Discount: -${centsToDisplay(invoice.discount_cents, invoice.currency)}`);
    }
    if (invoice.tax_cents > 0) {
      doc.text(`Tax: ${centsToDisplay(invoice.tax_cents, invoice.currency)}`);
    }
    doc.moveDown(0.3);
    doc.fontSize(12).text(`Total: ${centsToDisplay(invoice.amount_cents, invoice.currency)}`);

    doc.end();
  });
}
