import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helper";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const category = searchParams.get("category");
  const search = searchParams.get("search");

  // Find all projects belonging to this org
  const projects = await db.project.findMany({
    where: { orgId: session.orgId },
    select: { id: true, name: true },
  });

  if (projects.length === 0) {
    return NextResponse.json({ documents: [] });
  }

  const projectIds = projects.map((p: { id: string }) => p.id);
  const projectMap = new Map(
    projects.map((p: { id: string; name: string }) => [p.id, p.name])
  );

  // Build where clause
  const where: Record<string, unknown> = {
    projectId: { in: projectIds },
  };

  if (category) {
    where.category = category;
  }

  if (search) {
    where.title = { contains: search, mode: "insensitive" };
  }

  const documents = await db.document.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  const formatted = documents.map(
    (doc: {
      id: string;
      title: string;
      category: string;
      fileName: string | null;
      fileSize: number | null;
      mimeType: string | null;
      aiGenerated: boolean;
      sourceType: string | null;
      createdAt: Date;
      projectId: string;
    }) => ({
      id: doc.id,
      title: doc.title,
      category: doc.category,
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      aiGenerated: doc.aiGenerated,
      sourceType: doc.sourceType,
      createdAt: doc.createdAt.toISOString(),
      projectId: doc.projectId,
      projectName: projectMap.get(doc.projectId) ?? "Unknown Project",
    })
  );

  return NextResponse.json({ documents: formatted });
}
