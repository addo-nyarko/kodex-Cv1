"use client";

import Link from "next/link";
import { Shield, Lock, CheckCircle, Zap, Globe, FileCheck, X, Check, ArrowRight, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

export default function LandingPage() {
  const [selectedFramework, setSelectedFramework] = useState<{
    title: string;
    subtitle: string;
    definition: string;
  } | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <AnimatePresence>
        {selectedFramework && (
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedFramework(null)}
          >
            <motion.div
              className="bg-card border border-border rounded-2xl p-8 max-w-2xl w-full shadow-2xl relative overflow-hidden"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600" />
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="mb-2">{selectedFramework.title}</h2>
                  <p className="text-muted-foreground">{selectedFramework.subtitle}</p>
                </div>
                <motion.button
                  onClick={() => setSelectedFramework(null)}
                  className="p-2 rounded-lg hover:bg-accent transition-colors"
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <X className="h-5 w-5" />
                </motion.button>
              </div>
              <p className="text-foreground/90 leading-relaxed mb-6">
                {selectedFramework.definition}
              </p>
              <Link
                href="/sign-up"
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors w-full flex items-center justify-center gap-2 group"
              >
                Get started with {selectedFramework.title}
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fixed Nav */}
      <nav className="fixed top-0 w-full bg-background/80 backdrop-blur-md border-b border-border z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 rounded-lg p-2 flex items-center justify-center w-10 h-10">
              <span className="text-white font-bold">KC</span>
            </div>
            <span className="font-semibold">Kodex-Compliance</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#features" className="hover:text-blue-600 transition-colors">Features</a>
            <a href="#pricing" className="hover:text-blue-600 transition-colors">Pricing</a>
            <Link href="/sign-in" className="text-blue-600 hover:text-blue-700">Sign In</Link>
            <ThemeToggle />
            <Link href="/sign-up" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors">
              Start free
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-32 pb-20 px-6 relative overflow-hidden">
        {/* Animated background blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div className="absolute top-20 left-10 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl" animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} />
          <motion.div className="absolute top-40 right-20 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" animate={{ scale: [1.2, 1, 1.2], opacity: [0.2, 0.4, 0.2] }} transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }} />
          <motion.div className="absolute bottom-40 left-1/3 w-64 h-64 bg-blue-400/10 rounded-full blur-3xl" animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.4, 0.2] }} transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }} />
        </div>

        <div className="max-w-7xl mx-auto relative z-10">
          {/* Hero */}
          <motion.div className="text-center mb-20" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <motion.div className="inline-flex items-center gap-2 bg-blue-600/10 text-blue-600 px-4 py-2 rounded-full mb-8 border border-blue-600/20" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
              <Shield className="h-4 w-4" />
              <span>EU-native • GDPR by design</span>
            </motion.div>

            <motion.h1 className="text-6xl mb-6 bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent max-w-4xl mx-auto" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              Audit-ready in 14 days. Stay compliant automatically.
            </motion.h1>

            <motion.p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-12" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
              GDPR, EU AI Act, ISO 27001, SOC 2 — without a compliance consultant. AI-guided, self-serve, and 10× cheaper than the alternatives.
            </motion.p>

            <motion.div className="flex items-center justify-center gap-4 mb-8" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
              <Link href="/sign-up" className="bg-blue-600 text-white px-8 py-4 rounded-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 hover:shadow-xl hover:shadow-blue-600/30 hover:scale-105 flex items-center gap-2 group">
                Start free — no card required
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link href="#pricing" className="border border-border px-8 py-4 rounded-lg hover:bg-accent transition-all hover:scale-105">
                See pricing
              </Link>
            </motion.div>

            <p className="text-sm text-muted-foreground">Supported EU frameworks</p>
          </motion.div>

          {/* Framework Cards */}
          <motion.div id="features" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            {[
              { icon: Lock, title: "GDPR", subtitle: "Data protection", definition: "The General Data Protection Regulation (GDPR) is the EU's comprehensive data privacy law that governs how organizations collect, store, and process personal data of EU citizens." },
              { icon: Shield, title: "EU AI Act", subtitle: "AI governance", definition: "The EU AI Act is the world's first comprehensive AI regulation, establishing requirements for high-risk AI systems including transparency, human oversight, and risk management." },
              { icon: FileCheck, title: "ISO 27001", subtitle: "Info security", definition: "ISO 27001 is an international standard for information security management systems (ISMS), providing a systematic approach to managing sensitive company information." },
              { icon: CheckCircle, title: "SOC 2", subtitle: "Trust & reliability", definition: "SOC 2 is an auditing standard that evaluates an organization's information systems based on five trust service criteria: security, availability, processing integrity, confidentiality, and privacy." },
              { icon: Globe, title: "NIS2", subtitle: "Network security", definition: "The Network and Information Security Directive 2 (NIS2) strengthens cybersecurity requirements across the EU, mandating risk management measures and incident reporting." },
              { icon: Zap, title: "DORA", subtitle: "Digital resilience", definition: "The Digital Operational Resilience Act (DORA) creates a comprehensive framework for digital operational resilience in the EU financial sector." },
              { icon: Shield, title: "CRA", subtitle: "Cyber resilience", definition: "The Cyber Resilience Act (CRA) establishes cybersecurity requirements for products with digital elements throughout their lifecycle." },
              { icon: CheckCircle, title: "NIS2 + more", subtitle: "Cross-framework", definition: "Cross-framework compliance combines multiple regulatory requirements into a unified approach, helping organizations efficiently meet overlapping obligations." },
            ].map((framework, idx) => (
              <motion.button
                key={idx}
                onClick={() => setSelectedFramework(framework)}
                className="bg-card border border-border rounded-xl p-6 hover:shadow-lg hover:shadow-blue-600/5 transition-all hover:-translate-y-1 text-left relative overflow-hidden group"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                whileHover={{ scale: 1.02 }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="bg-blue-600/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4 relative z-10">
                  <framework.icon className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="mb-1 relative z-10">{framework.title}</h3>
                <p className="text-sm text-muted-foreground relative z-10">{framework.subtitle}</p>
              </motion.button>
            ))}
          </motion.div>

          {/* Pricing */}
          <motion.div id="pricing" className="mb-20" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <div className="text-center mb-12">
              <motion.div className="inline-flex items-center gap-2 bg-purple-600/10 text-purple-600 dark:text-purple-400 px-4 py-2 rounded-full mb-4" initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}>
                <Sparkles className="h-4 w-4" />
                <span>Simple, transparent pricing</span>
              </motion.div>
              <h2 className="text-4xl mb-4">Choose your plan</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">Start for free and scale as your compliance needs grow</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {[
                { name: "Starter", price: "€99", period: "/month", description: "Perfect for small teams getting started", features: ["1 compliance framework", "Up to 3 team members", "Basic AI scans", "Email support", "Policy templates"], highlighted: false },
                { name: "Professional", price: "€299", period: "/month", description: "For growing companies with multiple frameworks", features: ["Up to 5 frameworks", "Up to 10 team members", "Advanced AI scans", "Priority support", "Custom policies", "Risk management", "Evidence vault"], highlighted: true },
                { name: "Enterprise", price: "Custom", period: "", description: "For large organizations with complex needs", features: ["Unlimited frameworks", "Unlimited team members", "Dedicated AI assistant", "24/7 premium support", "Custom integrations", "Advanced analytics", "Compliance consulting", "SLA guarantee"], highlighted: false },
              ].map((plan, idx) => (
                <motion.div key={idx} className={`relative rounded-2xl p-8 ${plan.highlighted ? "bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-2xl shadow-blue-600/20 scale-105" : "bg-card border border-border"}`} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: idx * 0.1 }} whileHover={{ scale: plan.highlighted ? 1.08 : 1.02 }}>
                  {plan.highlighted && <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-purple-600 text-white px-4 py-1 rounded-full text-sm">Most Popular</div>}
                  <div className="mb-6">
                    <h3 className={`text-2xl mb-2 ${plan.highlighted ? "text-white" : ""}`}>{plan.name}</h3>
                    <div className="flex items-baseline gap-1 mb-3">
                      <span className="text-4xl">{plan.price}</span>
                      <span className={`text-sm ${plan.highlighted ? "text-blue-100" : "text-muted-foreground"}`}>{plan.period}</span>
                    </div>
                    <p className={`text-sm ${plan.highlighted ? "text-blue-100" : "text-muted-foreground"}`}>{plan.description}</p>
                  </div>
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature, fIdx) => (
                      <li key={fIdx} className="flex items-start gap-3">
                        <Check className={`h-5 w-5 flex-shrink-0 ${plan.highlighted ? "text-blue-100" : "text-blue-600"}`} />
                        <span className={`text-sm ${plan.highlighted ? "text-blue-50" : ""}`}>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href="/sign-up" className={`block w-full py-3 rounded-lg text-center transition-all ${plan.highlighted ? "bg-white text-blue-600 hover:bg-blue-50" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
                    Get started
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* CTA */}
          <motion.div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-12 text-white text-center relative overflow-hidden" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-10 left-10 w-32 h-32 border-2 border-white rounded-full" />
              <div className="absolute bottom-10 right-10 w-40 h-40 border-2 border-white rounded-lg rotate-12" />
              <div className="absolute top-1/2 left-1/4 w-24 h-24 border-2 border-white rounded-full" />
            </div>
            <div className="relative z-10">
              <h2 className="text-4xl mb-4">Ready to automate your compliance?</h2>
              <p className="text-blue-100 mb-8 max-w-2xl mx-auto">Join hundreds of companies who trust Kodex-Compliance for their regulatory needs.</p>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="inline-block">
                <Link href="/sign-up" className="bg-white text-blue-600 px-8 py-4 rounded-lg hover:bg-blue-50 transition-all shadow-lg hover:shadow-xl flex items-center gap-2 group">
                  Get started today
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </main>

      <footer className="border-t border-border py-12 px-6">
        <div className="max-w-7xl mx-auto text-center text-muted-foreground">
          <p>© 2026 Kodex-Compliance. Simplifying regulatory compliance across Europe.</p>
        </div>
      </footer>
    </div>
  );
}
