import { getSession } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { z } from "zod";
import { anthropic, AI_MODELS, SYSTEM_PROMPTS } from "@/lib/ai";
import { db } from "@/lib/db";

const GeneratePolicySchema = z.object({
  policyType: z.string(),
  frameworks: z.array(z.string()),
  additionalContext: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = session;

  const body = GeneratePolicySchema.safeParse(await req.json());
  if (!body.success) return Response.json({ error: "Invalid input" }, { status: 422 });

  const org = await db.organization.findUnique({ where: { id: orgId } });

  const { policyType, frameworks, additionalContext } = body.data;

  const msg = await anthropic.messages.create({
    model: AI_MODELS.SMART,
    max_tokens: 4096,
    system: SYSTEM_PROMPTS.POLICY_GENERATOR,
    messages: [
      {
        role: "user",
        content: `Generate a ${policyType} policy for:\n- Company: ${org?.name ?? "the organisation"}\n- Industry: ${org?.industry ?? "technology"}\n- Frameworks: ${frameworks.join(", ")}\n- Country: ${org?.country ?? "EU"}\n${additionalContext ? `- Additional context: ${additionalContext}` : ""}\n\nOutput complete, audit-ready policy in markdown.`,
      },
    ],
  });

  const content = (msg.content[0] as { text: string }).text;

  const policy = await db.policy.create({
    data: {
      orgId,
      title: `${policyType} Policy`,
      contentText: content,
      aiGenerated: true,
      status: "DRAFT",
    },
  });

  return Response.json({ policyId: policy.id, content });
}
