import { getSession } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { openai, AI_MODELS, SYSTEM_PROMPTS } from "@/lib/ai";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = session;

  const { messages, frameworkContext, scanId } = await req.json();

  const org = await db.organization.findUnique({ where: { id: orgId } });

  // Build scan context if a scanId is provided
  let scanContext = "";
  if (scanId) {
    try {
      const scan = await db.scan.findFirst({
        where: { id: scanId, orgId },
        include: {
          framework: { select: { type: true, name: true } },
          controlResults: { select: { controlCode: true, status: true, confidence: true } },
          clarifications: { select: { question: true, answer: true, controlCode: true } },
        },
      });
      if (scan) {
        const completedControls = scan.controlResults.length;
        const passedControls = scan.controlResults.filter((r) => r.status === "PASS").length;
        const priorClarifications = scan.clarifications
          .filter((c) => c.answer)
          .map((c) => `  Q (${c.controlCode}): ${c.question}\n  A: ${c.answer}`)
          .join("\n");

        scanContext = `\n\nACTIVE SCAN CONTEXT:
- Scan ID: ${scan.id}
- Framework: ${scan.framework?.name ?? scan.framework?.type ?? "Unknown"}
- Status: ${scan.status}
- Controls evaluated so far: ${completedControls} (${passedControls} passed)
${scan.pendingQuestion ? `- PENDING QUESTION (control ${scan.pendingControlCode}): ${scan.pendingQuestion}` : ""}
${scan.score !== null ? `- Current score: ${scan.score}%` : ""}
${scan.riskLevel ? `- Risk level: ${scan.riskLevel}` : ""}
${priorClarifications ? `\nPrior clarifications already answered:\n${priorClarifications}` : ""}

The user has been redirected here to answer a clarification question as part of the scan.
Their answer will be submitted to the scan engine automatically.
After they answer, the scan will resume in the background.
If they ask about scan progress or results, you can tell them what you know from the context above.`;
      }
    } catch {
      // Non-critical — continue without scan context
    }
  }

  const contextualSystem =
    SYSTEM_PROMPTS.COMPLIANCE_ASSISTANT +
    (org ? `\n\nOrganisation context: ${org.name}, industry: ${org.industry}, country: ${org.country}.` : "") +
    (frameworkContext ? `\n\nCurrent framework: ${frameworkContext}.` : "") +
    scanContext;

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
