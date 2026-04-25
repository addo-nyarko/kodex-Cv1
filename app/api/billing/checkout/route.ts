import { getSession } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { z } from "zod";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";

const CheckoutSchema = z.object({
  priceId: z.string(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { userId, orgId } = session;

  const body = CheckoutSchema.safeParse(await req.json());
  if (!body.success) return Response.json({ error: "Invalid input" }, { status: 422 });

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  let customerId: string;
  const subscription = await db.subscription.findUnique({ where: { orgId } });

  if (subscription?.stripeCustomerId) {
    customerId = subscription.stripeCustomerId;
  } else {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name ?? undefined,
      metadata: { orgId, userId: user.id },
    });
    customerId = customer.id;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card", "sepa_debit"],
    line_items: [{ price: body.data.priceId, quantity: 1 }],
    mode: "subscription",
    success_url: body.data.successUrl ?? `${appUrl}/settings/billing?success=true`,
    cancel_url: body.data.cancelUrl ?? `${appUrl}/pricing`,
    automatic_tax: { enabled: true },
    customer_update: { address: "auto" },
    metadata: { orgId },
  });

  return Response.json({ url: checkoutSession.url });
}
