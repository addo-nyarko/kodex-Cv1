"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Trash2,
  Shield,
  FileText,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import Link from "next/link";

interface FrameworkData {
  id: string;
  type: string;
  score: number;
  status: string;
  totalControls: number;
  passedControls: number;
  scans: Array<{
    id: string;
    completedAt: string;
  }>;
}

interface DocumentData {
  id: string;
  title: string;
  category: string;
  createdAt: string;
}

interface ProjectData {
  id: string;
  name: string;
  description: string | null;
  industry: string | null;
  complianceScore: number;
  frameworks: FrameworkData[];
  documents: DocumentData[];
  createdAt: string;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function fetchProject() {
      try {
        const res = await fetch(`/api/projects/${id}`);
        if (!res.ok) throw new Error("Failed to load project");
        const data = await res.json();
        setProject(data.project);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }
    fetchProject();
  }, [id]);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete project");
      router.push("/projects");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
      setDeleting(false);
    }
  }

  const statusColor = {
    NOT_STARTED: "text-muted-foreground",
    IN_PROGRESS: "text-amber-500",
    AUDIT_READY: "text-green-500",
  };

  const riskColor = (score: number) => {
    if (score >= 80) return "text-green-500 bg-green-500/10";
    if (score >= 50) return "text-amber-500 bg-amber-500/10";
    return "text-red-500 bg-red-500/10";
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-card/80 backdrop-blur-sm border-b border-border px-8 py-6">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.push("/projects")}
            className="p-2 rounded-lg hover:bg-accent transition-colors"
            title="Back to Projects"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="flex-1">
            {loading ? (
              <div className="h-8 w-48 bg-muted rounded animate-pulse" />
            ) : (
              <>
                <h1 className="text-2xl font-bold">{project?.name}</h1>
                {project?.description && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {project.description}
                  </p>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDeleteConfirm(true)}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-600/10 text-red-600 rounded-lg text-sm font-medium hover:bg-red-600/20 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>

        {project && (
          <div className="text-xs text-muted-foreground">
            Created {new Date(project.createdAt).toLocaleDateString()}
            {project.industry && ` • ${project.industry}`}
          </div>
        )}
      </div>

      <div className="p-8">
        {/* Error state */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400 mb-6">
            {error}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Frameworks section */}
        {project && (
          <>
            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Frameworks ({project.frameworks.length})
              </h2>
              <div className="space-y-3">
                {project.frameworks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No frameworks added to this project
                  </p>
                ) : (
                  project.frameworks.map((fw) => (
                    <div
                      key={fw.id}
                      className="bg-card border border-border rounded-lg p-4 hover:border-blue-600/30 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-medium">
                            {fw.type.replace(/_/g, " ")}
                          </h3>
                          <p
                            className={`text-xs mt-1 ${
                              statusColor[fw.status as keyof typeof statusColor] ||
                              statusColor.NOT_STARTED
                            }`}
                          >
                            {fw.status.replace(/_/g, " ")}
                          </p>
                        </div>
                        <div className={`text-2xl font-bold ${riskColor(fw.score)}`}>
                          {fw.score}%
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {fw.passedControls}/{fw.totalControls} controls passed
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Scan History */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                Scan History
              </h2>
              <div className="space-y-3">
                {project.frameworks.length === 0 ||
                 project.frameworks.every((f) => f.scans.length === 0) ? (
                  <p className="text-sm text-muted-foreground">
                    No scans completed yet
                  </p>
                ) : (
                  project.frameworks.flatMap((fw) =>
                    fw.scans.map((scan, idx) => (
                      <div
                        key={`${fw.id}-${idx}`}
                        className="bg-card border border-border rounded-lg p-4 flex items-center justify-between"
                      >
                        <div>
                          <p className="font-medium text-sm">
                            {fw.type.replace(/_/g, " ")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3 inline mr-1" />
                            {new Date(scan.completedAt).toLocaleDateString()}
                          </p>
                        </div>
                        <Link
                          href={`/api/scan/${scan.id}/pdf`}
                          target="_blank"
                          className="flex items-center gap-2 px-3 py-1.5 text-blue-600 hover:bg-blue-600/10 rounded text-sm font-medium transition-colors"
                        >
                          ↓ PDF
                        </Link>
                      </div>
                    ))
                  )
                )}
              </div>
            </div>

            {/* Documents */}
            <div>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Documents ({project.documents.length})
              </h2>
              <div className="space-y-3">
                {project.documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No documents yet
                  </p>
                ) : (
                  project.documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="bg-card border border-border rounded-lg p-4 hover:border-blue-600/30 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-medium text-sm">{doc.title}</h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            {doc.category} •{" "}
                            {new Date(doc.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <h3 className="font-semibold">Delete Project</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Are you sure? This will delete the project and all associated scans and
              documents. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors text-sm font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete Project"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
