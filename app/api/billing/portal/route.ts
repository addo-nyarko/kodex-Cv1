import { getSession } from "@/lib/auth-helper";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";

export async function POST() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = session;

  const subscription = await db.subscription.findUnique({ where: { orgId } });
  if (!subscription?.stripeCustomerId) {
    return Response.json({ error: "No billing account found" }, { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${appUrl}/settings/billing`,
  });

  return Response.json({ url: portalSession.url });
}
