"use client";

import { useEffect, useState, useCallback } from "react";
import { Shield } from "lucide-react";

const AVAILABLE_FRAMEWORKS = [
  { type: "GDPR", name: "GDPR", desc: "General Data Protection Regulation" },
  { type: "EU_AI_ACT", name: "EU AI Act", desc: "Artificial intelligence regulation" },
  { type: "ISO_27001", name: "ISO 27001", desc: "Information security management" },
  { type: "SOC2", name: "SOC 2", desc: "Trust & reliability" },
  { type: "NIS2", name: "NIS2", desc: "Network & information security" },
  { type: "DORA", name: "DORA", desc: "Digital operational resilience" },
  { type: "CYBER_RESILIENCE_ACT", name: "Cyber Resilience Act", desc: "Cybersecurity for products with digital elements" },
  { type: "PRODUCT_LIABILITY", name: "Product Liability", desc: "Product liability directive for digital products" },
];

interface Framework {
  id: string;
  type: string;
  status: string;
  score: number;
  updatedAt: string;
}

export default function FrameworkManager() {
  const [activeFrameworks, setActiveFrameworks] = useState<Framework[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingType, setAddingType] = useState<string | null>(null);

  const fetchFrameworks = useCallback(async () => {
    try {
      const res = await fetch("/api/frameworks");
      if (res.ok) {
        const data = await res.json();
        setActiveFrameworks(data);
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFrameworks();
  }, [fetchFrameworks]);

  const handleAddFramework = async (type: string) => {
    setAddingType(type);
    try {
      const res = await fetch("/api/frameworks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (res.ok) {
        await fetchFrameworks();
      }
    } catch {
      // silently handle
    } finally {
      setAddingType(null);
    }
  };

  const activeTypes = new Set(activeFrameworks.map((f) => f.type));
  const availableToAdd = AVAILABLE_FRAMEWORKS.filter((f) => !activeTypes.has(f.type));

  function statusBadge(status: string) {
    const label = status.replace(/_/g, " ");
    let colors = "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
    if (status === "ACTIVE" || status === "active") {
      colors = "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    } else if (status === "IN_PROGRESS" || status === "in_progress") {
      colors = "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    } else if (status === "NOT_STARTED" || status === "not_started") {
      colors = "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    }
    return (
      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${colors}`}>
        {label}
      </span>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="bg-card/80 backdrop-blur-sm border-b border-border px-8 py-6">
          <h1 className="text-2xl font-bold">Compliance Frameworks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and track your compliance frameworks
          </p>
        </div>
        <div className="p-8 flex items-center justify-center">
          <div className="text-muted-foreground">Loading frameworks...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header Bar */}
      <div className="bg-card/80 backdrop-blur-sm border-b border-border px-8 py-6">
        <div>
          <h1 className="text-2xl font-bold">Compliance Frameworks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and track your compliance frameworks
          </p>
        </div>
      </div>

      <div className="p-8 space-y-8">
        {/* Active Frameworks */}
        {activeFrameworks.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Active Frameworks
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeFrameworks.map((fw) => (
                <div
                  key={fw.id}
                  className="bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start gap-4 mb-4">
                    <div className="bg-blue-600/10 w-12 h-12 rounded-lg flex items-center justify-center shrink-0">
                      <Shield className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm">
                        {fw.type.replace(/_/g, " ")}
                      </h3>
                      <div className="mt-1">
                        {statusBadge(fw.status)}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Progress</span>
                      <span className="text-sm font-medium">{fw.score}%</span>
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

        {/* Available Frameworks */}
        {availableToAdd.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Available Frameworks
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableToAdd.map((f) => (
                <div
                  key={f.type}
                  className="bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-shadow group"
                >
                  <div className="bg-blue-600/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                    <Shield className="w-5 h-5 text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-sm mb-1">{f.name}</h3>
                  <p className="text-xs text-muted-foreground mb-4">{f.desc}</p>
                  <button
                    onClick={() => handleAddFramework(f.type)}
                    disabled={addingType === f.type}
                    className="w-full py-2 border border-border rounded-lg text-sm font-medium transition-colors group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {addingType === f.type ? "Adding..." : "Add framework"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeFrameworks.length === 0 && availableToAdd.length === 0 && (
          <div className="text-center text-muted-foreground py-12">
            All frameworks have been added.
          </div>
        )}
      </div>
    </div>
  );
}
