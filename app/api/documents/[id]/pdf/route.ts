import { getSession } from "@/lib/auth-helper";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#111827",
    padding: 48,
    backgroundColor: "#ffffff",
  },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#1e40af",
    marginBottom: 8,
  },
  meta: {
    fontSize: 9,
    color: "#6b7280",
    marginBottom: 24,
  },
  section: {
    marginBottom: 12,
  },
  heading1: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#1e40af",
    marginTop: 16,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    borderBottomStyle: "solid",
  },
  heading2: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 10,
    marginBottom: 4,
  },
  heading3: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginTop: 8,
    marginBottom: 3,
  },
  body: {
    fontSize: 10,
    lineHeight: 1.6,
    color: "#374151",
  },
  listItem: {
    fontSize: 10,
    lineHeight: 1.6,
    color: "#374151",
    marginLeft: 12,
    marginBottom: 2,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    textAlign: "center",
    fontSize: 8,
    color: "#9ca3af",
  },
});

// Simple markdown-to-PDF renderer
// Handles: # headers, ## subheaders, ### subsubheaders, - bullet lists, **bold**, plain paragraphs
function renderMarkdownContent(content: string) {
  const lines = content.split("\n");
  const elements: React.ReactElement[] = [];

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (trimmed.startsWith("# ")) {
      elements.push(
        React.createElement(Text, { key: i, style: styles.heading1 },
          trimmed.slice(2).replace(/\*\*/g, "")
        )
      );
    } else if (trimmed.startsWith("## ")) {
      elements.push(
        React.createElement(Text, { key: i, style: styles.heading2 },
          trimmed.slice(3).replace(/\*\*/g, "")
        )
      );
    } else if (trimmed.startsWith("### ")) {
      elements.push(
        React.createElement(Text, { key: i, style: styles.heading3 },
          trimmed.slice(4).replace(/\*\*/g, "")
        )
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      elements.push(
        React.createElement(Text, { key: i, style: styles.listItem },
          "• " + trimmed.slice(2).replace(/\*\*/g, "")
        )
      );
    } else {
      elements.push(
        React.createElement(Text, { key: i, style: styles.body },
          trimmed.replace(/\*\*/g, "")
        )
      );
    }
  });

  return elements;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const document = await db.document.findFirst({
    where: { id },
    include: { project: { select: { orgId: true } } },
  });

  if (!document || (document as any).project.orgId !== session.orgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const content = (document as any).content ?? "";
  const title = document.title ?? "Document";
  const createdAt = (document as any).createdAt
    ? new Date((document as any).createdAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  const pdfBuffer = await renderToBuffer(
    React.createElement(
      Document,
      { title },
      React.createElement(
        Page,
        { size: "A4", style: styles.page },
        React.createElement(Text, { style: styles.title }, title),
        React.createElement(
          Text,
          { style: styles.meta },
          `Generated: ${createdAt} · Kodex Compliance Platform`
        ),
        React.createElement(
          View,
          { style: styles.section },
          ...renderMarkdownContent(content)
        )
      )
    ) as any
  );

  const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;

  return new NextResponse(pdfBuffer as any, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": pdfBuffer.length.toString(),
    },
  });
}
