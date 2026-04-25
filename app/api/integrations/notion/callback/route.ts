import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/integrations/crypto";

/**
 * GET /api/integrations/notion/callback
 * Notion redirects here after user authorizes. Exchange code for access token.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/settings/integrations?error=missing_params`);
  }

  const [orgId] = state.split(":");
  if (!orgId) {
    return NextResponse.redirect(`${baseUrl}/settings/integrations?error=invalid_state`);
  }

  // Notion uses CUSTOM_WEBHOOK type until enum migration
  const integration = await db.integration.findUnique({
    where: { orgId_type: { orgId, type: "CUSTOM_WEBHOOK" } },
  });
  if (!integration) {
    return NextResponse.redirect(`${baseUrl}/settings/integrations?error=no_integration`);
  }

  try {
    const storedConfig = integration.encryptedConfig
      ? JSON.parse(integration.encryptedConfig)
      : {};
    if (storedConfig.pendingState !== state || storedConfig.provider !== "notion") {
      return NextResponse.redirect(`${baseUrl}/settings/integrations?error=state_mismatch`);
    }
  } catch {
    // Skip state check if config is already encrypted
  }

  // Exchange code for access token (Notion uses Basic auth for token exchange)
  const credentials = Buffer.from(
    `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`
  ).toString("base64");

  const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${baseUrl}/api/integrations/notion/callback`,
    }),
  });

  const tokenData = await tokenRes.json();
  if (tokenData.error || !tokenData.access_token) {
    console.error("Notion OAuth error:", tokenData);
    return NextResponse.redirect(`${baseUrl}/settings/integrations?error=token_exchange_failed`);
  }

  const configPayload = encrypt(
    JSON.stringify({
      accessToken: tokenData.access_token,
      workspaceId: tokenData.workspace_id,
      workspaceName: tokenData.workspace_name,
      workspaceIcon: tokenData.workspace_icon,
      botId: tokenData.bot_id,
      owner: tokenData.owner,
      provider: "notion",
      connectedAt: new Date().toISOString(),
    })
  );

  await db.integration.update({
    where: { orgId_type: { orgId, type: "CUSTOM_WEBHOOK" } },
    data: {
      status: "CONNECTED",
      encryptedConfig: configPayload,
      name: `Notion (${tokenData.workspace_name || "workspace"})`,
      lastSyncAt: new Date(),
    },
  });

  return NextResponse.redirect(`${baseUrl}/settings/integrations?connected=notion`);
}
