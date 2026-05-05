import { getSession } from "@/lib/auth-helper";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = session;

  const { id: projectId } = await params;

  // Fetch project with frameworks and scans
  const project = await db.project.findFirst({
    where: { id: projectId, orgId },
    include: {
      frameworks: {
        select: {
          id: true,
          type: true,
          score: true,
          status: true,
          totalControls: true,
          passedControls: true,
        },
      },
      scans: {
        where: { status: "COMPLETED" },
        select: {
          id: true,
          status: true,
          score: true,
          createdAt: true,
          framework: {
            select: { type: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  return Response.json({
    id: project.id,
    name: project.name,
    description: project.description,
    complianceScore: project.complianceScore,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    frameworks: project.frameworks.map((fw: any) => ({
      id: fw.id,
      type: fw.type,
      score: fw.score,
      status: fw.status,
      totalControls: fw.totalControls,
      passedControls: fw.passedControls,
    })),
    scans: project.scans.map((scan: any) => ({
      id: scan.id,
      status: scan.status,
      score: scan.score,
      createdAt: scan.createdAt,
      frameworkType: scan.framework?.type ?? "UNKNOWN",
    })),
  });
}
