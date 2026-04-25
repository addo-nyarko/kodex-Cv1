import Link from "next/link";

const plans = [
  {
    name: "Free",
    price: 0,
    description: "Explore and evaluate",
    features: ["1 framework", "1 user", "10 evidence items", "5 AI requests"],
    cta: "Start free",
    href: "/sign-up",
    highlighted: false,
  },
  {
    name: "Starter",
    price: 29,
    description: "Solo founders & small teams",
    features: ["1 framework", "3 users", "100 evidence items", "50 AI requests", "3 integrations"],
    cta: "Get started",
    href: "/sign-up",
    highlighted: false,
  },
  {
    name: "Pro",
    price: 99,
    description: "Growing teams, multiple frameworks",
    features: ["3 frameworks", "10 users", "Unlimited evidence", "500 AI requests", "10 integrations"],
    cta: "Start Pro",
    href: "/sign-up",
    highlighted: true,
  },
  {
    name: "Business",
    price: 299,
    description: "Full EU regulatory coverage",
    features: ["All frameworks", "25 users", "Unlimited everything", "API access", "SSO"],
    cta: "Contact us",
    href: "/sign-up",
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white px-8 py-16">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-4">Simple, transparent pricing</h1>
        <p className="text-center text-gray-400 mb-12">All plans billed in EUR. EU VAT applied where applicable.</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-6 border ${
                plan.highlighted
                  ? "border-blue-500 bg-blue-950/30"
                  : "border-gray-800 bg-gray-900"
              }`}
            >
              {plan.highlighted && (
                <div className="text-xs font-medium text-blue-400 mb-2">Most popular</div>
              )}
              <div className="text-lg font-bold mb-1">{plan.name}</div>
              <div className="text-3xl font-bold mb-1">
                {plan.price === 0 ? "Free" : `€${plan.price}`}
                {plan.price > 0 && <span className="text-sm font-normal text-gray-400">/mo</span>}
              </div>
              <div className="text-sm text-gray-400 mb-6">{plan.description}</div>
              <ul className="space-y-2 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="text-sm text-gray-300 flex items-center gap-2">
                    <span className="text-green-400">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={`block text-center py-2 rounded-lg text-sm font-medium ${
                  plan.highlighted
                    ? "bg-blue-600 hover:bg-blue-500 text-white"
                    : "border border-gray-700 hover:border-gray-600 text-gray-300"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
