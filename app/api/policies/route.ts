import { getSession } from "@/lib/auth-helper";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all projects for this org to scope document queries
  const projects = await db.project.findMany({
    where: { orgId: session.orgId },
    select: { id: true },
  });

  if (projects.length === 0) {
    return NextResponse.json({ documents: [] });
  }

  const projectIds = projects.map((p) => p.id);

  // Fetch POLICY category documents
  const documents = await db.document.findMany({
    where: {
      projectId: { in: projectIds },
      category: "POLICY",
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      category: true,
      description: true,
      content: true,
      createdAt: true,
      aiGenerated: true,
    },
  });

  return NextResponse.json({
    documents: documents.map((doc) => ({
      id: doc.id,
      title: doc.title,
      category: doc.category,
      description: doc.description,
      content: doc.content,
      createdAt: doc.createdAt.toISOString(),
      aiGenerated: doc.aiGenerated,
    })),
  });
}
