import { getSession } from "@/lib/auth-helper";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/integrations/crypto";

/**
 * GET /api/integrations/github/repos
 * Lists the authenticated user's GitHub repositories for selection.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const integration = await db.integration.findUnique({
    where: { orgId_type: { orgId: session.orgId, type: "GITHUB" } },
  });

  if (!integration || integration.status !== "CONNECTED" || !integration.encryptedConfig) {
    return NextResponse.json({ error: "GitHub not connected" }, { status: 400 });
  }

  const config = JSON.parse(decrypt(integration.encryptedConfig));

  // Fetch repos (up to 100, sorted by recent push)
  const res = await fetch(
    "https://api.github.com/user/repos?sort=pushed&per_page=100&type=owner",
    {
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        Accept: "application/vnd.github+json",
      },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("GitHub repos fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch repos" }, { status: 502 });
  }

  const repos = await res.json();

  return NextResponse.json({
    repos: repos.map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      private: r.private,
      language: r.language,
      updatedAt: r.updated_at,
      defaultBranch: r.default_branch,
      description: r.description,
    })),
    githubLogin: config.githubLogin,
  });
}
