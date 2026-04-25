import { getSession } from "@/lib/auth-helper";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";

/**
 * GET /api/integrations/github/connect
 * Redirects the user to GitHub's OAuth authorization page.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || ""}/settings/integrations?error=${encodeURIComponent("GitHub not configured. Ask your admin to set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env")}`
    );
  }

  // Generate a state token to prevent CSRF — store orgId in it so we can recover context in callback
  const stateRandom = randomBytes(16).toString("hex");
  const state = `${session.orgId}:${stateRandom}`;

  // Store state in the integration record so we can verify in callback
  await db.integration.upsert({
    where: { orgId_type: { orgId: session.orgId, type: "GITHUB" } },
    create: {
      orgId: session.orgId,
      type: "GITHUB",
      name: "GitHub",
      status: "DISCONNECTED",
      encryptedConfig: JSON.stringify({ pendingState: state }),
    },
    update: {
      encryptedConfig: JSON.stringify({ pendingState: state }),
    },
  });

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/github/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "repo read:org",
    state,
  });

  return NextResponse.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
}
