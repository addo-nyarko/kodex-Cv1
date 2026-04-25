"use client";

import { useState } from "react";

const plans = [
  { name: "Starter", price: 29, priceId: process.env.NEXT_PUBLIC_STRIPE_STARTER_MONTHLY_PRICE_ID ?? "" },
  { name: "Pro", price: 99, priceId: process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID ?? "" },
  { name: "Business", price: 299, priceId: process.env.NEXT_PUBLIC_STRIPE_BUSINESS_MONTHLY_PRICE_ID ?? "" },
];

export default function BillingPage() {
  const [loading, setLoading] = useState(false);

  async function handleCheckout(priceId: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  async function handlePortal() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">Billing</h1>
      <p className="text-muted-foreground text-sm mb-8">Manage your subscription and billing details.</p>

      <button
        onClick={handlePortal}
        disabled={loading}
        className="mb-8 px-4 py-2 border border-border rounded-lg text-sm hover:border-primary/30 disabled:opacity-50"
      >
        Manage subscription
      </button>

      <h2 className="font-semibold mb-4">Upgrade plan</h2>
      <div className="grid grid-cols-3 gap-4">
        {plans.map((plan) => (
          <div key={plan.name} className="bg-card border border-border rounded-xl p-4">
            <div className="font-bold mb-1">{plan.name}</div>
            <div className="text-2xl font-bold mb-4">€{plan.price}<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
            <button
              onClick={() => handleCheckout(plan.priceId)}
              disabled={loading || !plan.priceId}
              className="w-full py-2 bg-primary rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "..." : `Get ${plan.name}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
