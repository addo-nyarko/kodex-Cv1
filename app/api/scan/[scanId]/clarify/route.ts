import { getSession } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  loadScanState,
  saveScanState,
  pushScanEvent,
  queueNextChunk,
  type ScanChunkState,
} from "@/lib/queue/scan-queue";
import { frameworkRegistry } from "@/lib/frameworks/registry";

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
  if (!scan) {
    return Response.json({ error: "Scan not found" }, { status: 404 });
  }

  // If scan already completed, that's OK — answer arrived too late but don't error
  if (scan.status === "COMPLETED") {
    return Response.json({ ok: true, alreadyCompleted: true });
  }

  if (scan.status !== "AWAITING_CLARIFICATION") {
    return Response.json({ error: "Scan not awaiting clarification" }, { status: 400 });
  }

  const answer = body.data.answer;

  // Detect AI usage corrections
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
    data: { status: "RUNNING", pendingQuestion: null, pendingControlCode: null },
  });

  await pushScanEvent(scanId, "Clarification received — resuming scan...");

  // Try to load existing state from Redis
  let state = await loadScanState(scanId);

  if (!state) {
    // State expired (Redis TTL exceeded) — do NOT silently reinitialize
    // Return error to client so user sees a clear message
    await db.scan.update({
      where: { id: scanId },
      data: {
        status: "FAILED",
        errorMessage: "Scan session expired. Your answers were saved but the scan state timed out. Please start a new scan.",
      },
    });
    return Response.json({
      ok: false,
      expired: true,
      message: "Your scan session expired. Your answers have been saved. Please start a new scan with the same frameworks to continue.",
    }, { status: 410 });
  }

  // Resume from where we left off — move past the control that needed clarification
  state.controlIndex = state.controlIndex + 1;
  state.clarificationAsked = false;
  await saveScanState(state);

  // Queue the next chunk
  await queueNextChunk(scanId);

  return Response.json({ ok: true });
}

async function detectAndApplyCorrections(orgId: string, answer: string) {
  const lower = answer.toLowerCase();

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
