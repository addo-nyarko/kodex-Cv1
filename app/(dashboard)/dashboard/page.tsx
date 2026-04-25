import { getSession } from "@/lib/auth-helper";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { orgId } = session;

  const org = await db.organization.findUnique({
    where: { id: orgId },
    include: {
      frameworks: { orderBy: { updatedAt: "desc" } },
    },
  });

  const score = org?.complianceScore ?? 0;
  const userName = org?.name || "Yaw Addo";

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">{userName}</p>
      </div>

      {/* Score + Frameworks row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
        {/* Score Card */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-8 flex flex-col items-center justify-center animate-fade-in">
          <div className="text-5xl font-bold mb-2">{score}%</div>
          <p className="text-sm text-muted-foreground">Overall compliance score</p>
        </div>

        {/* Frameworks Card */}
        <div className="lg:col-span-3 bg-card border border-border rounded-xl p-6 animate-fade-in-delay-1">
          <h2 className="font-semibold mb-4">Frameworks</h2>
          {org?.frameworks.length ? (
            <div className="space-y-4">
              {org.frameworks.map((fw) => (
                <Link
                  key={fw.id}
                  href={`/frameworks/${fw.id}`}
                  className="flex items-center justify-between group"
                >
                  <span className="font-medium text-sm">{fw.type.replace(/_/g, " ")}</span>
                  <div className="flex items-center gap-3 flex-1 ml-6">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-muted-foreground rounded-full transition-all duration-500"
                        style={{ width: `${fw.score}%` }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground w-8 text-right">{fw.score}%</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No frameworks yet.{" "}
              <Link href="/frameworks" className="text-blue-400 hover:underline">
                Add your first framework
              </Link>
            </p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Start a scan", href: "/scan", primary: true },
          { label: "Upload evidence", href: "/evidence", primary: false },
          { label: "View risk register", href: "/risk", primary: false },
          { label: "Generate policy", href: "/policies", primary: false },
        ].map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className={`rounded-xl px-6 py-4 text-center text-sm font-medium transition-colors ${
              action.primary
                ? "bg-blue-600 text-white hover:bg-blue-500"
                : "bg-card border border-border text-foreground hover:border-blue-600/30"
            }`}
          >
            {action.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
