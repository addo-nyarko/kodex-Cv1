import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";

export type SessionContext = {
  clerkUserId: string;
  userId: string;
  orgId: string;
  email: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" | "AUDITOR";
};

export async function getSession(): Promise<SessionContext | null> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  let user = await db.user.findUnique({ where: { clerkId: clerkUserId } });

  if (!user) {
    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(clerkUserId);
    const email = clerkUser.emailAddresses[0]?.emailAddress ?? `${clerkUserId}@placeholder.local`;
    const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null;

    const existingByEmail = await db.user.findUnique({ where: { email } });
    if (existingByEmail) {
      user = await db.user.update({
        where: { id: existingByEmail.id },
        data: { clerkId: clerkUserId, name, avatarUrl: clerkUser.imageUrl },
      });
    } else {
      user = await db.user.create({
        data: { clerkId: clerkUserId, email, name, avatarUrl: clerkUser.imageUrl },
      });
    }
  }

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
    clerkUserId,
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
