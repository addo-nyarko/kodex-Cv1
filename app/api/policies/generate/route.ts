import { getSession } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  findTemplate,
  buildGenerationPrompt,
  streamGenerateDocument,
  DOCUMENT_TEMPLATES,
  type IntegrationContext,
} from "@/lib/document-generator";
import { decrypt } from "@/lib/integrations/crypto";

const GenerateSchema = z.object({
  /** The checklist item title — used to match a document template */
  checklistTitle: z.string(),
  /** Optional: explicit template key (privacy_policy, ai_system_description, etc.) */
  templateKey: z.string().optional(),
  /** Optional: which checklist item ID this fulfills */
  checklistItemId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = session;

  const body = GenerateSchema.safeParse(await req.json());
  if (!body.success) return Response.json({ error: "Invalid input" }, { status: 422 });

  const { checklistTitle, templateKey, checklistItemId } = body.data;

  // Find the right template
  const template = templateKey
    ? DOCUMENT_TEMPLATES[templateKey]
    : findTemplate(checklistTitle);

  if (!template) {
    return Response.json(
      { error: `No template found for "${checklistTitle}"` },
      { status: 400 }
    );
  }

  // Load org context
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: {
      name: true,
      industry: true,
      country: true,
      size: true,
      productDescription: true,
      usesAI: true,
      aiDescription: true,
      aiPurposes: true,
      dataCategories: true,
      userTypes: true,
      usesThirdPartyAI: true,
      thirdPartyProviders: true,
      trainsOwnModels: true,
      riskTier: true,
      applicableFrameworks: true,
      frameworks: {
        select: {
          type: true,
          controls: { select: { id: true, code: true, title: true } },
        },
      },
    },
  });

  if (!org) return Response.json({ error: "Org not found" }, { status: 404 });

  // Load integration signals if available (makes generated docs reference real infrastructure)
  let integrationContext: IntegrationContext | undefined;
  try {
    const ghIntegration = await db.integration.findUnique({
      where: { orgId_type: { orgId, type: "GITHUB" } },
    });
    if (ghIntegration?.status === "CONNECTED" && ghIntegration.encryptedConfig) {
      const config = JSON.parse(decrypt(ghIntegration.encryptedConfig));
      if (config.lastScanResults) {
        integrationContext = { github: config.lastScanResults };
      }
    }
  } catch (err) {
    // Non-fatal — generate without integration data if decryption fails
    console.warn("Could not load integration signals:", err);
  }

  const prompt = buildGenerationPrompt(template, org, integrationContext);

  // Create the Policy record upfront (status: DRAFT)
  const policy = await db.policy.create({
    data: {
      orgId,
      title: template.title,
      status: "DRAFT",
      aiGenerated: true,
      aiPromptUsed: prompt,
      applicableFrameworks: org.applicableFrameworks,
    },
  });

  // Find matching controls to link evidence to
  const matchingControls: string[] = [];
  for (const fw of org.frameworks) {
    for (const ctrl of fw.controls) {
      if (template.controlCodes.includes(ctrl.code)) {
        matchingControls.push(ctrl.id);
      }
    }
  }

  // Stream the response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Send metadata first
      send({
        type: "meta",
        policyId: policy.id,
        title: template.title,
        frameworkRefs: template.frameworkRefs,
      });

      let fullContent = "";

      try {
        const gen = streamGenerateDocument(template, prompt);

        for await (const chunk of gen) {
          fullContent += chunk;
          send({ type: "chunk", text: chunk });
        }

        // Save the full content
        await db.policy.update({
          where: { id: policy.id },
          data: {
            contentText: fullContent,
            content: { markdown: fullContent },
          },
        });

        // Create Evidence records linked to matching controls
        const evidenceIds: string[] = [];
        for (const controlId of matchingControls) {
          const evidence = await db.evidence.create({
            data: {
              controlId,
              title: template.title,
              description: `AI-generated ${template.title} — created by Kodex`,
              type: "POLICY",
              status: "PENDING",
              fileName: `${template.title.toLowerCase().replace(/\s+/g, "-")}.md`,
              extractedText: fullContent,
              textExtractedAt: new Date(),
            },
          });
          evidenceIds.push(evidence.id);
        }

        send({
          type: "complete",
          policyId: policy.id,
          evidenceIds,
          checklistItemId,
          contentLength: fullContent.length,
        });
      } catch (err) {
        console.error("Document generation error:", err);
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Generation failed",
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
