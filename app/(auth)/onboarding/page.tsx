"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";

const INDUSTRIES = [
  "Technology", "Healthcare", "Finance", "Retail", "Education",
  "Legal", "Manufacturing", "Consulting", "Government", "Other",
];

const ROLES = [
  "CTO", "CIO/CISO", "DPO", "Legal Counsel", "Compliance Officer",
  "Engineering Lead", "Product Manager", "Founder/CEO", "Other",
];

const SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"];

const STEPS = ["About You", "Your Company", "Complete"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [direction, setDirection] = useState(1);
  const [form, setForm] = useState({
    industry: "",
    role: "",
    name: "",
    size: "1-10",
    country: "DE",
  });

  function goTo(next: number) {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  }

  async function handleSubmit() {
    setLoading(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industry: form.industry,
          role: form.role,
          name: form.name,
          size: form.size,
          country: form.country,
        }),
      });
      if (res.ok) {
        goTo(3);
      }
    } finally {
      setLoading(false);
    }
  }

  const variants = {
    enter: (d: number) => ({ x: d > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -80 : 80, opacity: 0 }),
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <motion.div
          className="flex items-center gap-3 mb-10 justify-center"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-sm">KC</span>
          </div>
          <span className="text-foreground text-xl font-bold tracking-tight">Kodex</span>
        </motion.div>

        {/* Step indicators */}
        <div className="mb-2 flex items-center justify-between">
          {STEPS.map((label, i) => {
            const stepNum = i + 1;
            const isActive = step === stepNum;
            const isComplete = step > stepNum;
            return (
              <div key={label} className="flex items-center gap-2 flex-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    isComplete
                      ? "bg-blue-600 text-white"
                      : isActive
                        ? "bg-blue-600 text-white"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isComplete ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    stepNum
                  )}
                </div>
                <span
                  className={`text-sm hidden sm:inline ${
                    isActive ? "text-foreground font-medium" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </span>
                {i < STEPS.length - 1 && (
                  <div className="flex-1 h-px bg-border mx-2" />
                )}
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-muted rounded-full mb-8 overflow-hidden">
          <motion.div
            className="h-full bg-blue-600 rounded-full"
            animate={{ width: `${(step / STEPS.length) * 100}%` }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
          />
        </div>

        {/* Step content */}
        <div className="relative overflow-hidden min-h-[360px]">
          <AnimatePresence mode="wait" custom={direction}>
            {step === 1 && (
              <motion.div
                key="step-1"
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="space-y-5"
              >
                <div>
                  <h2 className="text-2xl font-bold">About You</h2>
                  <p className="text-muted-foreground mt-1">Help us tailor Kodex to your needs.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Industry</label>
                  <select
                    className="w-full px-4 py-3 bg-card border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-blue-600/50 transition"
                    value={form.industry}
                    onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                  >
                    <option value="">Select your industry</option>
                    {INDUSTRIES.map((i) => (
                      <option key={i} value={i}>{i}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Your Role</label>
                  <select
                    className="w-full px-4 py-3 bg-card border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-blue-600/50 transition"
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  >
                    <option value="">Select your role</option>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <button
                  className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-500 disabled:opacity-50 transition"
                  onClick={() => goTo(2)}
                  disabled={!form.industry || !form.role}
                >
                  Continue
                </button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step-2"
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="space-y-5"
              >
                <div>
                  <h2 className="text-2xl font-bold">Your Company</h2>
                  <p className="text-muted-foreground mt-1">Tell us about your organisation.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Company Name</label>
                  <input
                    className="w-full px-4 py-3 bg-card border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-600/50 transition"
                    placeholder="Acme GmbH"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Company Size</label>
                  <select
                    className="w-full px-4 py-3 bg-card border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-blue-600/50 transition"
                    value={form.size}
                    onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
                  >
                    {SIZES.map((s) => (
                      <option key={s} value={s}>{s} employees</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Country</label>
                  <input
                    className="w-full px-4 py-3 bg-card border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-600/50 transition"
                    placeholder="DE"
                    value={form.country}
                    onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    className="px-5 py-3 border border-border rounded-xl text-muted-foreground hover:text-foreground hover:border-foreground/20 transition"
                    onClick={() => goTo(1)}
                  >
                    Back
                  </button>
                  <button
                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-500 disabled:opacity-50 transition"
                    onClick={handleSubmit}
                    disabled={loading || !form.name}
                  >
                    {loading ? "Saving..." : "Complete Setup"}
                  </button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step-3"
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="flex flex-col items-center text-center space-y-6 pt-8"
              >
                {/* Animated checkmark */}
                <motion.div
                  className="w-20 h-20 bg-blue-600/10 rounded-full flex items-center justify-center"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
                >
                  <motion.svg
                    className="w-10 h-10 text-blue-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                  >
                    <motion.path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.5, delay: 0.5 }}
                    />
                  </motion.svg>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                >
                  <h2 className="text-2xl font-bold mb-2">You&apos;re all set!</h2>
                  <p className="text-muted-foreground max-w-sm">
                    Your profile is set up! Create your first project to get started.
                  </p>
                </motion.div>

                <motion.button
                  className="px-8 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-500 transition"
                  onClick={() => router.push("/projects/new")}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                >
                  Create Your First Project
                </motion.button>
                <motion.button
                  className="px-6 py-2 text-muted-foreground text-sm hover:text-foreground transition"
                  onClick={() => router.push("/dashboard")}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1 }}
                >
                  Skip for now
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
