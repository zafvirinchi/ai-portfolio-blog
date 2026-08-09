import { NextResponse } from "next/server";

import * as invoiceService from "@/lib/billing/invoice-service";
import { organizationService } from "@/lib/saas/organization-service";
import { getTenantContext } from "@/lib/saas/tenant-context";
import { renderInvoicePdf } from "./pdf-renderer";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;

  try {
    const context = await getTenantContext();

    if (!context) {
      return NextResponse.json({ error: "Not authenticated, or no active organization membership" }, { status: 401 });
    }

    const invoice = await invoiceService.getById(id);

    if (!invoice || invoice.organization_id !== context.organizationId) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const organization = await organizationService.get(context.organizationId);
    const buffer = await renderInvoicePdf(invoice, organization?.name ?? "Your organization");

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.invoice_number}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[billing] Invoice PDF route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to generate invoice PDF" }, { status: 500 });
  }
}
