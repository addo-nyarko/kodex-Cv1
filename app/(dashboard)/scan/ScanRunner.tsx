"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Shield, AlertTriangle, CheckCircle2, XCircle,
  FileQuestion, Loader2, ChevronDown, ArrowRight,
  Plug, Check, Download, PlayCircle,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

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

export default function ScanRunner() {
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [scanId, setScanId] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedControl, setExpandedControl] = useState<string | null>(null);
  const [connectedIntegrations, setConnectedIntegrations] = useState<IntegrationStatus[]>([]);
  const [repoJustScanned, setRepoJustScanned] = useState(false);
  const [integrationJustSynced, setIntegrationJustSynced] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanningRef = useRef(false);

  // Check if user was redirected after selecting a GitHub repo or syncing an integration
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("repoScanned") === "true") {
      setRepoJustScanned(true);
      window.history.replaceState({}, "", "/scan");
    }
    if (params.get("integrationSynced") === "true") {
      setIntegrationJustSynced(true);
      window.history.replaceState({}, "", "/scan");
    }
  }, []);

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
        if (d.frameworks?.length === 1) setSelectedIds(new Set([d.frameworks[0].id]));
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

  // Track how many events we've already shown (for incremental polling)
  const eventCountRef = useRef(0);

  async function startScan() {
    if (selectedIds.size === 0) return;
    setScanning(true);
    scanningRef.current = true;
    setResult(null);
    setEvents([]);
    setError(null);
    eventCountRef.current = 0;

    const ids = Array.from(selectedIds);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          ids.length === 1
            ? { frameworkId: ids[0] }
            : { frameworkIds: ids }
        ),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Scan failed" }));
        setError(data.error || "Failed to start scan");
        setScanning(false);
        scanningRef.current = false;
        return;
      }

      const data = await res.json();
      const newScanId = data.scanId;
      setScanId(newScanId);

      if (data.message) {
        setEvents([data.message]);
      }

      // Start polling for progress + results
      pollRef.current = setInterval(() => pollProgress(newScanId), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start scan");
      setScanning(false);
      scanningRef.current = false;
    }
  }

  /** Poll for scan progress (events + status) */
  async function pollProgress(id: string) {
    try {
      const res = await fetch(`/api/scan/status/${id}?eventsSince=${eventCountRef.current}`);
      if (!res.ok) return;
      const data = await res.json();

      // Append new narration events
      if (data.events && data.events.length > 0) {
        setEvents((prev) => [...prev, ...data.events]);
        eventCountRef.current = data.eventCount;
      }

      // Check terminal states
      if (data.status === "COMPLETED") {
        setResult(data);
        setScanning(false);
        scanningRef.current = false;
        if (pollRef.current) clearInterval(pollRef.current);
      } else if (data.status === "FAILED") {
        setError(data.errorMessage || "Scan failed");
        setScanning(false);
        scanningRef.current = false;
        if (pollRef.current) clearInterval(pollRef.current);
      } else if (data.status === "AWAITING_CLARIFICATION") {
        setResult(data);
        setScanning(false);
        scanningRef.current = false;
        if (pollRef.current) clearInterval(pollRef.current);
      }
    } catch {
      // Keep polling on network errors
    }
  }

  // Auto-detect if a scan was resumed while user was in AI assistant
  // When the page loads and we have a result in AWAITING_CLARIFICATION,
  // re-poll to check if clarification was already submitted
  useEffect(() => {
    if (!result || !result.id) return;
    if (result.status !== "AWAITING_CLARIFICATION") return;

    // Check once immediately if the scan has been resumed
    const checkResume = async () => {
      try {
        const res = await fetch(`/api/scan/status/${result.id}`);
        if (!res.ok) return;
        const data: ScanResult = await res.json();

        if (data.status === "COMPLETED") {
          setResult(data);
        } else if (data.status === "FAILED") {
          setError(data.errorMessage || "Scan failed");
          setResult(data);
        } else if (data.status === "QUEUED" || data.status === "RUNNING") {
          // Scan was resumed! Start polling for completion with events
          setScanning(true);
          setEvents((e) => [...e, "Scan resumed after clarification..."]);
          eventCountRef.current = 0;
          pollRef.current = setInterval(() => pollProgress(result.id), 2000);
        }
        // If still AWAITING_CLARIFICATION, user hasn't answered yet — keep showing the prompt
      } catch {
        // ignore
      }
    };

    checkResume();
  }, [result?.id, result?.status, pollScan]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  function toggleFramework(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-sm border-b border-border px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Compliance Scan</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Run AI-powered compliance scans against your frameworks
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="p-8 max-w-4xl">
        {/* Framework selector */}
        <div className="mb-8">
          <label className="block text-sm font-medium mb-4">Select frameworks to scan</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {frameworks.map((fw) => {
              const isSelected = selectedIds.has(fw.id);
              return (
                <button
                  key={fw.id}
                  onClick={() => !scanning && toggleFramework(fw.id)}
                  disabled={scanning}
                  className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-colors text-left disabled:opacity-50 ${
                    isSelected
                      ? "border-blue-600 bg-blue-600/5"
                      : "border-border bg-card hover:border-blue-600/40"
                  }`}
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    isSelected
                      ? "border-blue-600 bg-blue-600"
                      : "border-muted-foreground"
                  }`}>
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{fw.type.replace(/_/g, " ")}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {fw.score}% score &middot; {fw._count.scans} scans
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={startScan}
            disabled={scanning || selectedIds.size === 0}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {scanning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <PlayCircle className="w-4 h-4" />
                Start Scan ({selectedIds.size} selected)
              </>
            )}
          </button>
          {selectedIds.size > 0 && !scanning && (
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* Selected frameworks info box */}
        {selectedIds.size > 0 && !scanning && !result && (
          <div className="bg-blue-600/10 border border-blue-600/20 rounded-xl p-6 mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-blue-600/10 w-12 h-12 rounded-lg flex items-center justify-center">
                <Shield className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-medium text-sm">Ready to scan</h3>
                <p className="text-xs text-muted-foreground">
                  {selectedIds.size} framework{selectedIds.size > 1 ? "s" : ""} selected. The scan will analyze your uploaded evidence against each selected framework.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Connect integrations banner */}
        <div className="mb-8 bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600/10 w-12 h-12 rounded-lg flex items-center justify-center">
                <Plug className="w-5 h-5 text-blue-600" />
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
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-border hover:border-blue-600/30 hover:bg-accent transition-colors text-sm text-muted-foreground hover:text-foreground"
                >
                  <span className="text-xs font-bold opacity-50">{int.icon}</span>
                  <span>{int.name}</span>
                </a>
              );
            })}
          </div>
        </div>

        {/* Banner when user just selected a GitHub repo */}
        {repoJustScanned && (
          <div className="mb-6 bg-green-500/10 border border-green-500/30 rounded-xl p-5 flex items-center gap-3">
            <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-400">GitHub repository indexed</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your repo has been scanned for security patterns, CI/CD config, and documentation. Select a framework below and start a scan — the scanner will use this data automatically to reduce questions.
              </p>
            </div>
            <button onClick={() => setRepoJustScanned(false)} className="text-muted-foreground hover:text-foreground ml-auto flex-shrink-0">
              <span className="text-lg">&times;</span>
            </button>
          </div>
        )}

        {/* Banner when user just synced a non-GitHub integration */}
        {integrationJustSynced && (
          <div className="mb-6 bg-green-500/10 border border-green-500/30 rounded-xl p-5 flex items-center gap-3">
            <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-400">Integration data synced</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Evidence has been pulled from your connected tools. Select a framework below and start a scan — the scanner will cross-reference this data automatically to fill gaps and reduce questions.
              </p>
            </div>
            <button onClick={() => setIntegrationJustSynced(false)} className="text-muted-foreground hover:text-foreground ml-auto flex-shrink-0">
              <span className="text-lg">&times;</span>
            </button>
          </div>
        )}

        {frameworks.length === 0 && !error && (
          <div className="p-6 bg-card border border-border rounded-xl text-center">
            <p className="text-muted-foreground text-sm mb-3">No frameworks yet. Complete the questionnaire to add frameworks automatically.</p>
            <a href="/onboarding/questionnaire" className="text-blue-600 hover:underline text-sm">
              Start questionnaire →
            </a>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Live narration during scan — inline thinking */}
        {events.length > 0 && !result && (
          <div className="mb-8 bg-card border border-border rounded-xl p-5">
            <div className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
              {scanning && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />}
              {scanning ? "Scanning..." : "Scan progress"}
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {events.map((e, i) => {
                const isThinking = e.startsWith("Checking:");
                const isWorking = e.startsWith("Working with:");
                const isBuilding = e.startsWith("Building") || e.startsWith("Cross-referencing");
                return (
                  <div
                    key={i}
                    className={`text-sm flex items-start gap-2 ${
                      isThinking
                        ? "text-blue-400/80 pl-2 border-l-2 border-blue-600/30"
                        : isWorking || isBuilding
                          ? "text-muted-foreground italic"
                          : "text-foreground/80"
                    }`}
                  >
                    {isThinking && (
                      <span className="text-blue-600/60 text-xs mt-0.5 flex-shrink-0">
                        {i === events.length - 1 && scanning ? "..." : "\u2713"}
                      </span>
                    )}
                    <span>{e}</span>
                  </div>
                );
              })}
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
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
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
              <div className="bg-blue-600/10 border border-blue-600/20 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-blue-600 uppercase tracking-wide mb-3">Cross-Framework Coverage</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(result.shadowPass)
                    .filter(([, v]) => v.total > 0)
                    .map(([fw, v]) => (
                      <div key={fw} className="bg-card/50 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-blue-600">{v.pct}%</div>
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
                              <h4 className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">How to fix</h4>
                              <ul className="space-y-1">
                                {cr.remediations.map((r, i) => (
                                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                    <ArrowRight className="w-3 h-3 text-blue-600 mt-1 flex-shrink-0" /> {r}
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

        {/* Clarification needed — redirect to chat */}
        {result && result.status === "AWAITING_CLARIFICATION" && (
          <div className="bg-yellow-950/20 border border-yellow-800/50 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-yellow-400 mb-2">Clarification needed</h3>
            <p className="text-sm text-foreground/80 mb-1">
              Control: <span className="font-medium">{result.pendingControlCode}</span>
            </p>
            <p className="text-sm text-foreground/80 mb-4">{result.pendingQuestion}</p>
            <a
              href={`/ai-assistant?scanId=${result.id}&question=${encodeURIComponent(result.pendingQuestion ?? "")}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-yellow-600 text-white rounded-lg text-sm font-medium hover:bg-yellow-500 transition-colors"
            >
              Answer in AI Assistant →
            </a>
          </div>
        )}
      </div>
    </>
  );
}
