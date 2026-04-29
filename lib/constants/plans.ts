/**
 * Plan-based limits enforced at API gates. Use `isOverLimit(session, count, limit)`
 * from `@/lib/admin` at each gate site — it applies the limit with founder bypass built in.
 * -1 means unlimited.
 */
export const PLAN_LIMITS = {
  FREE:     { frameworks: 1, users: 1,  evidence: 10,  aiRequests: 5,   integrations: 0,  apiAccess: false, sso: false },
  STARTER:  { frameworks: 1, users: 3,  evidence: 100, aiRequests: 50,  integrations: 3,  apiAccess: false, sso: false },
  PRO:      { frameworks: 3, users: 10, evidence: -1,  aiRequests: 500, integrations: 10, apiAccess: false, sso: false },
  BUSINESS: { frameworks: -1, users: 25, evidence: -1, aiRequests: -1,  integrations: -1, apiAccess: true,  sso: true  },
} as const;

export const PLAN_PRICES = {
  STARTER:  { monthly: 2900,  yearly: 27840  },
  PRO:      { monthly: 9900,  yearly: 95040  },
  BUSINESS: { monthly: 29900, yearly: 287040 },
} as const;
