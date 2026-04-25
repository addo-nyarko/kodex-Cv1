import { getSession } from "@/lib/auth-helper";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { userId } = session;
  const user = await db.user.findUnique({ where: { id: userId } });

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <div className="space-y-4">
        {/* Email */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="text-xs text-muted-foreground mb-1">Email</div>
          <div className="text-sm font-medium">{user?.email ?? "—"}</div>
        </div>

        {/* Billing */}
        <Link
          href="/settings/billing"
          className="block bg-card border border-border rounded-xl p-5 hover:border-blue-600/30 transition-all group"
        >
          <h3 className="font-medium text-sm">Billing & Subscription</h3>
          <p className="text-xs text-muted-foreground mt-1">Manage your plan and payment details</p>
        </Link>

        {/* Integrations */}
        <Link
          href="/settings/integrations"
          className="block bg-card border border-border rounded-xl p-5 hover:border-blue-600/30 transition-all group"
        >
          <h3 className="font-medium text-sm">Integrations</h3>
          <p className="text-xs text-muted-foreground mt-1">Connect GitHub, Google Workspace, Slack</p>
        </Link>
      </div>
    </div>
  );
}
