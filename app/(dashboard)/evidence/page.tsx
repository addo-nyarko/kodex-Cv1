"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Upload, Check, FileText, AlertCircle, Loader2,
  Sparkles, Plug, X, Download, ChevronDown,
} from "lucide-react";

/* ── Types ────────────────────────────────────────────────────── */

type ChecklistItem = {
  id: string;
  title: string;
  why: string;
  required: boolean;
};

type UploadedEvidence = {
  id: string;
  title: string;
  fileName: string | null;
  status: string;
  hasText: boolean;
  controlId: string;
  controlCode: string;
};

type FrameworkInfo = {
  id: string;
  type: string;
  controls: { id: string; code: string; title: string }[];
};

type ChecklistData = {
  checklist: ChecklistItem[];
  frameworks: FrameworkInfo[];
  applicableFrameworks: string[];
  riskTier: string | null;
  uploadedEvidence: UploadedEvidence[];
};

/* ── Main Page ────────────────────────────────────────────────── */

export default function EvidencePage() {
  const [data, setData] = useState<ChecklistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload state per item
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadSuccess, setUploadSuccess] = useState<Record<string, string>>({});

  // Generation state
  const [generatingItem, setGeneratingItem] = useState<ChecklistItem | null>(null);
  const [generatedContent, setGeneratedContent] = useState("");
  const [generationDone, setGenerationDone] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generatedItemIds, setGeneratedItemIds] = useState<Set<string>>(new Set());
  const generationDoneRef = useRef(false);

  // Expanded item (to show all 3 options)
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const fetchChecklist = useCallback(async () => {
    try {
      const res = await fetch("/api/evidence/checklist");
      if (!res.ok) throw new Error("Failed to load checklist");
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchChecklist(); }, [fetchChecklist]);

  /* ── Helpers ──────────────────────────────────────────────── */

  function findControlForItem(item: ChecklistItem): { controlId: string; controlCode: string } | null {
    if (!data?.frameworks.length) return null;
    const keywords = item.title.toLowerCase().split(/\s+/);
    for (const fw of data.frameworks) {
      for (const ctrl of fw.controls) {
        const ctrlText = `${ctrl.code} ${ctrl.title}`.toLowerCase();
        if (keywords.some((kw) => kw.length > 3 && ctrlText.includes(kw))) {
          return { controlId: ctrl.id, controlCode: ctrl.code };
        }
      }
    }
    if (data.frameworks[0]?.controls[0]) {
      const c = data.frameworks[0].controls[0];
      return { controlId: c.id, controlCode: c.code };
    }
    return null;
  }

  function getExistingEvidence(item: ChecklistItem): UploadedEvidence | undefined {
    if (!data) return undefined;
    const titleWords = item.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    return data.uploadedEvidence.find((e) =>
      titleWords.some((w) =>
        (e.title?.toLowerCase() ?? "").includes(w) ||
        (e.fileName?.toLowerCase() ?? "").includes(w)
      )
    );
  }

  function isItemDone(item: ChecklistItem): boolean {
    return !!getExistingEvidence(item) || !!uploadSuccess[item.id] || generatedItemIds.has(item.id);
  }

  /* ── Upload handler ──────────────────────────────────────── */

  async function handleUpload(item: ChecklistItem, file: File) {
    const control = findControlForItem(item);
    if (!control) {
      setError("No framework controls found. Complete the questionnaire first.");
      return;
    }

    setUploading((prev) => ({ ...prev, [item.id]: true }));
    setError(null);

    try {
      const initRes = await fetch("/api/evidence/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          controlId: control.controlId,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          fileSize: file.size,
          evidenceType: "DOCUMENT",
        }),
      });

      if (!initRes.ok) throw new Error((await initRes.json().catch(() => ({}))).error || "Upload init failed");
      const { uploadUrl, evidenceId } = await initRes.json();

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!uploadRes.ok) throw new Error("Failed to upload file");

      await fetch("/api/evidence/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidenceId }),
      });

      setUploadSuccess((prev) => ({ ...prev, [item.id]: file.name }));
      setExpandedItem(null);
      await fetchChecklist();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading((prev) => ({ ...prev, [item.id]: false }));
    }
  }

  /* ── Generate handler ────────────────────────────────────── */

  async function handleGenerate(item: ChecklistItem) {
    setGeneratingItem(item);
    setGeneratedContent("");
    setGenerationDone(false);
    setGenerationError(null);
    generationDoneRef.current = false;

    try {
      const res = await fetch("/api/policies/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checklistTitle: item.title,
          checklistItemId: item.id,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No stream");

      let buffer = "";
      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const eventData = JSON.parse(line.slice(6));
              if (eventData.type === "chunk") {
                setGeneratedContent((prev) => prev + eventData.text);
              } else if (eventData.type === "complete") {
                generationDoneRef.current = true;
                setGenerationDone(true);
                setGeneratedItemIds((prev) => new Set([...prev, item.id]));
                fetchChecklist(); // fire and forget — no await needed
              } else if (eventData.type === "error") {
                setGenerationError(eventData.message);
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }

      // If stream ended without explicit complete event, mark done
      if (!generationDoneRef.current) {
        setGenerationDone(true);
        setGeneratedItemIds((prev) => new Set([...prev, item.id]));
        fetchChecklist();
      }
    } catch (e) {
      setGenerationError(e instanceof Error ? e.message : "Generation failed");
    }
  }

  /* ── Computed ─────────────────────────────────────────────── */

  const checklist = data?.checklist ?? [];
  const hasChecklist = checklist.length > 0;
  const filledCount = checklist.filter(isItemDone).length;

  /* ── Render ──────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading your document checklist…
      </div>
    );
  }

  return (
    <>
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Evidence & Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {hasChecklist
            ? "For each document, you can upload an existing file, let Kodex generate it, or connect an integration."
            : "Complete the questionnaire first to get your personalized document checklist."}
        </p>
      </div>

      {hasChecklist && (
        <div className="flex items-center gap-2 mb-8">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${(filledCount / checklist.length) * 100}%` }}
            />
          </div>
          <span className="text-sm text-muted-foreground">{filledCount}/{checklist.length}</span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-3 h-3" /></button>
        </div>
      )}

      {!hasChecklist ? (
        <a href="/onboarding/questionnaire" className="inline-block px-4 py-2 bg-primary rounded-lg hover:bg-primary/90 font-medium text-sm">
          Start questionnaire →
        </a>
      ) : (
        <div className="space-y-3">
          {checklist.map((item) => {
            const done = isItemDone(item);
            const existing = getExistingEvidence(item);
            const justUploaded = uploadSuccess[item.id];
            const isUploading = uploading[item.id];
            const isExpanded = expandedItem === item.id;

            return (
              <div
                key={item.id}
                className={`rounded-xl border transition-colors ${
                  done ? "bg-green-500/10 border-green-500/30" : "bg-card border-border"
                }`}
              >
                {/* Header row */}
                <button
                  onClick={() => !done && setExpandedItem(isExpanded ? null : item.id)}
                  className="w-full p-4 flex items-start justify-between text-left"
                >
                  <div className="flex items-start gap-3">
                    {done ? (
                      <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-medium text-sm">{item.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{item.why}</div>
                      {done && (
                        <div className="text-xs text-green-400 mt-1">
                          ✓ {justUploaded || existing?.fileName || generatedItemIds.has(item.id) ? "Generated by Kodex" : "Uploaded"}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      item.required ? "bg-orange-900/30 text-orange-400" : "bg-muted text-muted-foreground"
                    }`}>
                      {item.required ? "Required" : "Optional"}
                    </span>
                    {!done && (
                      <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    )}
                  </div>
                </button>

                {/* Expanded: 3 action paths */}
                {isExpanded && !done && (
                  <div className="px-4 pb-4 border-t border-border/50 pt-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">

                      {/* Option 1: Generate with AI */}
                      <button
                        onClick={() => handleGenerate(item)}
                        className="flex flex-col items-center gap-2 p-4 rounded-lg border border-primary/30 bg-primary/10 hover:bg-primary/20 transition-colors group"
                      >
                        <Sparkles className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-medium text-primary">Generate with AI</span>
                        <span className="text-xs text-muted-foreground text-center">Kodex writes it for you using your questionnaire answers</span>
                      </button>

                      {/* Option 2: Upload */}
                      <label className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:border-primary/30 hover:bg-accent/50 transition-colors cursor-pointer group">
                        {isUploading ? (
                          <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                        ) : (
                          <Upload className="w-5 h-5 text-muted-foreground group-hover:scale-110 transition-transform" />
                        )}
                        <span className="text-sm font-medium">{isUploading ? "Uploading…" : "Upload file"}</span>
                        <span className="text-xs text-muted-foreground text-center">PDF, DOCX, TXT, or Markdown</span>
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.doc,.docx,.txt,.md,.csv,.json"
                          disabled={isUploading}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUpload(item, file);
                            e.target.value = "";
                          }}
                        />
                      </label>

                      {/* Option 3: Connect */}
                      <a
                        href="/settings/integrations"
                        className="flex flex-col items-center gap-2 p-4 rounded-lg border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 transition-colors group"
                      >
                        <Plug className="w-5 h-5 text-purple-400 group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-medium text-purple-400">Connect</span>
                        <span className="text-xs text-muted-foreground text-center">Pull from GitHub, Google Workspace, Slack</span>
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* All done CTA */}
      {hasChecklist && filledCount === checklist.length && (
        <div className="mt-8 p-4 bg-primary/15 border border-primary/30 rounded-xl">
          <p className="text-sm font-medium text-primary mb-2">All documents ready!</p>
          <p className="text-xs text-muted-foreground mb-3">Run your compliance scan to see how you score across all frameworks.</p>
          <a href="/scan" className="inline-block px-4 py-2 bg-primary rounded-lg hover:bg-primary/90 font-medium text-sm">
            Start scan →
          </a>
        </div>
      )}

      {/* Generation modal */}
      {generatingItem && (
        <GenerationModal
          item={generatingItem}
          content={generatedContent}
          done={generationDone}
          error={generationError}
          onClose={() => {
            setGeneratingItem(null);
            setGeneratedContent("");
            setGenerationDone(false);
            setGenerationError(null);
            setExpandedItem(null);
          }}
        />
      )}

      {/* Existing evidence list */}
      {data && data.uploadedEvidence.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            All evidence ({data.uploadedEvidence.length})
          </h2>
          <div className="space-y-2">
            {data.uploadedEvidence.map((e) => (
              <div key={e.id} className="p-3 bg-card border border-border rounded-lg flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{e.fileName || e.title}</div>
                  <div className="text-xs text-muted-foreground">{e.controlCode} · {e.hasText ? "Text extracted" : "No text"}</div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  e.status === "APPROVED" ? "bg-green-900/30 text-green-400" :
                  e.status === "REJECTED" ? "bg-red-900/30 text-red-400" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {e.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
    </>
  );
}

/* ── Generation Modal ──────────────────────────────────────────── */

function GenerationModal({
  item,
  content,
  done,
  error,
  onClose,
}: {
  item: ChecklistItem;
  content: string;
  done: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Auto-scroll as content streams in
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content]);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <h2 className="font-semibold">Generating: {item.title}</h2>
            </div>
            {!done && !error && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                Writing your document…
              </p>
            )}
            {done && (
              <p className="text-xs text-green-400 mt-1">
                ✓ Document generated and saved as evidence
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded-lg">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto p-5 min-h-0"
        >
          {error ? (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
              {error}
            </div>
          ) : content ? (
            <div className="prose prose-invert prose-sm max-w-none">
              <pre className="whitespace-pre-wrap font-sans text-sm text-foreground/80 leading-relaxed">
                {content}
              </pre>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Starting generation…
            </div>
          )}
        </div>

        {/* Footer */}
        {done && (
          <div className="p-4 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              This is a draft — review and customize before using officially.
            </span>
            <div className="flex gap-2">
              <a
                href="/policies"
                className="px-3 py-1.5 text-sm bg-muted hover:bg-accent/80 rounded-lg"
              >
                View in Policy Library
              </a>
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-sm bg-primary hover:bg-primary/90 rounded-lg font-medium"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
