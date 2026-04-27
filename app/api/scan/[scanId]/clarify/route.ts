import { getSession } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { runScan } from "@/lib/scan-engine";

const ClarifySchema = z.object({ answer: z.string().min(1) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = session;

  const { scanId } = await params;

  const body = ClarifySchema.safeParse(await req.json());
  if (!body.success) return Response.json({ error: "Invalid input" }, { status: 422 });

  const scan = await db.scan.findFirst({
    where: { id: scanId, orgId },
    include: { framework: { select: { type: true } } },
  });
  if (!scan || scan.status !== "AWAITING_CLARIFICATION") {
    return Response.json({ error: "Scan not awaiting clarification" }, { status: 400 });
  }

  const answer = body.data.answer;

  // Detect if the answer is correcting a previous onboarding mistake
  // (e.g., "typo, we do use AI", "yes we use AI", "correction: we use AI")
  await detectAndApplyCorrections(orgId, answer);

  await db.scanClarification.create({
    data: {
      scanId,
      question: scan.pendingQuestion ?? "",
      controlCode: scan.pendingControlCode,
      answer,
      answeredAt: new Date(),
    },
  });

  await db.scan.update({
    where: { id: scanId },
    data: { status: "QUEUED", pendingQuestion: null, pendingControlCode: null },
  });

  // Resume scan inline with correct framework type
  const generator = runScan(scanId, scan.framework.type, orgId);
  // Consume the generator in the background — don't block the response
  (async () => {
    try {
      for await (const _event of generator) { /* events handled inside runScan */ }
    } catch (err) {
      console.error("Resumed scan failed:", err);
      await db.scan.update({
        where: { id: scanId },
        data: {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : "Scan failed",
          completedAt: new Date(),
        },
      }).catch(() => {});
    }
  })();

  return Response.json({ ok: true });
}

/**
 * Detect if the user's answer corrects an onboarding field
 * (like AI usage) and update the org record accordingly.
 * This way the resumed scan will use the corrected data.
 */
async function detectAndApplyCorrections(orgId: string, answer: string) {
  const lower = answer.toLowerCase();

  // Detect AI usage corrections
  const aiCorrectionPatterns = [
    /typo.*(?:we|i|our).*(?:do|does|actually).*use.*ai/i,
    /correction.*(?:we|i|our).*use.*ai/i,
    /(?:we|i|our).*(?:do|does|actually).*use.*ai/i,
    /yes.*(?:we|i|our).*use.*ai/i,
    /(?:we|i).*deploy.*ai/i,
    /(?:we|i).*have.*ai.*system/i,
  ];

  const noAiPatterns = [
    /(?:we|i).*(?:do not|don't|dont).*use.*ai/i,
    /no.*ai/i,
  ];

  if (aiCorrectionPatterns.some((p) => p.test(lower)) && !noAiPatterns.some((p) => p.test(lower))) {
    await db.organization.update({
      where: { id: orgId },
      data: {
        usesAI: true,
        aiDescription: `Corrected during scan: ${answer}`,
      },
    });
  }
}
