import { getSession } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

// ─── Checklist generation ────────────────────────────────────────────────────

type ChecklistItem = {
  id: string;
  title: string;
  why: string;
  required: boolean;
  framework: string;
};

const FRAMEWORK_DOCUMENTS: Record<string, { title: string; why: string }[]> = {
  GDPR: [
    { title: "Privacy Policy", why: "Required under Articles 13/14 GDPR to inform data subjects about processing activities." },
    { title: "Data Processing Agreement", why: "Article 28 GDPR requires written contracts with all data processors." },
    { title: "Data Protection Impact Assessment (DPIA)", why: "Required under Article 35 GDPR for high-risk processing activities." },
    { title: "Data Breach Response Plan", why: "Articles 33/34 GDPR require notification within 72 hours of a breach." },
    { title: "Consent Management Policy", why: "Demonstrates lawful basis for processing under Article 6 GDPR." },
    { title: "Data Retention Policy", why: "Storage limitation principle under Article 5(1)(e) GDPR." },
  ],
  EU_AI_ACT: [
    { title: "AI System Documentation", why: "Article 11 EU AI Act requires technical documentation for high-risk AI systems." },
    { title: "AI Risk Assessment", why: "Required to classify and mitigate risks of AI systems under the EU AI Act." },
    { title: "Human Oversight Plan", why: "Article 14 EU AI Act mandates human oversight measures for high-risk AI." },
    { title: "Technical Documentation", why: "Annex IV EU AI Act specifies required technical documentation contents." },
    { title: "Transparency Notice", why: "Article 52 requires users be informed when interacting with AI systems." },
  ],
  ISO_27001: [
    { title: "Information Security Policy", why: "Clause 5.2 ISO 27001 requires a documented information security policy." },
    { title: "Access Control Policy", why: "Annex A.9 requires access control policies and procedures." },
    { title: "Incident Response Plan", why: "Annex A.16 requires information security incident management procedures." },
    { title: "Business Continuity Plan", why: "Annex A.17 requires business continuity planning." },
    { title: "Asset Inventory", why: "Annex A.8 requires identification and management of information assets." },
    { title: "Risk Treatment Plan", why: "Clause 6.1 requires risk assessment and treatment processes." },
  ],
  SOC2: [
    { title: "System Description", why: "SOC 2 requires a description of the system and its boundaries." },
    { title: "Security Policy", why: "Trust Services Criteria CC1 requires security governance policies." },
    { title: "Change Management Policy", why: "CC8 requires controls for system changes." },
    { title: "Vendor Management Policy", why: "CC9 requires risk mitigation with vendors and business partners." },
    { title: "Logical Access Controls", why: "CC6 requires controls over logical and physical access." },
  ],
  NIS2: [
    { title: "Cybersecurity Risk Management Policy", why: "Article 21 NIS2 requires appropriate cybersecurity risk management measures." },
    { title: "Incident Reporting Procedures", why: "Articles 23/24 NIS2 require incident reporting within 24 hours." },
    { title: "Supply Chain Security Assessment", why: "Article 21(2)(d) NIS2 requires supply chain security measures." },
    { title: "Business Continuity & Crisis Management Plan", why: "Article 21(2)(c) NIS2 requires continuity planning." },
  ],
  DORA: [
    { title: "ICT Risk Management Framework", why: "Article 6 DORA requires a comprehensive ICT risk management framework." },
    { title: "ICT Incident Response Plan", why: "Articles 17-19 DORA require ICT-related incident management." },
    { title: "Digital Operational Resilience Testing Plan", why: "Articles 24-27 DORA require resilience testing programmes." },
    { title: "Third-Party ICT Risk Policy", why: "Articles 28-30 DORA require third-party ICT provider risk management." },
  ],
  CYBER_RESILIENCE_ACT: [
    { title: "Product Security Documentation", why: "CRA requires documentation of cybersecurity properties for digital products." },
    { title: "Vulnerability Handling Policy", why: "CRA mandates vulnerability handling and disclosure processes." },
    { title: "Software Bill of Materials (SBOM)", why: "CRA requires an SBOM for transparency on software components." },
    { title: "Conformity Assessment Documentation", why: "CRA requires conformity assessment procedures documentation." },
  ],
};

let checklistCounter = 0;

function generateChecklist(
  frameworks: string[],
  answers: { usesAI?: boolean; dataCategories?: string[]; hasPrivacyPolicy?: boolean }
): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const seen = new Set<string>();

  for (const fw of frameworks) {
    const docs = FRAMEWORK_DOCUMENTS[fw];
    if (!docs) continue;
    for (const doc of docs) {
      const key = `${fw}::${doc.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      checklistCounter++;
      items.push({
        id: `chk_${Date.now()}_${checklistCounter}`,
        title: doc.title,
        why: doc.why,
        required: true,
        framework: fw,
      });
    }
  }

  // Add conditional items
  if (answers.usesAI && !frameworks.includes("EU_AI_ACT")) {
    items.push({
      id: `chk_${Date.now()}_${++checklistCounter}`,
      title: "AI Usage Disclosure",
      why: "Best practice when deploying AI systems, even if EU AI Act is not directly applicable.",
      required: false,
      framework: "GENERAL",
    });
  }

  return items;
}

// ─── Plan limits ─────────────────────────────────────────────────────────────

const PLAN_PROJECT_LIMITS: Record<string, number> = {
  FREE: 2,
  STARTER: 10,
  PRO: 50,
  BUSINESS: 999,
};

// ─── Schemas ─────────────────────────────────────────────────────────────────

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  industry: z.string().optional(),
  companySize: z.string().optional(),
  usesAI: z.boolean().default(false),
  aiDescription: z.string().optional(),
  aiPurposes: z.array(z.string()).default([]),
  dataCategories: z.array(z.string()).default([]),
  usesThirdPartyAI: z.boolean().default(false),
  thirdPartyProviders: z.array(z.string()).default([]),
  trainsOwnModels: z.boolean().default(false),
  hasPrivacyPolicy: z.boolean().default(false),
  selectedFrameworks: z.array(
    z.enum([
      "GDPR",
      "ISO_27001",
      "SOC2",
      "NIS2",
      "DORA",
      "EU_AI_ACT",
      "CYBER_RESILIENCE_ACT",
      "PRODUCT_LIABILITY",
      "CUSTOM",
    ])
  ).min(1, "Select at least one framework"),
});

// ─── GET: List projects ──────────────────────────────────────────────────────

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = session;

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { plan: true },
  });

  const projects = await db.project.findMany({
    where: { orgId, isActive: true },
    include: {
      frameworks: {
        select: { id: true, type: true, score: true },
      },
      scans: {
        select: { id: true, completedAt: true, score: true },
        orderBy: { completedAt: "desc" },
        take: 1,
      },
      documents: {
        select: { id: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const plan = org?.plan ?? "FREE";
  const limit = PLAN_PROJECT_LIMITS[plan] ?? 2;

  return Response.json({
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      industry: p.industry,
      complianceScore: p.complianceScore,
      frameworkCount: p.frameworks.length,
      frameworks: p.frameworks.map((f) => ({ type: f.type, score: f.score })),
      scanCount: p.scans.length,
      lastScanDate: p.scans[0]?.completedAt ?? null,
      documentCount: p.documents.length,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
    plan,
    limit,
    count: projects.length,
    atLimit: projects.length >= limit,
  });
}

// ─── POST: Create project ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = session;

  // Check plan limits
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { plan: true },
  });
  const plan = org?.plan ?? "FREE";
  const limit = PLAN_PROJECT_LIMITS[plan] ?? 2;
  const existingCount = await db.project.count({ where: { orgId, isActive: true } });

  if (existingCount >= limit) {
    return Response.json(
      { error: "Upgrade to create more projects", limit },
      { status: 403 }
    );
  }

  // Parse body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateProjectSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const data = parsed.data;

  // Generate the document checklist
  const checklist = generateChecklist(data.selectedFrameworks, {
    usesAI: data.usesAI,
    dataCategories: data.dataCategories,
    hasPrivacyPolicy: data.hasPrivacyPolicy,
  });

  // Create the project
  const project = await db.project.create({
    data: {
      orgId,
      name: data.name,
      description: data.description,
      industry: data.industry,
      companySize: data.companySize,
      usesAI: data.usesAI,
      aiDescription: data.aiDescription,
      aiPurposes: data.aiPurposes,
      dataCategories: data.dataCategories,
      usesThirdPartyAI: data.usesThirdPartyAI,
      thirdPartyProviders: data.thirdPartyProviders,
      trainsOwnModels: data.trainsOwnModels,
      hasPrivacyPolicy: data.hasPrivacyPolicy,
      applicableFrameworks: data.selectedFrameworks,
      documentChecklist: checklist,
      questionnaireAnswers: data,
      questionnaireCompletedAt: new Date(),
    },
  });

  // Create/link Framework records for each selected framework
  for (const fwType of data.selectedFrameworks) {
    await db.framework.upsert({
      where: { orgId_type: { orgId, type: fwType } },
      create: {
        orgId,
        type: fwType,
        status: "NOT_STARTED",
        score: 0,
        projectId: project.id,
      },
      update: {
        projectId: project.id,
      },
    });
  }

  // Fetch the project back with frameworks
  const result = await db.project.findUnique({
    where: { id: project.id },
    include: {
      frameworks: { select: { id: true, type: true, status: true } },
    },
  });

  return Response.json({
    project: result,
    checklist,
  });
}
