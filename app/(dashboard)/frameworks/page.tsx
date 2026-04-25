import { getSession } from "@/lib/auth-helper";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";

const AVAILABLE_FRAMEWORKS = [
  { type: "ISO_27001", name: "ISO 27001", desc: "Information security management", icon: "🛡️" },
  { type: "SOC2", name: "SOC 2", desc: "Trust & reliability", icon: "✅" },
  { type: "NIS2", name: "NIS2", desc: "Network & information security", icon: "🌐" },
  { type: "DORA", name: "DORA", desc: "Digital operational resilience", icon: "⚡" },
];

export default async function FrameworksPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { orgId } = session;

  const activeFrameworks = await db.framework.findMany({
    where: { orgId },
    orderBy: { updatedAt: "desc" },
  });
  const activeTypes = new Set(activeFrameworks.map((f) => f.type));

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Frameworks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select the compliance frameworks relevant to your organisation.
        </p>
      </div>

      {/* Active Frameworks */}
      {activeFrameworks.length > 0 && (
        <div className="mb-10 animate-fade-in">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Active
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeFrameworks.map((fw) => (
              <Link
                key={fw.id}
                href={`/frameworks/${fw.id}`}
                className="bg-card border border-border rounded-xl p-5 hover:border-blue-600/30 transition-all"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-sm">{fw.type.replace(/_/g, " ")}</span>
                  <span className="text-xs text-muted-foreground">{fw.status.replace(/_/g, " ")}</span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-500"
                    style={{ width: `${fw.score}%` }}
                  />
                </div>
                <span className="text-sm text-muted-foreground">{fw.score}%</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Available Frameworks */}
      <div className="animate-fade-in-delay-1">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Available Frameworks
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {AVAILABLE_FRAMEWORKS.filter((f) => !activeTypes.has(f.type as never)).map((f) => (
            <div
              key={f.type}
              className="bg-card border border-border rounded-xl p-5 hover:border-blue-600/30 transition-all group"
            >
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-sm mb-1">{f.name}</h3>
              <p className="text-xs text-muted-foreground mb-4">{f.desc}</p>
              <form action="/api/frameworks" method="POST">
                <input type="hidden" name="type" value={f.type} />
                <button className="w-full py-2 border border-border rounded-lg text-sm group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-colors">
                  Add framework
                </button>
              </form>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
