import { getSession } from "@/lib/auth-helper";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

const LEVEL_STYLES: Record<string, { badge: string; icon: string; bg: string }> = {
  CRITICAL: {
    badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    icon: "text-red-600 dark:text-red-400",
    bg: "bg-red-600/10",
  },
  HIGH: {
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    icon: "text-red-600 dark:text-red-400",
    bg: "bg-red-600/10",
  },
  MEDIUM: {
    badge: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    icon: "text-yellow-600 dark:text-yellow-400",
    bg: "bg-yellow-600/10",
  },
  LOW: {
    badge: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    icon: "text-green-600 dark:text-green-400",
    bg: "bg-green-600/10",
  },
  INFORMATIONAL: {
    badge: "bg-muted text-muted-foreground",
    icon: "text-muted-foreground",
    bg: "bg-muted",
  },
};

export default async function RiskRegister() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { orgId } = session;

  const risks = await db.risk.findMany({
    where: { orgId },
    orderBy: { riskScore: "desc" },
  });

  const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  risks.forEach((r) => {
    if (r.level === "CRITICAL" || r.level === "HIGH") counts.HIGH++;
    else if (r.level === "MEDIUM") counts.MEDIUM++;
    else counts.LOW++;
  });

  return (
    <>
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-sm border-b border-border px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Risk Assessment</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Identify and manage compliance risks
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="p-8 max-w-5xl">
        {/* 3-column stats grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-red-600/10 w-12 h-12 rounded-lg flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <span className="text-3xl font-bold">{counts.HIGH}</span>
            </div>
            <p className="text-muted-foreground">High Risk</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-yellow-600/10 w-12 h-12 rounded-lg flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <span className="text-3xl font-bold">{counts.MEDIUM}</span>
            </div>
            <p className="text-muted-foreground">Medium Risk</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-green-600/10 w-12 h-12 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <span className="text-3xl font-bold">{counts.LOW}</span>
            </div>
            <p className="text-muted-foreground">Low Risk</p>
          </div>
        </div>

        {/* Risk register */}
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Risk Register
        </h2>

        {risks.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <div className="bg-blue-600/10 w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              No risks recorded yet. Risks are identified automatically during scans.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {risks.map((r) => {
              const style = LEVEL_STYLES[r.level] ?? LEVEL_STYLES.INFORMATIONAL;
              return (
                <div
                  key={r.id}
                  className="bg-card border border-border rounded-xl p-6"
                >
                  <div className="flex items-start gap-4 mb-4">
                    <div className={`${style.bg} w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0`}>
                      <AlertTriangle className={`w-5 h-5 ${style.icon}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium">{r.title}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${style.badge}`}>
                          {r.level}
                        </span>
                        {r.category && (
                          <span className="bg-muted px-3 py-1 rounded-full text-xs text-muted-foreground">
                            {r.category.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{r.description}</p>
                    </div>
                  </div>

                  {/* Why this matters / Recommended fix */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 pl-16">
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Why this matters</h4>
                      <p className="text-sm text-foreground/80">{r.description}</p>
                    </div>
                    {r.treatmentPlan && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Recommended fix</h4>
                        <p className="text-sm text-foreground/80">{r.treatmentPlan}</p>
                      </div>
                    )}
                  </div>

                  {/* Meta + actions */}
                  <div className="flex items-center justify-between pl-16">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Score: {r.riskScore}</span>
                      <span>Status: {r.status.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors">
                        Mark as resolved
                      </button>
                      <button className="px-3 py-1.5 bg-muted text-muted-foreground rounded-lg text-xs font-medium hover:bg-accent transition-colors">
                        Assign owner
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
