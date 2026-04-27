"use client";

import { useState } from "react";
import { FileCheck, Loader2, Plus, Download, Pencil, Clock } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

const samplePolicies = [
  { name: "Data Protection Policy", framework: "GDPR", status: "published", updated: "2 days" },
  { name: "Information Security Policy", framework: "ISO 27001", status: "draft", updated: "5 days" },
  { name: "Incident Response Policy", framework: "GDPR", status: "published", updated: "1 week" },
  { name: "Access Control Policy", framework: "ISO 27001", status: "draft", updated: "3 days" },
  { name: "Acceptable Use Policy", framework: "GDPR", status: "published", updated: "2 weeks" },
  { name: "AI Governance Policy", framework: "EU AI Act", status: "draft", updated: "1 day" },
];

export default function PolicyManager() {
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [policyType, setPolicyType] = useState("Data Protection Policy");
  const [showGenerator, setShowGenerator] = useState(false);

  async function generate() {
    setGenerating(true);
    setResult(null);
    try {
      const res = await fetch("/api/ai/generate-policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policyType, frameworks: ["GDPR"] }),
      });
      const data = await res.json();
      setResult(data.content);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-sm border-b border-border px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Policy Management</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Generate and manage compliance policies
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowGenerator(!showGenerator)}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Generate Policy
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        {/* Policy Generator */}
        {showGenerator && (
          <div className="bg-card border border-border rounded-xl p-6 mb-8">
            <h3 className="font-medium mb-4 text-foreground">Generate New Policy</h3>
            <div className="flex gap-3">
              <select
                value={policyType}
                onChange={(e) => setPolicyType(e.target.value)}
                className="flex-1 px-4 py-3 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-600/30"
              >
                {[
                  "Data Protection Policy",
                  "Information Security Policy",
                  "Incident Response Policy",
                  "Access Control Policy",
                  "Acceptable Use Policy",
                ].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <button
                onClick={generate}
                disabled={generating}
                className="px-5 py-3 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileCheck className="w-4 h-4" />
                    Generate with AI
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Policy Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {samplePolicies.map((policy) => (
            <div
              key={policy.name}
              className="bg-card border border-border rounded-xl p-6 hover:border-blue-600/30 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="bg-blue-600/10 w-12 h-12 rounded-lg flex items-center justify-center">
                  <FileCheck className="w-6 h-6 text-blue-600" />
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    policy.status === "published"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                  }`}
                >
                  {policy.status.charAt(0).toUpperCase() + policy.status.slice(1)}
                </span>
              </div>
              <h3 className="font-semibold text-foreground mb-1">{policy.name}</h3>
              <p className="text-sm text-muted-foreground mb-1">{policy.framework}</p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
                <Clock className="w-3 h-3" />
                Updated {policy.updated} ago
              </div>
              <div className="flex items-center gap-2">
                <button className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground hover:bg-accent transition-colors flex items-center justify-center gap-1.5">
                  <Pencil className="w-3.5 h-3.5" />
                  Pencil
                </button>
                <button className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground hover:bg-accent transition-colors flex items-center justify-center gap-1.5">
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Generated Policy Display */}
        {result && (
          <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
            <h3 className="font-medium mb-4 flex items-center gap-2 text-foreground">
              <FileCheck className="w-4 h-4 text-blue-600" />
              Generated Policy
            </h3>
            <pre className="whitespace-pre-wrap font-sans text-sm text-foreground/80 leading-relaxed bg-accent/50 rounded-lg p-4">
              {result}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
