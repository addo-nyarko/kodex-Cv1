"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  CheckCircle2,
  AlertCircle,
  XCircle,
  HelpCircle,
  FileText,
  Eye,
  Loader2,
} from "lucide-react";

interface Control {
  code: string;
  title: string;
}

interface EvidenceSource {
  type: 'github' | 'document' | 'questionnaire' | 'clarification';
  scannedAt: string;
  reliability: 'high' | 'medium' | 'low';
  label: string;
}

interface ControlResult {
  id: string;
  controlCode: string;
  controlTitle: string;
  status: "PASS" | "FAIL" | "PARTIAL" | "NO_EVIDENCE";
  confidence: number;
  gaps: string[];
  remediations: string[];
  note: string;
  evidenceSources: EvidenceSource[];
  evaluationError: string | null;
  control: Control;
}

interface Document {
  id: string;
  title: string;
  category: string;
  createdAt: string;
}

interface ScanData {
  id: string;
  status: string;
  score: number | null;
  riskLevel: string | null;
  frameworkType: string;
  reportJson: { executiveSummary?: string; roadmap?: Array<{ controlCode: string; title: string; description: string; priority: string }> } | null;
  controlResults: ControlResult[];
  documents: Document[];
  completedAt: string | null;
  staleEvidence: boolean;
  staleSources: string[];
  errorMessage: string | null;
}

const STATUS_ICONS = {
  PASS: { icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10" },
  FAIL: { icon: XCircle, color: "text-red-500", bg: "bg-red-500/10" },
  PARTIAL: { icon: AlertCircle, color: "text-amber-500", bg: "bg-amber-500/10" },
  NO_EVIDENCE: { icon: HelpCircle, color: "text-slate-400", bg: "bg-slate-400/10" },
};

export default function ScanResultsPage() {
  const params = useParams();
  const router = useRouter();
  const scanId = params.scanId as string;

  const [scan, setScan] = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);

  useEffect(() => {
    async function loadScan() {
      try {
        const res = await fetch(`/api/scan/${scanId}`);
        if (!res.ok) throw new Error("Scan not found");
        const data = await res.json();
        setScan(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load scan");
      } finally {
        setLoading(false);
      }
    }
    loadScan();
  }, [scanId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Loading scan results...</p>
        </div>
      </div>
    );
  }

  if (error || !scan) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 mx-auto text-red-500 mb-4" />
          <p className="text-red-500">{error || "Scan not found"}</p>
          <button
            onClick={() => router.push("/scan")}
            className="mt-4 text-blue-500 hover:underline"
          >
            Back to scans
          </button>
        </div>
      </div>
    );
  }

  const controlsPassed = scan.controlResults.filter((c) => c.status === "PASS").length;
  const formattedDate = scan.completedAt
    ? new Date(scan.completedAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  // Sort controls: FAIL first, then NO_EVIDENCE, then PASS
  const sortedControls = [...scan.controlResults].sort((a, b) => {
    const statusOrder = { FAIL: 0, NO_EVIDENCE: 1, PARTIAL: 2, PASS: 3 };
    const orderA = statusOrder[a.status as keyof typeof statusOrder] ?? 4;
    const orderB = statusOrder[b.status as keyof typeof statusOrder] ?? 4;
    if (orderA !== orderB) return orderA - orderB;
    // If same status, sort by confidence ascending (for FAIL/NO_EVIDENCE)
    if (a.status !== "PASS") return a.confidence - b.confidence;
    return 0;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-6xl mx-auto px-8 py-6">
          <div className="flex items-start justify-between mb-4">
            <button
              onClick={() => router.push("/scan")}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Scans
            </button>
            <a
              href={`/api/scan/${scanId}/pdf`}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </a>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                {scan.frameworkType} Compliance Report
              </h1>
              <p className="text-sm text-muted-foreground mt-2">{formattedDate}</p>
            </div>
            <div>
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                scan.status === "COMPLETED"
                  ? "bg-green-500/10 text-green-700 dark:text-green-400"
                  : scan.status === "RUNNING"
                    ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                    : scan.status === "AWAITING_CLARIFICATION"
                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      : "bg-red-500/10 text-red-700 dark:text-red-400"
              }`}>
                {scan.status}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-8 py-8">
        {/* Failed Scan Error Banner */}
        {scan.status === "FAILED" && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-red-900 dark:text-red-200">
                This scan failed
              </p>
              <p className="text-sm text-red-800 dark:text-red-300 mt-1">
                {scan.errorMessage ? `Reason: ${scan.errorMessage}` : "An unknown error occurred during the scan."}
              </p>
            </div>
          </div>
        )}

        {/* Stale Evidence Warning */}
        {scan.staleEvidence && (
          <div className="mb-8 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                ⚠️ Some evidence is over 30 days old
              </p>
              <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">
                Results may not reflect recent changes. Consider re-scanning with updated evidence.
              </p>
              {scan.staleSources && scan.staleSources.length > 0 && (
                <div className="mt-2 text-sm">
                  <p className="text-amber-800 dark:text-amber-300 font-medium mb-1">Stale sources:</p>
                  <ul className="list-disc list-inside text-amber-800 dark:text-amber-300 space-y-0.5">
                    {scan.staleSources.map((source, i) => (
                      <li key={i}>{source}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Score Cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-card border border-border rounded-xl p-6">
            <p className="text-muted-foreground text-sm mb-2">Compliance Score</p>
            <p
              className={`text-4xl font-bold ${
                scan.score !== null
                  ? scan.score >= 80
                    ? "text-green-500"
                    : scan.score >= 50
                      ? "text-amber-500"
                      : "text-red-500"
                  : "text-muted-foreground"
              }`}
            >
              {scan.score ?? "—"}%
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl p-6">
            <p className="text-muted-foreground text-sm mb-2">Risk Level</p>
            <p
              className={`text-2xl font-bold ${
                scan.riskLevel === "LOW"
                  ? "text-green-500"
                  : scan.riskLevel === "MEDIUM"
                    ? "text-amber-500"
                    : "text-red-500"
              }`}
            >
              {scan.riskLevel ?? "—"}
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl p-6">
            <p className="text-muted-foreground text-sm mb-2">Controls Passed</p>
            <p className="text-4xl font-bold text-blue-500">
              {controlsPassed}/{sortedControls.length}
            </p>
          </div>
        </div>

        {/* Executive Summary */}
        {scan.reportJson?.executiveSummary && (
          <div className="bg-card border border-border rounded-xl p-6 mb-8">
            <h2 className="text-xl font-bold text-foreground mb-3">Executive Summary</h2>
            <p className="text-muted-foreground whitespace-pre-wrap">
              {scan.reportJson.executiveSummary}
            </p>
          </div>
        )}

        {/* Control Results */}
        <div className="bg-card border border-border rounded-xl p-6 mb-8">
          <h2 className="text-xl font-bold text-foreground mb-4">Control Results</h2>
          <div className="space-y-3">
            {sortedControls.map((result) => {
              const config = STATUS_ICONS[result.status];
              const Icon = config.icon;
              return (
                <div
                  key={result.id}
                  className={`${config.bg} border border-border rounded-lg p-4`}
                >
                  <div className="flex items-start gap-3 mb-2">
                    <Icon className={`${config.color} w-5 h-5 mt-0.5 flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground">
                        {result.controlCode} {result.controlTitle}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Confidence: {Math.round(result.confidence)}%
                      </p>

                      {/* Evaluation Error Indicator */}
                      {result.evaluationError && (
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                          ⚠️ Auto-evaluation failed — manual review needed
                        </p>
                      )}

                      {/* Evidence Sources */}
                      <div className="mt-2">
                        {result.evidenceSources && result.evidenceSources.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {result.evidenceSources.map((source, i) => {
                              const reliabilityColor =
                                source.reliability === 'high' ? 'bg-green-500/10 text-green-700 dark:text-green-400' :
                                source.reliability === 'medium' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' :
                                'bg-red-500/10 text-red-600 dark:text-red-400';

                              const formattedDate = new Date(source.scannedAt).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric'
                              });

                              return (
                                <span key={i} className="text-xs text-muted-foreground">
                                  {source.label} · {formattedDate} ·
                                  <span className={`inline-block ml-1 px-1.5 py-0.5 rounded text-xs font-medium ${reliabilityColor}`}>
                                    {source.reliability}
                                  </span>
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">No traceable evidence</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {result.gaps.length > 0 && (
                    <div className="mt-3 ml-8 text-sm">
                      <p className="font-medium text-foreground mb-1">Gaps:</p>
                      <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                        {result.gaps.map((gap, i) => (
                          <li key={i}>{gap}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {result.remediations.length > 0 && (
                    <div className="mt-3 ml-8 text-sm">
                      <p className="font-medium text-foreground mb-1">Remediations:</p>
                      <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                        {result.remediations.map((rem, i) => (
                          <li key={i}>{rem}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {result.note && (
                    <p className="mt-3 ml-8 text-sm text-muted-foreground italic">
                      {result.note}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Remediation Roadmap */}
        {scan.reportJson?.roadmap && scan.reportJson.roadmap.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 mb-8">
            <h2 className="text-xl font-bold text-foreground mb-4">Remediation Roadmap</h2>
            <div className="space-y-4">
              {scan.reportJson.roadmap.map((item, i) => {
                const priorityColor =
                  item.priority === "CRITICAL"
                    ? "bg-red-500/10 border-red-500/30"
                    : item.priority === "HIGH"
                      ? "bg-amber-500/10 border-amber-500/30"
                      : "bg-blue-500/10 border-blue-500/30";

                return (
                  <div key={i} className={`${priorityColor} border rounded-lg p-4`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="font-semibold text-foreground">
                          {item.controlCode} — {item.title}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {item.description}
                        </p>
                      </div>
                      <span className="text-xs font-medium px-2 py-1 rounded bg-background">
                        {item.priority}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Documents */}
        {scan.documents.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-xl font-bold text-foreground mb-4">Documents from this Scan</h2>
            <div className="space-y-2">
              {scan.documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 bg-muted/20 rounded-lg hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setViewingDocId(doc.id)}
                      className="px-3 py-1 text-xs font-medium text-blue-600 hover:text-blue-500 transition-colors"
                      title="View document"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <a
                      href={`/api/documents/${doc.id}/pdf`}
                      className="px-3 py-1 text-xs font-medium text-blue-600 hover:text-blue-500 transition-colors"
                      title="Download PDF"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
