import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/integrations/crypto";

/**
 * GET /api/integrations/slack/callback
 * Slack redirects here after user authorizes. Exchange code for bot token.
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

  const integration = await db.integration.findUnique({
    where: { orgId_type: { orgId, type: "SLACK" } },
  });
  if (!integration) {
    return NextResponse.redirect(`${baseUrl}/settings/integrations?error=no_integration`);
  }

  try {
    const storedConfig = integration.encryptedConfig
      ? JSON.parse(integration.encryptedConfig)
      : {};
    if (storedConfig.pendingState !== state) {
      return NextResponse.redirect(`${baseUrl}/settings/integrations?error=state_mismatch`);
    }
  } catch {
    // Skip if already encrypted
  }

  // Exchange code for access token
  const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      redirect_uri: `${baseUrl}/api/integrations/slack/callback`,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.ok || !tokenData.access_token) {
    console.error("Slack OAuth error:", tokenData);
    return NextResponse.redirect(`${baseUrl}/settings/integrations?error=token_exchange_failed`);
  }

  const configPayload = encrypt(
    JSON.stringify({
      accessToken: tokenData.access_token,
      tokenType: tokenData.token_type,
      scope: tokenData.scope,
      botUserId: tokenData.bot_user_id,
      teamId: tokenData.team?.id,
      teamName: tokenData.team?.name,
      appId: tokenData.app_id,
      connectedAt: new Date().toISOString(),
    })
  );

  await db.integration.update({
    where: { orgId_type: { orgId, type: "SLACK" } },
    data: {
      status: "CONNECTED",
      encryptedConfig: configPayload,
      name: `Slack (${tokenData.team?.name || "workspace"})`,
      lastSyncAt: new Date(),
    },
  });

  return NextResponse.redirect(`${baseUrl}/settings/integrations?connected=slack`);
}
