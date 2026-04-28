import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";
import type { OrgRole } from "@prisma/client";

export type SessionContext = {
  authUserId: string;
  userId: string;
  orgId: string;
  email: string;
  role: OrgRole;
};

export async function getSession(): Promise<SessionContext | null> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser?.email) return null;

  // Find or JIT-create the User row, keyed on email.
  let user = await db.user.findUnique({ where: { email: authUser.email } });

  if (!user) {
    const name = (authUser.user_metadata?.full_name as string | undefined) ?? null;
    const avatarUrl = (authUser.user_metadata?.avatar_url as string | undefined) ?? null;
    user = await db.user.create({
      data: { email: authUser.email, name, avatarUrl },
    });
  }

  // Find or JIT-create the user's personal organization.
  let org = await db.organization.findFirst({ where: { ownerId: user.id } });

  if (!org) {
    const baseSlug = slugify(user.email.split("@")[0] || "workspace");
    let slug = baseSlug;
    let n = 0;
    while (await db.organization.findUnique({ where: { slug } })) {
      n++;
      slug = `${baseSlug}-${n}`;
    }
    org = await db.organization.create({
      data: {
        name: user.name ?? user.email.split("@")[0] ?? "My Organisation",
        slug,
        ownerId: user.id,
      },
    });
    await db.orgMember.create({
      data: { orgId: org.id, userId: user.id, role: "OWNER", acceptedAt: new Date() },
    });
  }

  return {
    authUserId: authUser.id,
    userId: user.id,
    orgId: org.id,
    email: user.email,
    role: "OWNER",
  };
}

export async function requireSession(): Promise<SessionContext> {
  const s = await getSession();
  if (!s) throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  return s;
}
