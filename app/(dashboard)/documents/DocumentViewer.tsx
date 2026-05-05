"use client";

import { useState, useEffect } from "react";
import { X, Download, Loader2 } from "lucide-react";

interface Document {
  id: string;
  title: string;
  category: string;
  content: string;
  projectName: string;
  createdAt: string;
}

export function DocumentViewer({
  docId,
  onClose,
}: {
  docId: string;
  onClose: () => void;
}) {
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDoc() {
      try {
        const res = await fetch(`/api/documents/${docId}/view`);
        if (!res.ok) throw new Error("Failed to load document");
        const data = await res.json();
        setDoc(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load document");
      } finally {
        setLoading(false);
      }
    }
    fetchDoc();
  }, [docId]);

  function handleDownload() {
    const a = document.createElement("a");
    a.href = `/api/documents/${docId}/download`;
    a.download = doc?.title || "document";
    a.click();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="h-6 w-48 bg-muted rounded animate-pulse" />
            ) : (
              <>
                <h2 className="font-semibold truncate">{doc?.title}</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {doc?.projectName} • {doc?.createdAt ? new Date(doc.createdAt).toLocaleDateString() : ""}
                </p>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 ml-4">
            {!loading && doc && (
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          {doc && !loading && (
            <div className="prose prose-invert max-w-none">
              {/* Render markdown-formatted content */}
              <div className="text-sm text-foreground whitespace-pre-wrap">
                {doc.content}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
