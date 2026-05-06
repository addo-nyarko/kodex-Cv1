"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Loader2,
  AlertCircle,
  Shield,
} from "lucide-react";

interface Framework {
  id: string;
  type: string;
  score: number;
  status: string;
  totalControls: number;
  passedControls: number;
}

interface Scan {
  id: string;
  status: string;
  score: number;
  createdAt: string;
  frameworkType: string;
}

interface ProjectData {
  id: string;
  name: string;
  description: string | null;
  complianceScore: number;
  createdAt: string;
  updatedAt: string;
  frameworks: Framework[];
  scans: Scan[];
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFramework, setSelectedFramework] = useState<string | null>(null);

  useEffect(() => {
    async function loadProject() {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (!res.ok) throw new Error("Project not found");
        setProject(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load project");
      } finally {
        setLoading(false);
      }
    }
    loadProject();
  }, [projectId]);

  // Store lastProjectId in sessionStorage for scan context
  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("lastProjectId", projectId);
    }
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 mx-auto text-red-500 mb-4" />
          <p className="text-red-500">{error || "Project not found"}</p>
          <button
            onClick={() => router.push("/projects")}
            className="mt-4 text-blue-500 hover:underline"
          >
            Back to projects
          </button>
        </div>
      </div>
    );
  }

  const filteredScans = selectedFramework
    ? project.scans.filter((s) => s.frameworkType === selectedFramework)
    : project.scans;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <header className="bg-card/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-6xl mx-auto px-8 py-6">
          <div className="flex items-start justify-between mb-4">
            <button
              onClick={() => router.push("/projects")}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Projects
            </button>
            <a
              href={`/scan?projectId=${projectId}`}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Start New Scan
            </a>
          </div>

          <div>
            <h1 className="text-3xl font-bold text-foreground">{project.name}</h1>
            {project.description && (
              <p className="text-muted-foreground mt-2">{project.description}</p>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-8 py-8">
        {/* Compliance Score */}
        <div className="bg-card border border-border rounded-xl p-8 mb-8">
          <p className="text-sm text-muted-foreground mb-2">Overall Compliance Score</p>
          <p
            className={`text-5xl font-bold ${
              project.complianceScore >= 80
                ? "text-green-500"
                : project.complianceScore >= 50
                  ? "text-amber-500"
                  : "text-red-500"
            }`}
          >
            {project.complianceScore}%
          </p>
        </div>

        {/* Frameworks */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-foreground mb-4">Compliance Frameworks</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {project.frameworks.map((fw) => (
              <button
                key={fw.id}
                onClick={() => setSelectedFramework(selectedFramework === fw.type ? null : fw.type)}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  selectedFramework === fw.type
                    ? "border-blue-600 bg-blue-600/5"
                    : "border-border bg-card hover:border-border"
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-blue-600" />
                    <span className="font-semibold text-sm">{fw.type.replace(/_/g, " ")}</span>
                  </div>
                  <span
                    className={`text-lg font-bold ${
                      fw.score >= 80 ? "text-green-500" : fw.score >= 50 ? "text-amber-500" : "text-red-500"
                    }`}
                  >
                    {fw.score}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {fw.passedControls}/{fw.totalControls} controls passed
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Recent Scans */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-xl font-bold text-foreground mb-4">Recent Scans</h2>
          {filteredScans.length === 0 ? (
            <div className="text-center py-12">
              {selectedFramework ? (
                <p className="text-muted-foreground">
                  No scans for {selectedFramework.replace(/_/g, " ")}
                </p>
              ) : (
                <>
                  <p className="text-foreground font-semibold mb-4">
                    Run your first compliance scan
                  </p>
                  <a
                    href={`/scan?projectId=${projectId}`}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors font-medium"
                  >
                    Start scan
                    <span className="text-lg">→</span>
                  </a>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredScans.map((scan) => (
                <div key={scan.id} className="flex items-center justify-between p-4 bg-muted/20 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-foreground">
                      {scan.frameworkType.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(scan.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className={`font-bold ${scan.score >= 80 ? "text-green-500" : scan.score >= 50 ? "text-amber-500" : "text-red-500"}`}>
                      {scan.score}%
                    </p>
                    <a
                      href={`/scans/${scan.id}`}
                      className="text-sm text-blue-500 hover:text-blue-400 font-medium"
                    >
                      View Results
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
