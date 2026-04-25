import { getSession } from "@/lib/auth-helper";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

const LEVEL_STYLES: Record<string, { badge: string; icon: string; bg: string }> = {
  CRITICAL: {
    badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    icon: "text-red-600 dark:text-red-400",
    bg: "bg-red-100 dark:bg-red-900/30",
  },
  HIGH: {
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    icon: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-100 dark:bg-orange-900/30",
  },
  MEDIUM: {
    badge: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    icon: "text-yellow-600 dark:text-yellow-400",
    bg: "bg-yellow-100 dark:bg-yellow-900/30",
  },
  LOW: {
    badge: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    icon: "text-green-600 dark:text-green-400",
    bg: "bg-green-100 dark:bg-green-900/30",
  },
  INFORMATIONAL: {
    badge: "bg-muted text-muted-foreground",
    icon: "text-muted-foreground",
    bg: "bg-muted",
  },
};

export default async function RiskPage() {
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
      <div className="p-8 max-w-5xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Risk Register</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Identified risks and their treatment status.
          </p>
        </div>

        {/* Risk summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <span className="text-3xl font-bold">{counts.HIGH}</span>
            </div>
            <p className="text-muted-foreground">High Risk</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-6 animate-fade-in-delay-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <span className="text-3xl font-bold">{counts.MEDIUM}</span>
            </div>
            <p className="text-muted-foreground">Medium Risk</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-6 animate-fade-in-delay-2">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
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
            <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
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
                  className="bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-shadow hover-lift"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-4 flex-1">
                      <div className={`w-10 h-10 rounded-lg ${style.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                        <AlertTriangle className={`w-5 h-5 ${style.icon}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium">{r.title}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${style.badge}`}>
                            {r.level}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{r.description}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground pl-14">
                    <span>Score: {r.riskScore}</span>
                    <span>Status: {r.status.replace(/_/g, " ")}</span>
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
