"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  Plus,
  Shield,
  ScanSearch,
  FileText,
  ArrowUpRight,
  Loader2,
  FolderOpen,
} from "lucide-react";

type ProjectCard = {
  id: string;
  name: string;
  description: string | null;
  industry: string | null;
  complianceScore: number;
  frameworkCount: number;
  frameworks: { type: string; score: number }[];
  scanCount: number;
  lastScanDate: string | null;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
};

type ProjectsResponse = {
  projects: ProjectCard[];
  plan: string;
  limit: number;
  count: number;
  atLimit: boolean;
};

export default function ProjectList() {
  const [data, setData] = useState<ProjectsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProjects() {
      try {
        const res = await fetch("/api/projects");
        if (!res.ok) throw new Error("Failed to load projects");
        setData(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }
    fetchProjects();
  }, []);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-card/80 backdrop-blur-sm border-b border-border px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Projects</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your compliance projects
            </p>
          </div>
          {data && (
            <div>
              {data.atLimit ? (
                <Link
                  href="/settings/billing"
                  className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-400 transition-colors"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  Upgrade to add more projects
                </Link>
              ) : (
                <Link
                  href="/projects/new"
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Project
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="p-8">
        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Empty state */}
        {data && data.projects.length === 0 && (
          <div className="text-center py-20">
            <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-2">No projects yet</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
              Create your first project to start managing compliance frameworks,
              evidence, and scans.
            </p>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Your First Project
            </Link>
          </div>
        )}

        {/* Projects grid */}
        {data && data.projects.length > 0 && (
          <>
            <div className="text-xs text-muted-foreground mb-4">
              {data.count} of {data.limit} projects ({data.plan} plan)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.projects.map((project, i) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.2 }}
                >
                  <Link
                    href={`/projects/${project.id}`}
                    className="block bg-card border border-border rounded-xl p-6 hover:shadow-lg hover:border-blue-600/30 transition-all group"
                  >
                    {/* Title + Score */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm group-hover:text-blue-600 transition-colors truncate">
                          {project.name}
                        </h3>
                        {project.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {project.description}
                          </p>
                        )}
                      </div>
                      <div className="ml-3 shrink-0">
                        <div
                          className={`text-lg font-bold ${
                            project.complianceScore >= 80
                              ? "text-green-500"
                              : project.complianceScore >= 50
                                ? "text-amber-500"
                                : "text-muted-foreground"
                          }`}
                        >
                          {project.complianceScore}%
                        </div>
                      </div>
                    </div>

                    {/* Framework badges */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {project.frameworks.map((fw) => (
                        <span
                          key={fw.type}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-600/10 text-blue-600 text-[10px] font-medium"
                        >
                          <Shield className="w-2.5 h-2.5" />
                          {fw.type.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground border-t border-border pt-3">
                      <span className="flex items-center gap-1">
                        <ScanSearch className="w-3 h-3" />
                        {project.scanCount} scan{project.scanCount !== 1 ? "s" : ""}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {project.documentCount} doc{project.documentCount !== 1 ? "s" : ""}
                      </span>
                      <Link
                        href={`/scan?projectId=${project.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="ml-auto text-blue-500 hover:text-blue-400 font-medium transition-colors"
                      >
                        Scan →
                      </Link>
                      {project.lastScanDate && (
                        <span>
                          Last scan{" "}
                          {new Date(project.lastScanDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
