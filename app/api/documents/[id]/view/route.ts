import { getSession } from "@/lib/auth-helper";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const document = await db.document.findFirst({
    where: {
      id,
      project: { orgId: session.orgId },
    },
    include: {
      project: { select: { name: true } },
    },
  });

  if (!document) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const content = document.content ?? "";
  const title = document.title ?? "document";

  return NextResponse.json({
    id: document.id,
    title,
    category: document.category,
    content,
    projectName: document.project.name,
    createdAt: document.createdAt.toISOString(),
  });
}
