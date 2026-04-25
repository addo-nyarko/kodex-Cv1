"use client";

import { useState, useEffect, useCallback } from "react";

type IntegrationDef = {
  type: string;
  name: string;
  description: string;
  icon: string;
  available: boolean;
};

const AVAILABLE_INTEGRATIONS: IntegrationDef[] = [
  {
    type: "GITHUB",
    name: "GitHub",
    description: "Scan repositories for security patterns, documentation, and CI/CD configuration.",
    icon: "GH",
    available: true,
  },
  {
    type: "GOOGLE_WORKSPACE",
    name: "Google Workspace",
    description: "Import security policies, access controls, and admin audit logs.",
    icon: "GW",
    available: true,
  },
  {
    type: "CUSTOM_WEBHOOK",
    name: "Notion",
    description: "Pull compliance documentation, runbooks, and policies from your Notion workspace.",
    icon: "NT",
    available: true,
  },
  {
    type: "SLACK",
    name: "Slack",
    description: "Monitor data handling practices and retention policies in channels.",
    icon: "SL",
    available: true,
  },
];

type IntegrationRecord = {
  id: string;
  type: string;
  name: string;
  status: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  itemsSynced: number;
};

type Repo = {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  language: string | null;
  updatedAt: string;
  description: string | null;
};

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<IntegrationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check URL params for OAuth callback results
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    if (connected) {
      setError(null);
      window.history.replaceState({}, "", "/settings/integrations");
    }
    if (params.get("error")) {
      setError(`Connection failed: ${params.get("error")}`);
      window.history.replaceState({}, "", "/settings/integrations");
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/status");
      const data = await res.json();
      setIntegrations(data.integrations || []);
    } catch {
      console.error("Failed to fetch integrations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const getStatus = (type: string) => {
    return integrations.find((i) => i.type === type);
  };

  const handleConnect = (type: string) => {
    const routes: Record<string, string> = {
      GITHUB: "/api/integrations/github/connect",
      GOOGLE_WORKSPACE: "/api/integrations/google/connect",
      CUSTOM_WEBHOOK: "/api/integrations/notion/connect", // Notion uses CUSTOM_WEBHOOK type
      SLACK: "/api/integrations/slack/connect",
    };
    const route = routes[type];
    if (route) window.location.href = route;
  };

  const handleDisconnect = async (type: string) => {
    if (!confirm("Disconnect this integration? Scan data will be preserved.")) return;
    await fetch("/api/integrations/status", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    setRepos([]);
    setScanResult(null);
    fetchStatus();
  };

  const handleLoadRepos = async () => {
    setLoadingRepos(true);
    try {
      const res = await fetch("/api/integrations/github/repos");
      const data = await res.json();
      setRepos(data.repos || []);
    } catch {
      setError("Failed to load repositories");
    } finally {
      setLoadingRepos(false);
    }
  };

  const handleScanRepo = async (owner: string, repo: string) => {
    setScanning(true);
    setScanResult(null);
    setError(null);
    try {
      const res = await fetch("/api/integrations/github/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
      setScanResult(data.signals);
      fetchStatus(); // Refresh status after scan
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-2">Integrations</h1>
      <p className="text-muted-foreground text-sm mb-8">
        Connect your tools to automatically gather compliance evidence from your actual infrastructure.
      </p>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-3 text-red-400 hover:text-red-300">
            ✕
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading integrations...</div>
      ) : (
        <div className="space-y-4">
          {AVAILABLE_INTEGRATIONS.map((def) => {
            const status = getStatus(def.type);
            const isConnected = status?.status === "CONNECTED";
            const isSyncing = status?.status === "SYNCING";
            const hasError = status?.status === "ERROR";

            return (
              <div
                key={def.type}
                className={`border rounded-xl p-6 transition-all ${
                  isConnected
                    ? "border-green-500/30 bg-green-500/5"
                    : hasError
                    ? "border-red-500/30 bg-red-500/5"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-12 h-12 rounded-lg flex items-center justify-center text-lg font-bold ${
                        isConnected
                          ? "bg-green-500/10 text-green-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {def.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground flex items-center gap-2">
                        {def.name}
                        {isConnected && (
                          <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full">
                            Connected
                          </span>
                        )}
                        {isSyncing && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full animate-pulse">
                            Syncing...
                          </span>
                        )}
                        {hasError && (
                          <span className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full">
                            Error
                          </span>
                        )}
                        {!def.available && (
                          <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                            Coming Soon
                          </span>
                        )}
                      </h3>
                      <p className="text-muted-foreground text-sm mt-0.5">{def.description}</p>
                      {status?.lastSyncAt && (
                        <p className="text-muted-foreground text-xs mt-1">
                          Last sync: {new Date(status.lastSyncAt).toLocaleString()} · {status.itemsSynced} findings
                        </p>
                      )}
                      {status?.lastSyncError && (
                        <p className="text-red-400 text-xs mt-1">Error: {status.lastSyncError}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {isConnected ? (
                      <>
                        {def.type === "GITHUB" && (
                          <button
                            onClick={handleLoadRepos}
                            disabled={loadingRepos}
                            className="px-4 py-2 bg-primary rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                          >
                            {loadingRepos ? "Loading..." : "Select Repo to Scan"}
                          </button>
                        )}
                        <button
                          onClick={() => handleDisconnect(def.type)}
                          className="px-4 py-2 bg-muted border border-border rounded-lg text-sm text-foreground/80 hover:bg-accent"
                        >
                          Disconnect
                        </button>
                      </>
                    ) : def.available ? (
                      <button
                        onClick={() => handleConnect(def.type)}
                        className="px-4 py-2 bg-primary rounded-lg text-sm font-medium hover:bg-primary/90"
                      >
                        Connect
                      </button>
                    ) : (
                      <button
                        disabled
                        className="px-4 py-2 bg-muted rounded-lg text-sm text-muted-foreground cursor-not-allowed"
                      >
                        Coming Soon
                      </button>
                    )}
                  </div>
                </div>

                {/* Repo picker — shown when GitHub is connected and repos are loaded */}
                {def.type === "GITHUB" && repos.length > 0 && (
                  <div className="mt-4 border-t border-border pt-4">
                    <h4 className="text-sm font-medium text-foreground/80 mb-3">Select a repository to scan:</h4>
                    <div className="grid gap-2 max-h-64 overflow-y-auto">
                      {repos.map((repo) => {
                        const [owner] = repo.fullName.split("/");
                        return (
                          <button
                            key={repo.id}
                            onClick={() => handleScanRepo(owner, repo.name)}
                            disabled={scanning}
                            className="flex items-center justify-between p-3 bg-muted/50 border border-border rounded-lg hover:bg-accent/50 disabled:opacity-50 text-left"
                          >
                            <div>
                              <span className="text-foreground text-sm font-medium">{repo.fullName}</span>
                              {repo.private && (
                                <span className="ml-2 text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                                  Private
                                </span>
                              )}
                              {repo.description && (
                                <p className="text-muted-foreground text-xs mt-0.5 truncate max-w-md">
                                  {repo.description}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              {repo.language && (
                                <span className="text-xs text-muted-foreground">{repo.language}</span>
                              )}
                              <span className="text-primary text-sm">
                                {scanning ? "Scanning..." : "Scan →"}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Scan results */}
                {def.type === "GITHUB" && scanResult && (
                  <div className="mt-4 border-t border-border pt-4">
                    <h4 className="text-sm font-medium text-green-400 mb-3">
                      Scan Complete — {(scanResult as Record<string, unknown>).repo as string}
                    </h4>
                    <p className="text-foreground/80 text-sm mb-3">
                      {(scanResult as Record<string, unknown>).summary as string}
                    </p>

                    <div className="grid grid-cols-3 gap-3">
                      {(["security", "documentation", "cicd"] as const).map((cat) => {
                        const catData = (scanResult as Record<string, Record<string, unknown>>)[cat];
                        const findings = (catData?.findings as string[]) || [];
                        return (
                          <div key={cat} className="bg-muted/50 rounded-lg p-3">
                            <h5 className="text-xs font-medium text-muted-foreground uppercase mb-2">
                              {cat === "cicd" ? "CI/CD" : cat.charAt(0).toUpperCase() + cat.slice(1)}
                            </h5>
                            <p className="text-lg font-bold text-foreground mb-1">{findings.length}</p>
                            <p className="text-xs text-muted-foreground">findings</p>
                          </div>
                        );
                      })}
                    </div>

                    <p className="text-muted-foreground text-xs mt-3">
                      Findings have been saved as automated evidence and will be used in your next compliance scan and policy generation.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
