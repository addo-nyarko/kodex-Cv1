import { NextRequest } from "next/server";
import { Webhook } from "svix";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return Response.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);
  let event: { type: string; data: Record<string, unknown> };

  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as typeof event;
  } catch {
    return Response.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  if (event.type === "user.created") {
    const d = event.data;
    const email = (d.email_addresses as { email_address: string }[])[0]?.email_address;
    if (email) {
      await db.user.upsert({
        where: { clerkId: d.id as string },
        create: {
          clerkId: d.id as string,
          email,
          name: [d.first_name, d.last_name].filter(Boolean).join(" ") || null,
          avatarUrl: d.image_url as string | null,
        },
        update: {
          email,
          name: [d.first_name, d.last_name].filter(Boolean).join(" ") || null,
        },
      });
    }
  }

  if (event.type === "user.deleted") {
    const clerkId = event.data.id as string;
    const user = await db.user.findUnique({ where: { clerkId } });

    if (user) {
      // Delete all orgs owned by this user (cascades to everything else)
      await db.organization.deleteMany({ where: { ownerId: user.id } });
      // Delete the user
      await db.user.delete({ where: { id: user.id } });
    }
  }

  return Response.json({ received: true });
}
