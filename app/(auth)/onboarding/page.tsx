"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const INDUSTRIES = ["Technology", "Healthcare", "Finance", "Retail", "Education", "Legal", "Other"];
const DATA_CATEGORIES = ["Personal", "Health", "Financial", "Biometric", "Children", "Location"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    industry: "",
    country: "DE",
    size: "1-10",
    usesAI: false,
    aiDescription: "",
    dataCategories: [] as string[],
  });

  function toggleCategory(cat: string) {
    setForm((f) => ({
      ...f,
      dataCategories: f.dataCategories.includes(cat)
        ? f.dataCategories.filter((c) => c !== cat)
        : [...f.dataCategories, cat],
    }));
  }

  async function handleSubmit() {
    setLoading(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) router.push("/onboarding/frameworks");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="mb-8">
          <div className="text-sm text-gray-500 mb-2">Step {step} of 2</div>
          <div className="h-1 bg-gray-800 rounded-full">
            <div className="h-1 bg-blue-600 rounded-full" style={{ width: `${(step / 2) * 100}%` }} />
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Tell us about your organisation</h2>
            <input
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500"
              placeholder="Company name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <select
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white"
              value={form.industry}
              onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
            >
              <option value="">Select industry</option>
              {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
            <select
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white"
              value={form.size}
              onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
            >
              {["1-10", "11-50", "51-200", "200+"].map((s) => <option key={s} value={s}>{s} employees</option>)}
            </select>
            <button
              className="w-full py-3 bg-blue-600 rounded-lg font-medium hover:bg-blue-500"
              onClick={() => setStep(2)}
              disabled={!form.name || !form.industry}
            >
              Continue
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">What data do you process?</h2>
            <div className="flex flex-wrap gap-2">
              {DATA_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat.toLowerCase())}
                  className={`px-3 py-1.5 rounded-full text-sm border ${
                    form.dataCategories.includes(cat.toLowerCase())
                      ? "bg-blue-600 border-blue-500 text-white"
                      : "border-gray-700 text-gray-400 hover:border-gray-600"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.usesAI}
                onChange={(e) => setForm((f) => ({ ...f, usesAI: e.target.checked }))}
                className="w-4 h-4"
              />
              <span className="text-sm">My product uses AI or automated decision-making</span>
            </label>
            {form.usesAI && (
              <textarea
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm"
                placeholder="Briefly describe what your AI does..."
                rows={3}
                value={form.aiDescription}
                onChange={(e) => setForm((f) => ({ ...f, aiDescription: e.target.value }))}
              />
            )}
            <div className="flex gap-3">
              <button className="px-4 py-3 border border-gray-700 rounded-lg text-gray-400 hover:text-white" onClick={() => setStep(1)}>
                Back
              </button>
              <button
                className="flex-1 py-3 bg-blue-600 rounded-lg font-medium hover:bg-blue-500 disabled:opacity-50"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? "Saving..." : "Complete onboarding"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
