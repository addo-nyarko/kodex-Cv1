"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { DocumentViewer } from "./DocumentViewer";
import {
  Upload,
  FileText,
  FileCheck,
  ScanSearch,
  ClipboardCheck,
  Search,
  Download,
  Eye,
  Trash2,
  Loader2,
  AlertCircle,
  X,
  ChevronUp,
  ChevronDown,
  Sparkles,
  FolderOpen,
} from "lucide-react";

/* -- Types -------------------------------------------------------- */

type Doc = {
  id: string;
  title: string;
  category:
    | "UPLOAD"
    | "POLICY"
    | "SCAN_REPORT"
    | "AUDIT_REPORT"
    | "EVIDENCE"
    | "GENERATED";
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  aiGenerated: boolean;
  sourceType: string | null;
  createdAt: string;
  projectId: string;
  projectName?: string;
};

type Tab = "ALL" | "POLICY" | "SCAN_REPORT" | "AUDIT_REPORT" | "EVIDENCE" | "UPLOAD";

const TABS: { key: Tab; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "POLICY", label: "Policies" },
  { key: "SCAN_REPORT", label: "Scan Reports" },
  { key: "AUDIT_REPORT", label: "Audit Reports" },
  { key: "EVIDENCE", label: "Evidence" },
  { key: "UPLOAD", label: "Uploads" },
];

const CATEGORY_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; icon: typeof FileText }
> = {
  POLICY: {
    label: "Policy",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/20",
    icon: FileCheck,
  },
  SCAN_REPORT: {
    label: "Scan Report",
    color: "text-green-400",
    bgColor: "bg-green-500/10 border-green-500/20",
    icon: ScanSearch,
  },
  AUDIT_REPORT: {
    label: "Audit Report",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10 border-purple-500/20",
    icon: ClipboardCheck,
  },
  EVIDENCE: {
    label: "Evidence",
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10 border-yellow-500/20",
    icon: FileText,
  },
  UPLOAD: {
    label: "Upload",
    color: "text-muted-foreground",
    bgColor: "bg-muted border-border",
    icon: FileText,
  },
  GENERATED: {
    label: "Generated",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/20",
    icon: FileCheck,
  },
};

/* -- Helpers ------------------------------------------------------ */

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* -- Main Page ---------------------------------------------------- */

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [showUploadZone, setShowUploadZone] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* -- Fetch ------------------------------------------------------ */

  const fetchDocuments = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (activeTab !== "ALL") params.set("category", activeTab);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      const qs = params.toString();
      const res = await fetch(`/api/documents${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to load documents");
      const data = await res.json();
      setDocuments(data.documents);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchQuery]);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      fetchDocuments();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchDocuments]);

  /* -- Upload handler --------------------------------------------- */

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Upload failed");
      }
      setShowUploadZone(false);
      await fetchDocuments();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  /* -- Delete handler --------------------------------------------- */

  async function handleDelete(docId: string) {
    if (!confirm("Delete this document?")) return;
    try {
      const res = await fetch(`/api/documents/${docId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  /* -- Drag & drop ------------------------------------------------ */

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  }

  /* -- Filtered docs (client-side filter for tab when using ALL fetch) */

  const filteredDocs = documents;

  /* -- Render ----------------------------------------------------- */

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-sm border-b border-border px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Documents</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your compliance document archive
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowUploadZone(!showUploadZone)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload
            </button>
          </div>
        </div>

        {/* Search + Tabs */}
        <div className="mt-5 flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeTab === tab.key
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        {/* Upload zone (collapsible) */}
        <AnimatePresence>
          {showUploadZone && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`border-2 border-dashed rounded-xl p-10 text-center mb-6 transition-colors cursor-pointer ${
                  dragging
                    ? "border-blue-600 bg-blue-600/5"
                    : "border-border hover:border-blue-600/50"
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="flex flex-col items-center gap-3">
                  {uploading ? (
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                  ) : (
                    <div className="bg-blue-600/10 w-12 h-12 rounded-lg flex items-center justify-center">
                      <Upload className="w-6 h-6 text-blue-600" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-foreground">
                      {uploading ? "Uploading..." : "Drop files here"}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      or click to browse. PDF, DOCX, TXT, Markdown, CSV, JSON
                    </p>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.txt,.md,.csv,.json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                    e.target.value = "";
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-3 text-muted-foreground py-12 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading documents...
          </div>
        )}

        {/* Empty state */}
        {!loading && filteredDocs.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-xl p-12 text-center"
          >
            <div className="flex justify-center mb-4">
              <div className="bg-muted w-14 h-14 rounded-xl flex items-center justify-center">
                <FolderOpen className="w-7 h-7 text-muted-foreground" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              No documents yet
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Documents from scans, generated policies, and uploads will appear
              here. Upload a document or run a compliance scan to get started.
            </p>
            <button
              onClick={() => setShowUploadZone(true)}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload your first document
            </button>
          </motion.div>
        )}

        {/* Document list */}
        {!loading && filteredDocs.length > 0 && (
          <div className="space-y-2">
            {filteredDocs.map((doc, i) => {
              const config = CATEGORY_CONFIG[doc.category] ?? CATEGORY_CONFIG.UPLOAD;
              const Icon = config.icon;

              return (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="bg-card border border-border rounded-lg p-4 hover:border-blue-600/30 transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    {/* Icon */}
                    <div className="bg-muted w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Icon className={`w-5 h-5 ${config.color}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-medium text-foreground truncate">
                          {doc.title}
                        </h3>
                        {/* Category badge */}
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${config.bgColor} ${config.color}`}
                        >
                          {config.label}
                        </span>
                        {/* Source badge */}
                        {doc.aiGenerated && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 border border-blue-500/20 text-blue-400">
                            <Sparkles className="w-3 h-3" />
                            AI Generated
                          </span>
                        )}
                        {!doc.aiGenerated && doc.sourceType && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted border border-border text-muted-foreground">
                            {doc.sourceType}
                          </span>
                        )}
                        {!doc.aiGenerated && !doc.sourceType && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted border border-border text-muted-foreground">
                            Uploaded
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{formatDate(doc.createdAt)}</span>
                        {doc.fileSize && (
                          <>
                            <span className="text-border">|</span>
                            <span>{formatFileSize(doc.fileSize)}</span>
                          </>
                        )}
                        {doc.projectName && (
                          <>
                            <span className="text-border">|</span>
                            <span>{doc.projectName}</span>
                          </>
                        )}
                        {doc.fileName && (
                          <>
                            <span className="text-border">|</span>
                            <span className="truncate max-w-[200px]">
                              {doc.fileName}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        title="View"
                        onClick={() => setViewingDocId(doc.id)}
                        className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        title="Download original"
                        onClick={() => {
                          const a = document.createElement("a");
                          a.href = `/api/documents/${doc.id}/download`;
                          a.download = doc.fileName || doc.title;
                          a.click();
                        }}
                        className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <a
                        href={`/api/documents/${doc.id}/pdf`}
                        title="Download as PDF"
                        className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <FileText className="w-4 h-4" />
                      </a>
                      <button
                        title="Delete"
                        onClick={() => handleDelete(doc.id)}
                        className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Document viewer modal */}
      {viewingDocId && (
        <DocumentViewer
          docId={viewingDocId}
          onClose={() => setViewingDocId(null)}
        />
      )}
    </div>
  );
}
