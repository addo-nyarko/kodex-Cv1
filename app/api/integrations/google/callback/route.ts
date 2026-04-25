import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/integrations/crypto";

/**
 * GET /api/integrations/google/callback
 * Google redirects here after user authorizes. Exchange code for tokens.
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

  // Verify state matches
  const integration = await db.integration.findUnique({
    where: { orgId_type: { orgId, type: "GOOGLE_WORKSPACE" } },
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
    // Config may already be encrypted from a re-auth — skip state check
  }

  // Exchange code for tokens
  const redirectUri = `${baseUrl}/api/integrations/google/callback`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = await tokenRes.json();
  if (tokenData.error || !tokenData.access_token) {
    console.error("Google OAuth error:", tokenData);
    return NextResponse.redirect(`${baseUrl}/settings/integrations?error=token_exchange_failed`);
  }

  // Get user info
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const userInfo = await userRes.json();

  const configPayload = encrypt(
    JSON.stringify({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
      scope: tokenData.scope,
      email: userInfo.email,
      connectedAt: new Date().toISOString(),
    })
  );

  await db.integration.update({
    where: { orgId_type: { orgId, type: "GOOGLE_WORKSPACE" } },
    data: {
      status: "CONNECTED",
      encryptedConfig: configPayload,
      name: `Google Workspace (${userInfo.email || "connected"})`,
      lastSyncAt: new Date(),
    },
  });

  return NextResponse.redirect(`${baseUrl}/settings/integrations?connected=google`);
}
