import { getSession } from "@/lib/auth-helper";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";

/**
 * GET /api/integrations/slack/connect
 * Redirects to Slack's OAuth v2 authorization page.
 * Scopes: channels:read, chat:write, users:read, team:read
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || ""}/settings/integrations?error=${encodeURIComponent("Slack not configured. Ask your admin to set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET in .env")}`
    );
  }

  const stateRandom = randomBytes(16).toString("hex");
  const state = `${session.orgId}:${stateRandom}`;

  await db.integration.upsert({
    where: { orgId_type: { orgId: session.orgId, type: "SLACK" } },
    create: {
      orgId: session.orgId,
      type: "SLACK",
      name: "Slack",
      status: "DISCONNECTED",
      encryptedConfig: JSON.stringify({ pendingState: state }),
    },
    update: {
      encryptedConfig: JSON.stringify({ pendingState: state }),
    },
  });

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/slack/callback`;

  // Bot token scopes for reading workspace info relevant to compliance
  const scopes = [
    "channels:read",
    "channels:history",
    "users:read",
    "users:read.email",
    "team:read",
    "files:read",
  ];

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(","),
    state,
  });

  return NextResponse.redirect(`https://slack.com/oauth/v2/authorize?${params.toString()}`);
}
