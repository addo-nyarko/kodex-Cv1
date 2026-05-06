import { getSession } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getScanEvents } from "@/lib/queue/scan-queue";

/**
 * GET /api/scan/[scanId]/events
 * Get recent scan events for the live feed.
 *
 * Query params:
 *   ?limit=N — maximum number of events to return (default 20)
 *   ?offset=N — skip first N events (default 0)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { scanId } = await params;
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10), 100);
  const offset = parseInt(req.nextUrl.searchParams.get("offset") ?? "0", 10);

  const scan = await db.scan.findFirst({
    where: { id: scanId, orgId: session.orgId },
  });

  if (!scan) return Response.json({ error: "Scan not found" }, { status: 404 });

  // Get all events from Redis
  const allEvents = await getScanEvents(scanId);

  // Return paginated events
  const paginatedEvents = allEvents.slice(offset, offset + limit);

  return Response.json({
    events: paginatedEvents,
    total: allEvents.length,
    limit,
    offset,
    hasMore: offset + limit < allEvents.length,
  });
}