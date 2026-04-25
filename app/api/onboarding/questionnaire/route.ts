import { getSession } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { classifyOrg } from "@/lib/onboarding/classifier";
import { frameworkRegistry } from "@/lib/frameworks/registry";

const QuestionnaireSchema = z.object({
  productDescription: z.string().min(5),
  usesAI: z.boolean(),
  aiPurposes: z.array(z.string()).default([]),
  dataCategories: z.array(z.string()).default([]),
  userTypes: z.array(z.string()).default([]),
  size: z.string().default("1-10"),
  country: z.string().default("DE"),
  hasPrivacyPolicy: z.boolean().default(false),
  usesThirdPartyAI: z.boolean().default(false),
  thirdPartyProviders: z.array(z.string()).default([]),
  trainsOwnModels: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId, userId } = session;

  const body = QuestionnaireSchema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: "Invalid input", issues: body.error.issues }, { status: 422 });
  }
  const a = body.data;

  let classifier;
  try {
    classifier = await classifyOrg(a);
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown";
    console.error("Classifier error:", detail);

    // Check if it's a missing API key
    if (detail.includes("API key") || detail.includes("api_key") || detail.includes("ANTHROPIC")) {
      return Response.json(
        { error: "Anthropic API key not configured. Add ANTHROPIC_API_KEY to your .env file.", detail },
        { status: 502 }
      );
    }

    return Response.json(
      { error: "Classifier failed", detail },
      { status: 502 }
    );
  }

  await db.organization.update({
    where: { id: orgId },
    data: {
      productDescription: a.productDescription,
      usesAI: a.usesAI,
      aiPurposes: a.aiPurposes,
      dataCategories: a.dataCategories,
      userTypes: a.userTypes,
      size: a.size,
      country: a.country,
      hasPrivacyPolicy: a.hasPrivacyPolicy,
      usesThirdPartyAI: a.usesThirdPartyAI,
      thirdPartyProviders: a.thirdPartyProviders,
      trainsOwnModels: a.trainsOwnModels,
      riskTier: classifier.riskTier,
      applicableFrameworks: classifier.applicableFrameworks,
      documentChecklist: classifier.documentChecklist,
      questionnaireAnswers: a,
      questionnaireCompletedAt: new Date(),
    },
  });

  // Create Framework rows + Control rows for each applicable framework
  for (const fwType of classifier.applicableFrameworks) {
    const framework = await db.framework.upsert({
      where: { orgId_type: { orgId, type: fwType } },
      create: { orgId, type: fwType, status: "NOT_STARTED", score: 0 },
      update: {},
    });

    // Create controls from the framework plugin registry
    const plugin = frameworkRegistry.get(fwType);
    if (plugin) {
      for (const rule of plugin.rules) {
        await db.control.upsert({
          where: { frameworkId_code: { frameworkId: framework.id, code: rule.code } },
          create: {
            frameworkId: framework.id,
            code: rule.code,
            title: rule.title,
            status: "NOT_ASSESSED",
          },
          update: {},
        });
      }

      // Update total controls count
      await db.framework.update({
        where: { id: framework.id },
        data: { totalControls: plugin.rules.length },
      });
    }
  }

  await db.user.update({
    where: { id: userId },
    data: { onboardingComplete: true },
  });

  return Response.json({
    orgId,
    riskTier: classifier.riskTier,
    applicableFrameworks: classifier.applicableFrameworks,
    summary: classifier.summary,
    plainEnglishExplainer: classifier.plainEnglishExplainer,
    documentChecklist: classifier.documentChecklist,
  });
}

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const org = await db.organization.findUnique({
    where: { id: session.orgId },
    select: {
      questionnaireAnswers: true,
      questionnaireCompletedAt: true,
      riskTier: true,
      applicableFrameworks: true,
      documentChecklist: true,
    },
  });
  return Response.json(org);
}
