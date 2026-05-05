import { getSession } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  saveScanState,
  pushScanEvent,
  queueNextChunk,
  type ScanChunkState,
} from "@/lib/queue/scan-queue";

const StartScanSchema = z.object({
  frameworkId: z.string().optional(),
  frameworkIds: z.array(z.string()).optional(),
  projectId: z.string().optional(),
  questionnaire: z.record(z.string(), z.unknown()).optional(),
}).refine(
  (d) => d.frameworkId || (d.frameworkIds && d.frameworkIds.length > 0),
  { message: "At least one framework must be specified" }
);

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = session;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = StartScanSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 422 });
  }

  const { frameworkId, frameworkIds: rawIds, projectId, questionnaire } = parsed.data;

  // Normalize to array of IDs
  const allIds = rawIds && rawIds.length > 0 ? rawIds : [frameworkId!];

  // Validate all frameworks exist and belong to the org
  const frameworks = await db.framework.findMany({
    where: { id: { in: allIds }, orgId },
  });

  if (frameworks.length === 0) {
    return Response.json({ error: "No valid frameworks found" }, { status: 404 });
  }

  // If projectId provided, validate all frameworks belong to it
  if (projectId) {
    const invalidFrameworks = frameworks.filter((fw: any) => fw.projectId !== projectId);
    if (invalidFrameworks.length > 0) {
      return Response.json(
        { error: "Some frameworks don't belong to the specified project" },
        { status: 400 }
      );
    }
  }

  // Create a scan record for each framework
  const scans = await Promise.all(
    frameworks.map((fw: any) =>
      db.scan.create({
        data: {
          orgId,
          frameworkId: fw.id,
          status: "QUEUED",
          evidenceSnapshot: (questionnaire ?? {}) as object,
          projectId: projectId ?? null,
        },
      })
    )
  );

  const scanIds = scans.map((s: any) => s.id);
  const firstScan = scans[0];
  const firstFramework = frameworks[0] as any;

  // Build pending frameworks list for multi-framework scans
  const pendingFrameworks = frameworks.length > 1
    ? frameworks.slice(1).map((fw: any, i: number) => ({
        scanId: scans[i + 1].id,
        frameworkType: fw.type,
      }))
    : undefined;

  // Initialize scan state in Redis
  const initialState: ScanChunkState = {
    scanId: firstScan.id,
    frameworkType: firstFramework.type,
    orgId,
    controlIndex: 0,
    totalControls: 0,
    evidencePrepared: false,
    useLLM: false,
    clarificationAsked: false,
    phase: "evidence",
    pendingFrameworks,
  };

  await saveScanState(initialState);

  // Push initial event for the frontend
  const message = frameworks.length > 1
    ? `Starting multi-framework scan — ${frameworks.length} frameworks queued...`
    : "Scan started — analyzing your evidence...";

  await pushScanEvent(firstScan.id, message);

  // Mark first scan as running
  await db.scan.update({
    where: { id: firstScan.id },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  // Queue the first chunk via QStash
  await queueNextChunk(firstScan.id);

  // Return immediately — frontend will poll for progress
  return Response.json({
    scanId: firstScan.id,
    scanIds,
    message,
  });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = session;

  const projectId = req.nextUrl.searchParams.get("projectId");

  const scans = await db.scan.findMany({
    where: {
      orgId,
      status: "COMPLETED",
      ...(projectId ? { projectId } : {}),
    },
    include: {
      framework: {
        select: {
          type: true,
        },
      },
    },
    orderBy: { completedAt: "desc" },
    take: 10,
  });

  return Response.json({
    scans: scans.map((scan: any) => ({
      id: scan.id,
      frameworkType: scan.framework?.type ?? "UNKNOWN",
      score: scan.score ?? 0,
      riskLevel: scan.riskLevel ?? "UNKNOWN",
      completedAt: scan.completedAt,
      createdAt: scan.createdAt,
    })),
  });
}
