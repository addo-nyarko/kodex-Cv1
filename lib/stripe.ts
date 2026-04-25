import Stripe from "stripe";

let _stripe: Stripe | null = null;
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    if (!_stripe) {
      _stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_placeholder", {
        apiVersion: "2026-03-25.dahlia",
      });
    }
    return (_stripe as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const PLANS = {
  FREE:     { name: "Free",     price: 0,     features: { frameworks: 1, users: 1,  evidence: 10,  aiRequests: 5,   integrations: 0,  apiAccess: false, sso: false } },
  STARTER:  { name: "Starter",  price: 2900,  features: { frameworks: 1, users: 3,  evidence: 100, aiRequests: 50,  integrations: 3,  apiAccess: false, sso: false } },
  PRO:      { name: "Pro",      price: 9900,  features: { frameworks: 3, users: 10, evidence: -1,  aiRequests: 500, integrations: 10, apiAccess: false, sso: false } },
  BUSINESS: { name: "Business", price: 29900, features: { frameworks: -1, users: 25, evidence: -1, aiRequests: -1,  integrations: -1, apiAccess: true,  sso: true  } },
} as const;

export type PlanKey = keyof typeof PLANS;
