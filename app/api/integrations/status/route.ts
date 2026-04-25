import { getSession } from "@/lib/auth-helper";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/integrations/status
 * Returns the status of all integrations for the current org.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const integrations = await db.integration.findMany({
    where: { orgId: session.orgId },
    select: {
      id: true,
      type: true,
      name: true,
      status: true,
      lastSyncAt: true,
      lastSyncError: true,
      itemsSynced: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ integrations });
}

/**
 * DELETE /api/integrations/status
 * Disconnect an integration by type.
 */
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type } = await req.json();
  if (!type) return NextResponse.json({ error: "type is required" }, { status: 422 });

  await db.integration.updateMany({
    where: { orgId: session.orgId, type },
    data: {
      status: "DISCONNECTED",
      encryptedConfig: null,
      lastSyncError: null,
    },
  });

  return NextResponse.json({ ok: true });
}
