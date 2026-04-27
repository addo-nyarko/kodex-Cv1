import { getSession } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const OnboardingSchema = z.object({
  name: z.string().min(1),
  industry: z.string().min(1),
  role: z.string().optional(),
  country: z.string().default("DE"),
  size: z.string().default("1-10"),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId, orgId } = session;

    const raw = await req.json();
    const body = OnboardingSchema.safeParse(raw);
    if (!body.success) {
      return Response.json(
        { error: "Invalid input", details: body.error.flatten() },
        { status: 422 }
      );
    }

    const { name, industry, role, country, size } = body.data;

    // Update user with industry and role
    await db.user.update({
      where: { id: userId },
      data: {
        industry,
        role: role ?? null,
        onboardingComplete: true,
      },
    });

    // Update the existing org (getSession already created one)
    const org = await db.organization.update({
      where: { id: orgId },
      data: {
        name,
        industry,
        country,
        size,
      },
    });

    return Response.json({ orgId: org.id, slug: org.slug });
  } catch (error) {
    console.error("Onboarding error:", error);
    return Response.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
