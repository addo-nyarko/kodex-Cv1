import { getSession } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = session;

  const frameworks = await db.framework.findMany({
    where: { orgId },
    include: {
      controls: { select: { id: true, code: true, title: true, status: true } },
      _count: { select: { scans: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return Response.json({ frameworks });
}

const AddFrameworkSchema = z.object({
  type: z.enum(["GDPR", "ISO_27001", "SOC2", "NIS2", "DORA", "EU_AI_ACT", "CYBER_RESILIENCE_ACT", "PRODUCT_LIABILITY", "CUSTOM"]),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = session;

  const contentType = req.headers.get("content-type") ?? "";
  let rawBody: unknown;
  if (contentType.includes("application/json")) {
    try {
      rawBody = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
  } else {
    const form = await req.formData();
    rawBody = Object.fromEntries(form);
  }
  const body = AddFrameworkSchema.safeParse(rawBody);
  if (!body.success) return Response.json({ error: "Invalid input" }, { status: 422 });

  const framework = await db.framework.upsert({
    where: { orgId_type: { orgId, type: body.data.type } },
    create: { orgId, type: body.data.type, status: "NOT_STARTED" },
    update: {},
  });

  return Response.json({ id: framework.id });
}
