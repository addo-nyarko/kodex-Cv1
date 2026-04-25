import { getSession } from "@/lib/auth-helper";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";

/**
 * GET /api/integrations/notion/connect
 * Redirects to Notion's OAuth authorization page.
 * Scopes: read content, read comments, read users.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = process.env.NOTION_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || ""}/settings/integrations?error=${encodeURIComponent("Notion not configured. Ask your admin to set NOTION_CLIENT_ID and NOTION_CLIENT_SECRET in .env")}`
    );
  }

  const stateRandom = randomBytes(16).toString("hex");
  const state = `${session.orgId}:${stateRandom}`;

  // Notion doesn't have separate IntegrationType — we'll reuse CUSTOM_WEBHOOK or
  // we need to add NOTION to the enum. For now store as type name in config.
  // The schema has IntegrationType enum — let's check if NOTION is there.
  // It's not in the enum, so we'll map it. We'll use CUSTOM_WEBHOOK as a fallback
  // but better to just store the pending state in a temp way.
  // Actually, looking at schema: IntegrationType has specific values. We'll need to
  // handle this. For the skeleton, we store orgId in state and verify on callback.

  await db.integration.upsert({
    where: { orgId_type: { orgId: session.orgId, type: "CUSTOM_WEBHOOK" } },
    create: {
      orgId: session.orgId,
      type: "CUSTOM_WEBHOOK", // Will migrate to NOTION when enum is updated
      name: "Notion",
      status: "DISCONNECTED",
      encryptedConfig: JSON.stringify({ pendingState: state, provider: "notion" }),
    },
    update: {
      encryptedConfig: JSON.stringify({ pendingState: state, provider: "notion" }),
    },
  });

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/notion/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    owner: "user",
    state,
  });

  return NextResponse.redirect(`https://api.notion.com/v1/oauth/authorize?${params.toString()}`);
}
