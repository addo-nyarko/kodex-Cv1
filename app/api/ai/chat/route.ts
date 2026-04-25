import { getSession } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { openai, AI_MODELS, SYSTEM_PROMPTS } from "@/lib/ai";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = session;

  const { messages, frameworkContext } = await req.json();

  const org = await db.organization.findUnique({ where: { id: orgId } });

  const contextualSystem =
    SYSTEM_PROMPTS.COMPLIANCE_ASSISTANT +
    (org ? `\n\nOrganisation context: ${org.name}, industry: ${org.industry}, country: ${org.country}.` : "") +
    (frameworkContext ? `\n\nCurrent framework: ${frameworkContext}.` : "");

  const stream = await openai.chat.completions.create({
    model: AI_MODELS.CHAT,
    stream: true,
    messages: [
      { role: "system", content: contextualSystem },
      ...messages,
    ],
  });

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) controller.enqueue(encoder.encode(text));
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
