import { getSession } from "@/lib/auth-helper";
import type { NextRequest } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = session;

  const { scanId } = await params;

  const { db } = await import("@/lib/db");
  const scan = await db.scan.findFirst({
    where: { id: scanId, orgId },
    include: { controlResults: true, clarifications: true },
  });

  if (!scan) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json(scan);
}
