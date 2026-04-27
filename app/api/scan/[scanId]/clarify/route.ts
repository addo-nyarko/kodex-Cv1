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
  if (!scan || scan.status !== "AWAITING_CLARIFICATION") {
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

  if (state) {
    // Resume from where we left off — move past the control that needed clarification
    state.controlIndex = state.controlIndex + 1;
    state.clarificationAsked = false;
    await saveScanState(state);
  } else {
    // State expired — reinitialize from scratch
    const plugin = frameworkRegistry.get(scan.framework.type);
    const newState: ScanChunkState = {
      scanId,
      frameworkType: scan.framework.type,
      orgId,
      controlIndex: 0,
      totalControls: plugin?.rules.length ?? 0,
      evidencePrepared: false,
      useLLM: false,
      clarificationAsked: false,
      phase: "evidence", // Re-assemble evidence since it expired
    };
    await saveScanState(newState);
  }

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
