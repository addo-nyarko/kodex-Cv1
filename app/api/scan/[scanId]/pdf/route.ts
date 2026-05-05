import { getSession } from "@/lib/auth-helper";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { AuditReportDocument } from "@/lib/scan-engine/pdf-report-renderer";
import type { FrameworkReport } from "@/types/scan";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { scanId } = await params;

  const scan = await db.scan.findFirst({
    where: { id: scanId, orgId: session.orgId },
    include: {
      controlResults: {
        include: { control: { select: { code: true, title: true } } },
      },
      framework: { select: { type: true } },
      org: { select: { name: true } },
    },
  });

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }
  if (scan.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "Scan not completed yet" },
      { status: 400 }
    );
  }

  const report = scan.reportJson as FrameworkReport | null;
  if (!report) {
    return NextResponse.json(
      { error: "Report data not available" },
      { status: 404 }
    );
  }

  const orgName = scan.org?.name ?? "Organization";
  const frameworkType = scan.framework?.type ?? "UNKNOWN";
  const generatedAt = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const completedAt = scan.completedAt
    ? new Date(scan.completedAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Unknown";

  // Generate the PDF binary
  const pdfBuffer = (await renderToBuffer(
    React.createElement(AuditReportDocument, {
      scanId: scan.id,
      orgName,
      frameworkType,
      report,
      generatedAt,
      completedAt,
    }) as any
  )) as Buffer;

  // Build a clean filename
  const dateStr = new Date().toISOString().slice(0, 10);
  const frameworkSlug = frameworkType.toLowerCase().replace(/_/g, "-");
  const filename = `kodex-${frameworkSlug}-audit-${dateStr}.pdf`;

  return new NextResponse(pdfBuffer as any, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": pdfBuffer.length.toString(),
    },
  });
}
