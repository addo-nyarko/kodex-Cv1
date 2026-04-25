"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Shield, AlertTriangle, CheckCircle2, XCircle,
  FileQuestion, Loader2, ChevronDown, ArrowRight,
  Plug, Check, Download,
} from "lucide-react";

type Framework = {
  id: string;
  type: string;
  score: number;
  status: string;
  _count: { scans: number };
};

type ControlResult = {
  controlCode: string;
  controlTitle: string;
  status: "PASS" | "FAIL" | "PARTIAL" | "NO_EVIDENCE";
  confidence: number;
  gaps: string[];
  remediations: string[];
  note: string;
};

type ScanResult = {
  id: string;
  status: string;
  score: number | null;
  riskLevel: string | null;
  frameworkType: string;
  pendingQuestion: string | null;
  pendingControlCode: string | null;
  errorMessage: string | null;
  controlResults: ControlResult[];
  report: {
    executiveSummary?: string;
    roadmap?: { controlCode: string; title: string; description: string; priority: string }[];
  } | null;
  shadowPass: Record<string, { met: number; total: number; pct: number }> | null;
};

type IntegrationStatus = {
  type: string;
  status: string;
};

const INTEGRATIONS = [
  { type: "GITHUB", name: "GitHub", icon: "GH" },
  { type: "GOOGLE_WORKSPACE", name: "Google", icon: "GW" },
  { type: "CUSTOM_WEBHOOK", name: "Notion", icon: "NT" },
  { type: "SLACK", name: "Slack", icon: "SL" },
];

const STATUS_CONFIG = {
  PASS: { icon: CheckCircle2, color: "text-green-400", bg: "bg-green-900/20 border-green-800/50", label: "Pass" },
  PARTIAL: { icon: AlertTriangle, color: "text-yellow-400", bg: "bg-yellow-900/20 border-yellow-800/50", label: "Partial" },
  FAIL: { icon: XCircle, color: "text-red-400", bg: "bg-red-900/20 border-red-500/30/50", label: "Fail" },
  NO_EVIDENCE: { icon: FileQuestion, color: "text-muted-foreground", bg: "bg-muted border-border", label: "No Evidence" },
};

export default function ScanPage() {
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanId, setScanId] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedControl, setExpandedControl] = useState<string | null>(null);
  const [connectedIntegrations, setConnectedIntegrations] = useState<IntegrationStatus[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanningRef = useRef(false);

  // Load integration status
  useEffect(() => {
    fetch("/api/integrations/status")
      .then((r) => r.json())
      .then((d) => setConnectedIntegrations(d.integrations ?? []))
      .catch(() => {});
  }, []);

  // Load frameworks
  useEffect(() => {
    fetch("/api/frameworks")
      .then((r) => r.json())
      .then((d) => {
        setFrameworks(d.frameworks ?? []);
        if (d.frameworks?.length === 1) setSelectedId(d.frameworks[0].id);
      })
      .catch(() => setError("Failed to load frameworks"));
  }, []);

  // Poll for scan results
  const pollScan = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/scan/status/${id}`);
      if (!res.ok) return;
      const data: ScanResult = await res.json();

      if (data.status === "COMPLETED") {
        setResult(data);
        setScanning(false);
        if (pollRef.current) clearInterval(pollRef.current);
      } else if (data.status === "FAILED") {
        setError(data.errorMessage || "Scan failed");
        setScanning(false);
        if (pollRef.current) clearInterval(pollRef.current);
      } else if (data.status === "AWAITING_CLARIFICATION") {
        setResult(data);
        setScanning(false);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    } catch {
      // Keep polling
    }
  }, []);

  async function startScan() {
    if (!selectedId) return;
    setScanning(true);
    scanningRef.current = true;
    setResult(null);
    setEvents([]);
    setError(null);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameworkId: selectedId }),
      });

      // Read SSE stream for live narration
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) {
        setError("No response stream");
        setScanning(false);
        return;
      }

      let buffer = "";
      let foundScanId: string | null = null;

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.scanId && !foundScanId) {
                foundScanId = data.scanId;
                setScanId(data.scanId);
              }

              if (data.message) {
                setEvents((e) => [...e, data.message]);
              }

              if (data.type === "complete") {
                if (data.scanId || foundScanId) {
                  await pollScan(data.scanId || foundScanId);
                }
                setScanning(false);
                scanningRef.current = false;
              } else if (data.type === "error") {
                setError(data.message || "Scan error");
                setScanning(false);
                scanningRef.current = false;
              } else if (data.type === "clarification_needed") {
                if (data.scanId || foundScanId) {
                  await pollScan(data.scanId || foundScanId);
                }
                setScanning(false);
                scanningRef.current = false;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      // If we got a scanId but never got a terminal event, start polling
      if (foundScanId && scanningRef.current) {
        pollRef.current = setInterval(() => pollScan(foundScanId!), 2000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start scan");
      setScanning(false);
      scanningRef.current = false;
    }
  }

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const selectedFramework = frameworks.find((f) => f.id === selectedId);

  return (
    <>
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Compliance Scan</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select a framework and run an AI-powered compliance scan against your uploaded evidence.
        </p>
      </div>

      {/* Framework selector */}
      <div className="flex items-end gap-4 mb-8">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-2">Framework</label>
          <div className="relative">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={scanning}
              className="w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground appearance-none cursor-pointer disabled:opacity-50"
            >
              <option value="">Select a framework…</option>
              {frameworks.map((fw) => (
                <option key={fw.id} value={fw.id}>
                  {fw.type.replace(/_/g, " ")} — {fw.score}% ({fw._count.scans} scans)
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
        <button
          onClick={startScan}
          disabled={scanning || !selectedId}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
        >
          {scanning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Scanning…
            </>
          ) : (
            <>
              <Shield className="w-4 h-4" />
              Start scan
            </>
          )}
        </button>
      </div>

      {/* Connect integrations banner */}
      <div className="mb-8 bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Plug className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h3 className="font-medium text-sm">Connect your tools</h3>
              <p className="text-xs text-muted-foreground">Stronger scans with real infrastructure data</p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">
            {connectedIntegrations.filter((i) => i.status === "CONNECTED").length}/{INTEGRATIONS.length} connected
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {INTEGRATIONS.map((int) => {
            const isConnected = connectedIntegrations.some(
              (i) => i.type === int.type && i.status === "CONNECTED"
            );
            return isConnected ? (
              <div
                key={int.type}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-green-500/30 bg-green-500/5 text-sm"
              >
                <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                <span className="text-green-400 font-medium">{int.name}</span>
              </div>
            ) : (
              <a
                key={int.type}
                href="/settings/integrations"
                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-border hover:border-primary/30 hover:bg-accent transition-colors text-sm text-muted-foreground hover:text-foreground"
              >
                <span className="text-xs font-bold opacity-50">{int.icon}</span>
                <span>{int.name}</span>
              </a>
            );
          })}
        </div>
      </div>

      {frameworks.length === 0 && !error && (
        <div className="p-6 bg-card border border-border rounded-xl text-center">
          <p className="text-muted-foreground text-sm mb-3">No frameworks yet. Complete the questionnaire to add frameworks automatically.</p>
          <a href="/onboarding/questionnaire" className="text-primary hover:underline text-sm">
            Start questionnaire →
          </a>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Live narration during scan */}
      {events.length > 0 && !result && (
        <div className="mb-8 bg-card border border-border rounded-xl p-5">
          <div className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            {scanning && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
            Live scan progress
          </div>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {events.map((e, i) => (
              <p key={i} className="text-sm text-foreground/80">{e}</p>
            ))}
          </div>
        </div>
      )}

      {/* Scan results */}
      {result && result.status === "COMPLETED" && (
        <div className="space-y-6">
          {/* Download PDF audit report */}
          <div className="flex justify-end">
            <a
              href={`/api/scan/${result.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download Audit Report (PDF)
            </a>
          </div>

          {/* Score header */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-xl p-5 flex flex-col items-center">
              <div className={`text-4xl font-bold ${
                (result.score ?? 0) >= 75 ? "text-green-400" :
                (result.score ?? 0) >= 50 ? "text-yellow-400" :
                "text-red-400"
              }`}>
                {result.score ?? 0}%
              </div>
              <div className="text-xs text-muted-foreground mt-1">{result.frameworkType.replace(/_/g, " ")} Score</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-5 flex flex-col items-center">
              <div className="text-2xl font-bold">
                {result.controlResults.filter((r) => r.status === "PASS").length}/{result.controlResults.length}
              </div>
              <div className="text-xs text-muted-foreground mt-1">Controls passed</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-5 flex flex-col items-center">
              <div className={`text-lg font-bold ${
                result.riskLevel === "LOW" ? "text-green-400" :
                result.riskLevel === "MEDIUM" ? "text-yellow-400" :
                "text-red-400"
              }`}>
                {result.riskLevel}
              </div>
              <div className="text-xs text-muted-foreground mt-1">Risk level</div>
            </div>
          </div>

          {/* Executive summary */}
          {result.report?.executiveSummary && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Executive Summary</h3>
              <p className="text-sm text-foreground/80 leading-relaxed">{result.report.executiveSummary}</p>
            </div>
          )}

          {/* Cross-framework coverage */}
          {result.shadowPass && Object.entries(result.shadowPass).some(([, v]) => v.met > 0) && (
            <div className="bg-primary/10 border border-primary/30 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-3">Cross-Framework Coverage</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(result.shadowPass)
                  .filter(([, v]) => v.total > 0)
                  .map(([fw, v]) => (
                    <div key={fw} className="bg-card/50 rounded-lg p-3 text-center">
                      <div className="text-lg font-bold text-primary">{v.pct}%</div>
                      <div className="text-xs text-muted-foreground">{fw.replace(/_/g, " ")}</div>
                      <div className="text-xs text-muted-foreground">{v.met}/{v.total} controls</div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Per-control results */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Control Results</h3>
            <div className="space-y-2">
              {result.controlResults.map((cr) => {
                const config = STATUS_CONFIG[cr.status];
                const Icon = config.icon;
                const isExpanded = expandedControl === cr.controlCode;

                return (
                  <div key={cr.controlCode} className={`border rounded-xl overflow-hidden ${config.bg}`}>
                    <button
                      onClick={() => setExpandedControl(isExpanded ? null : cr.controlCode)}
                      className="w-full p-4 flex items-center justify-between text-left"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`w-4 h-4 ${config.color} flex-shrink-0`} />
                        <div>
                          <span className="text-sm font-medium">{cr.controlCode}</span>
                          <span className="text-sm text-muted-foreground ml-2">{cr.controlTitle}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${config.color} bg-card/50`}>
                          {config.label} · {Math.round(cr.confidence * 100)}%
                        </span>
                        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-3">
                        {cr.note && (
                          <p className="text-sm text-foreground/80 whitespace-pre-line">{cr.note}</p>
                        )}
                        {cr.gaps.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-1">Gaps</h4>
                            <ul className="space-y-1">
                              {cr.gaps.map((g, i) => (
                                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                  <span className="text-red-500 mt-0.5">•</span> {g}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {cr.remediations.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">How to fix</h4>
                            <ul className="space-y-1">
                              {cr.remediations.map((r, i) => (
                                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                  <ArrowRight className="w-3 h-3 text-primary mt-1 flex-shrink-0" /> {r}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Remediation roadmap */}
          {result.report?.roadmap && result.report.roadmap.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Remediation Roadmap</h3>
              <div className="space-y-2">
                {result.report.roadmap.map((task, i) => (
                  <div key={i} className="p-4 bg-card border border-border rounded-xl flex items-start gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full mt-0.5 ${
                      task.priority === "CRITICAL" ? "bg-red-900/30 text-red-400" :
                      task.priority === "HIGH" ? "bg-orange-900/30 text-orange-400" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {task.priority}
                    </span>
                    <div>
                      <div className="text-sm font-medium">{task.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{task.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Clarification needed */}
      {result && result.status === "AWAITING_CLARIFICATION" && (
        <div className="bg-yellow-950/20 border border-yellow-800/50 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-yellow-400 mb-2">Clarification needed</h3>
          <p className="text-sm text-foreground/80 mb-1">
            Control: <span className="font-medium">{result.pendingControlCode}</span>
          </p>
          <p className="text-sm text-foreground/80">{result.pendingQuestion}</p>
          <p className="text-xs text-muted-foreground mt-3">
            Answer this in the AI assistant to continue the scan.
          </p>
        </div>
      )}
    </div>
    </>
  );
}
