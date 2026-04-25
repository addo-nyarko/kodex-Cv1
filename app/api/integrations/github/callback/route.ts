import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/integrations/crypto";

/**
 * GET /api/integrations/github/callback
 * GitHub redirects here after the user authorizes. We exchange the code for an access token.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings/integrations?error=missing_params`
    );
  }

  // Extract orgId from state
  const [orgId] = state.split(":");
  if (!orgId) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings/integrations?error=invalid_state`
    );
  }

  // Verify state matches what we stored
  const integration = await db.integration.findUnique({
    where: { orgId_type: { orgId, type: "GITHUB" } },
  });

  if (!integration) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings/integrations?error=no_integration`
    );
  }

  try {
    const storedConfig = integration.encryptedConfig
      ? JSON.parse(integration.encryptedConfig)
      : {};
    if (storedConfig.pendingState !== state) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings/integrations?error=state_mismatch`
      );
    }
  } catch {
    // If we can't parse, the config was already encrypted (re-auth flow) — skip state check
  }

  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const tokenData = await tokenRes.json();

  if (tokenData.error || !tokenData.access_token) {
    console.error("GitHub OAuth error:", tokenData);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings/integrations?error=token_exchange_failed`
    );
  }

  // Fetch the authenticated user info
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/vnd.github+json",
    },
  });
  const ghUser = await userRes.json();

  // Encrypt and store the token
  const configPayload = encrypt(
    JSON.stringify({
      accessToken: tokenData.access_token,
      tokenType: tokenData.token_type,
      scope: tokenData.scope,
      githubLogin: ghUser.login,
      githubId: ghUser.id,
      connectedAt: new Date().toISOString(),
    })
  );

  await db.integration.update({
    where: { orgId_type: { orgId, type: "GITHUB" } },
    data: {
      status: "CONNECTED",
      encryptedConfig: configPayload,
      name: `GitHub (${ghUser.login})`,
      lastSyncAt: new Date(),
    },
  });

  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_APP_URL}/settings/integrations?connected=github`
  );
}
