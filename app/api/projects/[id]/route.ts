import { getSession } from "@/lib/auth-helper";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const project = await db.project.findFirst({
    where: { id, orgId: session.orgId },
    include: {
      frameworks: {
        select: {
          id: true,
          type: true,
          score: true,
          status: true,
          totalControls: true,
          passedControls: true,
          scans: {
            where: { status: "COMPLETED" },
            include: {
              framework: { select: { type: true } },
            },
            orderBy: { completedAt: "desc" },
            take: 20,
          },
        },
      },
      documents: {
        select: { id: true, title: true, category: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ project });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const project = await db.project.findFirst({
    where: { id, orgId: session.orgId },
  });

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.project.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
