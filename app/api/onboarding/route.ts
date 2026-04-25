import { getSession } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";

const OnboardingSchema = z.object({
  name: z.string().min(1),
  industry: z.string().min(1),
  country: z.string().default("DE"),
  size: z.string().default("1-10"),
  usesAI: z.boolean().default(false),
  aiDescription: z.string().optional(),
  dataCategories: z.array(z.string()).default([]),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { userId } = session;

  const body = OnboardingSchema.safeParse(await req.json());
  if (!body.success) return Response.json({ error: "Invalid input" }, { status: 422 });

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  const { name, industry, country, size, usesAI, aiDescription, dataCategories } = body.data;

  const baseSlug = slugify(name);
  let slug = baseSlug;
  let attempt = 0;
  while (await db.organization.findUnique({ where: { slug } })) {
    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }

  const org = await db.organization.upsert({
    where: { slug },
    create: {
      name,
      slug,
      industry,
      country,
      size,
      usesAI,
      aiDescription,
      dataCategories,
      ownerId: user.id,
    },
    update: {
      name,
      industry,
      country,
      size,
      usesAI,
      aiDescription,
      dataCategories,
    },
  });

  await db.user.update({
    where: { id: user.id },
    data: { onboardingComplete: true },
  });

  return Response.json({ orgId: org.id, slug: org.slug });
}
