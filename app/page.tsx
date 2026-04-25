import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-border">
        <span className="text-xl font-bold tracking-tight">Kodex</span>
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
          <Link href="#features" className="hover:text-foreground transition-colors">Features</Link>
          <Link href="/sign-in" className="hover:text-foreground transition-colors">Sign in</Link>
          <Link href="/sign-up" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors">
            Start free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-8 pt-24 pb-16 text-center">
        <div className="inline-block mb-6 px-4 py-1.5 text-xs font-medium bg-blue-600/10 text-blue-400 rounded-full border border-blue-600/20">
          EU-native · Zero US dependency · GDPR by design
        </div>
        <h1 className="text-5xl font-bold tracking-tight mb-6 bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-transparent leading-tight">
          Audit-ready in 14 days.
          <br />
          Stay compliant automatically.
        </h1>
        <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
          GDPR, EU AI Act, ISO 27001, SOC 2 — without a compliance consultant.
          AI-guided, self-serve, and 10× cheaper than the alternatives.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/sign-up" className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors">
            Start free — no card required
          </Link>
          <Link href="/pricing" className="px-6 py-3 text-muted-foreground hover:text-foreground transition-colors">
            See pricing
          </Link>
        </div>
      </section>

      {/* Frameworks */}
      <section id="features" className="max-w-5xl mx-auto px-8 pb-24">
        <p className="text-center text-sm text-muted-foreground mb-8">Supported EU frameworks</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { name: "GDPR", icon: "🔒", desc: "Data protection" },
            { name: "EU AI Act", icon: "🤖", desc: "AI governance" },
            { name: "ISO 27001", icon: "🛡️", desc: "Info security" },
            { name: "SOC 2", icon: "✅", desc: "Trust & reliability" },
            { name: "NIS2", icon: "🌐", desc: "Network security" },
            { name: "DORA", icon: "⚡", desc: "Digital resilience" },
            { name: "CRA", icon: "🔐", desc: "Cyber resilience" },
            { name: "NIS2 + more", icon: "➕", desc: "Cross-framework" },
          ].map((f) => (
            <div key={f.name} className="p-5 rounded-xl border border-border bg-card hover:border-blue-600/30 transition-colors">
              <div className="text-2xl mb-3">{f.icon}</div>
              <div className="font-semibold text-sm">{f.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
