import { getSession } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { anthropic, AI_MODELS, SYSTEM_PROMPTS } from "@/lib/ai";
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
          framework: { select: { type: true } },
          controlResults: { include: { control: { select: { code: true } } } },
          clarifications: true,
        },
      });
      if (scan) {
        const controlResults: Array<{ status: string; control: { code: string } }> = scan.controlResults as any;
        const clarifications: Array<{ controlCode: string; question: string; answer: string | null }> = scan.clarifications as any;
        const completedControls = controlResults.length;
        const passedControls = controlResults.filter((r) => r.status === "PASS").length;
        const priorClarifications = clarifications
          .filter((c) => c.answer)
          .map((c) => `  Q (${c.controlCode}): ${c.question}\n  A: ${c.answer}`)
          .join("\n");

        scanContext = `\n\nACTIVE SCAN CONTEXT:
- Scan ID: ${scan.id}
- Framework: ${scan.framework?.type ?? "Unknown"}
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

  const stream = await anthropic.messages.create({
    model: AI_MODELS.CHAT,
    max_tokens: 1024,
    stream: true,
    system: contextualSystem,
    messages: messages as Parameters<typeof anthropic.messages.create>[0]['messages'],
  });

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
          controller.enqueue(encoder.encode(chunk.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
