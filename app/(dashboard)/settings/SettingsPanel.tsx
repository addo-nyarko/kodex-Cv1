import { getSession } from "@/lib/auth-helper";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export default async function SettingsPanel() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { userId } = session;
  const user = await db.user.findUnique({ where: { id: userId } });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-sm border-b border-border px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your account and preferences
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl space-y-6">
          {/* Account Settings */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-lg font-semibold text-foreground mb-6">Account Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Company Name
                </label>
                <input
                  type="text"
                  defaultValue=""
                  placeholder="Your company name"
                  className="w-full px-4 py-3 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Email
                </label>
                <input
                  type="email"
                  defaultValue={user?.email ?? ""}
                  className="w-full px-4 py-3 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                  readOnly
                />
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-lg font-semibold text-foreground mb-6">Notifications</h2>
            <div className="space-y-5">
              {[
                { label: "Email notifications", description: "Receive updates via email", defaultOn: true },
                { label: "Compliance alerts", description: "Get notified about compliance changes", defaultOn: true },
                { label: "Weekly reports", description: "Receive weekly summary reports", defaultOn: false },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-foreground">{item.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{item.description}</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" defaultChecked={item.defaultOn} className="sr-only peer" />
                    <div className="w-12 h-6 bg-border rounded-full peer peer-checked:bg-blue-600 transition-colors relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:w-5 after:h-5 after:transition-transform peer-checked:after:translate-x-6" />
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Appearance */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-lg font-semibold text-foreground mb-6">Appearance</h2>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-foreground">Theme</div>
                <div className="text-xs text-muted-foreground mt-0.5">Switch between light and dark mode</div>
              </div>
              <ThemeToggle />
            </div>
          </div>

          {/* Billing & Integrations Links */}
          <Link
            href="/settings/billing"
            className="block bg-card border border-border rounded-xl p-6 hover:border-blue-600/30 transition-all group"
          >
            <h3 className="font-medium text-sm text-foreground">Billing & Subscription</h3>
            <p className="text-xs text-muted-foreground mt-1">Manage your plan and payment details</p>
          </Link>

          <Link
            href="/settings/integrations"
            className="block bg-card border border-border rounded-xl p-6 hover:border-blue-600/30 transition-all group"
          >
            <h3 className="font-medium text-sm text-foreground">Integrations</h3>
            <p className="text-xs text-muted-foreground mt-1">Connect GitHub, Google Workspace, Slack</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
