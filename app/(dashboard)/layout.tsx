"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/frameworks", label: "Frameworks" },
  { href: "/scan", label: "Scan" },
  { href: "/evidence", label: "Evidence" },
  { href: "/risk", label: "Risk" },
  { href: "/policies", label: "Policies" },
  { href: "/ai-assistant", label: "AI Assistant" },
  { href: "/settings", label: "Settings" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[168px] flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
        {/* Logo */}
        <div className="px-5 pt-6 pb-4">
          <span className="text-lg font-bold text-foreground tracking-tight">Kodex</span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-2 space-y-0.5">
          {nav.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-blue-600/15 text-blue-400 font-medium"
                    : "text-blue-400/70 hover:text-blue-400 hover:bg-accent/50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="p-3 border-t border-sidebar-border">
          <UserButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
