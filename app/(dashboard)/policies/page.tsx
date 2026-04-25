"use client";

import { useState } from "react";
import { FileCheck, Loader2 } from "lucide-react";

export default function PoliciesPage() {
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [policyType, setPolicyType] = useState("Data Protection Policy");

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
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Policy Library</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate and manage compliance policies with AI assistance.
        </p>
      </div>

      <div className="flex gap-3 mb-8">
        <select
          value={policyType}
          onChange={(e) => setPolicyType(e.target.value)}
          className="flex-1 px-4 py-3 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-600/30"
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

      {result && (
        <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-blue-400" />
            Generated Policy
          </h3>
          <pre className="whitespace-pre-wrap font-sans text-sm text-foreground/80 leading-relaxed bg-accent/50 rounded-lg p-4">
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}
