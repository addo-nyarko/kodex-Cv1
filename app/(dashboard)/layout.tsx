"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SignOutButton } from "./SignOutButton";
import { ScanProvider } from "./contexts/ScanContext";
import { FloatingScanWidget } from "./components/FloatingScanWidget";
import {
  LayoutDashboard,
  FolderKanban,
  ScanSearch,
  FileText,
  AlertTriangle,
  Shield,
  MessageSquare,
  Settings,
  ChevronDown,
  Folder,
  Plus,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/risk", label: "Risk", icon: AlertTriangle },
  { href: "/frameworks", label: "Frameworks", icon: Shield },
  { href: "/ai-assistant", label: "AI Assistant", icon: MessageSquare },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface Project {
  id: string;
  name: string;
  complianceScore?: number;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => {
        const list: Project[] = data.projects ?? data ?? [];
        setProjects(list);
        if (list.length > 0 && !selectedProjectId) {
          setSelectedProjectId(list[0].id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <ScanProvider>
      <div className="flex h-screen bg-background text-foreground overflow-hidden">
        {/* Animated Sidebar */}
        <motion.aside
        className="bg-card border-r border-border flex flex-col relative z-20"
        animate={{ width: sidebarExpanded ? "256px" : "80px" }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => {
          setSidebarExpanded(false);
          setSwitcherOpen(false);
        }}
      >
        {/* Logo */}
        <div className="p-6 border-b border-border flex items-center">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="bg-blue-600 rounded-lg p-2 flex items-center justify-center w-10 h-10 flex-shrink-0">
              <span className="text-white font-bold">KC</span>
            </div>
            <motion.span
              className="font-semibold whitespace-nowrap"
              animate={{ opacity: sidebarExpanded ? 1 : 0, width: sidebarExpanded ? "auto" : 0 }}
              transition={{ duration: 0.2 }}
            >
              Kodex
            </motion.span>
          </div>
        </div>

        {/* Project Switcher */}
        <div className="px-4 pt-4 pb-2" ref={switcherRef}>
          {projects.length === 0 ? (
            <Link
              href="/projects/new"
              className="flex items-center gap-3 px-3 py-3 rounded-lg border border-dashed border-border hover:bg-accent transition-colors"
              title={!sidebarExpanded ? "Create your first project" : undefined}
            >
              <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
              <motion.span
                className="text-sm text-muted-foreground whitespace-nowrap overflow-hidden"
                animate={{ opacity: sidebarExpanded ? 1 : 0, width: sidebarExpanded ? "auto" : 0 }}
                transition={{ duration: 0.2 }}
              >
                Create your first project
              </motion.span>
            </Link>
          ) : (
            <div className="relative">
              <button
                type="button"
                onClick={() => setSwitcherOpen(!switcherOpen)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-border hover:bg-accent transition-colors"
                title={!sidebarExpanded ? selectedProject?.name ?? "Select project" : undefined}
              >
                <Folder className="h-5 w-5 flex-shrink-0 text-blue-600" />
                <motion.div
                  className="flex-1 min-w-0 text-left overflow-hidden"
                  animate={{ opacity: sidebarExpanded ? 1 : 0, width: sidebarExpanded ? "auto" : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="text-sm font-medium truncate">
                    {selectedProject?.name ?? "Select project"}
                  </div>
                  {selectedProject?.complianceScore !== undefined && (
                    <div className="text-xs text-muted-foreground">
                      Score: {selectedProject.complianceScore}%
                    </div>
                  )}
                </motion.div>
                <motion.div
                  animate={{ opacity: sidebarExpanded ? 1 : 0, width: sidebarExpanded ? "auto" : 0 }}
                  className="overflow-hidden"
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown
                    className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform ${
                      switcherOpen ? "rotate-180" : ""
                    }`}
                  />
                </motion.div>
              </button>

              <AnimatePresence>
                {switcherOpen && sidebarExpanded && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden"
                  >
                    <div className="max-h-48 overflow-y-auto py-1">
                      {projects.map((project) => (
                        <button
                          type="button"
                          key={project.id}
                          onClick={() => {
                            setSelectedProjectId(project.id);
                            setSwitcherOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors flex items-center justify-between ${
                            project.id === selectedProjectId ? "bg-accent" : ""
                          }`}
                        >
                          <span className="truncate font-medium">{project.name}</span>
                          {project.complianceScore !== undefined && (
                            <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                              {project.complianceScore}%
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="border-t border-border">
                      <Link
                        href="/projects/new"
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-blue-600 hover:bg-accent transition-colors"
                        onClick={() => setSwitcherOpen(false)}
                      >
                        <Plus className="h-4 w-4" />
                        New Project
                      </Link>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 p-4 overflow-y-auto">
          {nav.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <motion.div key={item.href} whileHover={{ x: sidebarExpanded ? 4 : 0 }}>
                <Link
                  href={item.href}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors relative group ${
                    isActive ? "bg-blue-600 text-white" : "hover:bg-accent"
                  }`}
                  title={!sidebarExpanded ? item.label : undefined}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  <motion.span
                    className="whitespace-nowrap overflow-hidden"
                    animate={{ opacity: sidebarExpanded ? 1 : 0, width: sidebarExpanded ? "auto" : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {item.label}
                  </motion.span>

                  {!sidebarExpanded && (
                    <div className="absolute left-full ml-2 px-3 py-2 bg-gray-900 dark:bg-gray-800 text-white text-sm rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity">
                      {item.label}
                    </div>
                  )}
                </Link>
              </motion.div>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="p-4 border-t border-border flex items-center gap-3">
          <SignOutButton />
          <motion.div animate={{ opacity: sidebarExpanded ? 1 : 0, width: sidebarExpanded ? "auto" : 0 }} className="overflow-hidden">
            <ThemeToggle />
          </motion.div>
        </div>
      </motion.aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto relative">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-transparent to-purple-50/30 dark:from-blue-950/20 dark:via-transparent dark:to-purple-950/10 pointer-events-none" />

        {/* Watermark decorations */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.03] dark:opacity-[0.05]">
          <motion.div
            className="absolute top-1/4 left-1/4 w-48 h-48 border-2 border-current rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute top-1/3 right-1/4 w-64 h-64 border-2 border-current rounded-lg"
            animate={{ rotate: -360 }}
            transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute bottom-1/4 left-1/3 w-40 h-40 border-2 border-current rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          />
        </div>

        <div className="relative z-10">
          {children}
        </div>
      </main>

      {/* Floating scan widget */}
      <FloatingScanWidget />
      </div>
    </ScanProvider>
  );
}
