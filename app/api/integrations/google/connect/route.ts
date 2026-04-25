import { getSession } from "@/lib/auth-helper";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";

/**
 * GET /api/integrations/google/connect
 * Redirects to Google OAuth 2.0 consent screen.
 * Scopes: admin directory (read-only), drive metadata, audit logs.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || ""}/settings/integrations?error=${encodeURIComponent("Google Workspace not configured. Ask your admin to set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env")}`
    );
  }

  const stateRandom = randomBytes(16).toString("hex");
  const state = `${session.orgId}:${stateRandom}`;

  await db.integration.upsert({
    where: { orgId_type: { orgId: session.orgId, type: "GOOGLE_WORKSPACE" } },
    create: {
      orgId: session.orgId,
      type: "GOOGLE_WORKSPACE",
      name: "Google Workspace",
      status: "DISCONNECTED",
      encryptedConfig: JSON.stringify({ pendingState: state }),
    },
    update: {
      encryptedConfig: JSON.stringify({ pendingState: state }),
    },
  });

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google/callback`;

  const scopes = [
    "https://www.googleapis.com/auth/admin.directory.user.readonly",
    "https://www.googleapis.com/auth/admin.reports.audit.readonly",
    "https://www.googleapis.com/auth/drive.metadata.readonly",
    "openid",
    "email",
    "profile",
  ];

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
