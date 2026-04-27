import { getSession } from "@/lib/auth-helper";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ScanSearch, FileText, AlertTriangle, FileCheck, Shield, Plus, Clock, FolderOpen } from "lucide-react";

export default async function DashboardHome() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { orgId } = session;

  const org = await db.organization.findUnique({
    where: { id: orgId },
    include: {
      frameworks: { orderBy: { updatedAt: "desc" } },
      projects: { where: { isActive: true }, orderBy: { updatedAt: "desc" } },
    },
  });

  const score = org?.complianceScore ?? 0;
  const userName = org?.name || "there";
  const activeFrameworks: Array<{ id: string; type: string; score: number; status: string }> = org?.frameworks ?? [];
  const projects: Array<{ id: string; name: string; description: string | null; complianceScore: number; updatedAt: Date }> = org?.projects ?? [];

  return (
    <div className="min-h-screen">
      {/* Header Bar */}
      <div className="bg-card/80 backdrop-blur-sm border-b border-border px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Welcome back, {userName}
            </p>
          </div>
          <ThemeToggle />
        </div>
      </div>

      <div className="p-8 space-y-8">
        {/* Score + Recent Activity Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Blue Gradient Score Card */}
          <div className="lg:col-span-2 relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 p-8 text-white">
            <svg
              className="absolute inset-0 w-full h-full opacity-10"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                  <path d="M 32 0 L 0 0 0 32" fill="none" stroke="white" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
            <div className="absolute top-4 right-8 w-16 h-16 rounded-full bg-white/10" />
            <div className="absolute bottom-6 right-24 w-10 h-10 rounded-lg bg-white/10 rotate-12" />
            <div className="absolute top-12 right-32 w-6 h-6 rounded-full bg-white/5" />

            <div className="relative z-10">
              <p className="text-blue-100 text-sm font-medium mb-2">Compliance Score</p>
              <div className="text-6xl font-bold mb-2">{score}%</div>
              <p className="text-blue-200 text-sm">
                Overall compliance across all active frameworks
              </p>
            </div>
          </div>

          {/* Recent Activity Card */}
          <div className="bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-shadow">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              Recent Activity
            </h2>
            <div className="space-y-4">
              {activeFrameworks.length > 0 ? (
                activeFrameworks.slice(0, 4).map((fw) => (
                  <div key={fw.id} className="flex items-start gap-3">
                    <div className="mt-1.5 w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">
                        {fw.type.replace(/_/g, " ")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Score: {fw.score}%
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No recent activity</p>
              )}
            </div>
          </div>
        </div>

        {/* Projects Section */}
        {projects.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Your Projects
              </h2>
              <Link
                href="/projects/new"
                className="text-sm text-blue-600 hover:text-blue-500 font-medium flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                New project
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="bg-card border border-border rounded-xl p-6 hover:shadow-lg hover:border-blue-600/30 transition-all"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="bg-blue-600/10 w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FolderOpen className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">{project.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {project.applicableFrameworks.length} framework{project.applicableFrameworks.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="bg-muted rounded-full h-1.5">
                        <div
                          className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${project.complianceScore}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground ml-3">{project.complianceScore}%</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Frameworks Section */}
        <div className="bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-shadow">
          {activeFrameworks.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                Active Frameworks
              </h3>
              <div className="space-y-4">
                {activeFrameworks.map((fw) => (
                  <div key={fw.id} className="flex items-center gap-4">
                    <div className="bg-blue-600/10 w-12 h-12 rounded-lg flex items-center justify-center shrink-0">
                      <Shield className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">
                          {fw.type.replace(/_/g, " ")}
                        </span>
                        <span className="text-sm text-muted-foreground">{fw.score}%</span>
                      </div>
                      <div className="bg-muted rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${fw.score}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Available Frameworks
            </h3>
            <Link
              href="/frameworks"
              className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-500 font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add framework
            </Link>
          </div>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/scan"
            className="group bg-blue-600 text-white rounded-xl p-6 hover:bg-blue-500 hover:shadow-lg transition-all hover:-translate-y-0.5"
          >
            <div className="bg-white/20 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <ScanSearch className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-sm">Start a scan</h3>
            <p className="text-blue-100 text-xs mt-1">Run compliance checks</p>
          </Link>

          <Link
            href="/documents"
            className="group bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-all hover:-translate-y-0.5"
          >
            <div className="bg-blue-600/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-semibold text-sm">Documents</h3>
            <p className="text-muted-foreground text-xs mt-1">View reports & policies</p>
          </Link>

          <Link
            href="/risk"
            className="group bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-all hover:-translate-y-0.5"
          >
            <div className="bg-blue-600/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <AlertTriangle className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-semibold text-sm">View risk register</h3>
            <p className="text-muted-foreground text-xs mt-1">Monitor identified risks</p>
          </Link>

          <Link
            href="/policies"
            className="group bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-all hover:-translate-y-0.5"
          >
            <div className="bg-blue-600/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <FileCheck className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-semibold text-sm">Generate policy</h3>
            <p className="text-muted-foreground text-xs mt-1">Create policy documents</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
