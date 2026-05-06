"use client";

import { usePathname } from "next/navigation";
import { useScanContext } from "../contexts/ScanContext";
import { X, ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";

export function FloatingScanWidget() {
  const pathname = usePathname();
  const { activeScan, needsClarification } = useScanContext();
  const [dismissed, setDismissed] = useState(false);

  // Only show if not on /scan page and there's an active scan
  const isOnScanPage = pathname === "/scan";
  if (isOnScanPage || !activeScan || dismissed) {
    return null;
  }

  const statusColors: Record<string, string> = {
    QUEUED: "text-blue-400",
    RUNNING: "text-blue-400",
    COMPLETED: "text-green-400",
    FAILED: "text-red-400",
    AWAITING_CLARIFICATION: "text-yellow-400",
  };

  const statusLabel: Record<string, string> = {
    QUEUED: "Queued",
    RUNNING: "Running",
    COMPLETED: "Completed",
    FAILED: "Failed",
    AWAITING_CLARIFICATION: "⏸ Waiting for answer",
  };

  const statusColor = statusColors[activeScan.status] || "text-muted-foreground";
  const status = statusLabel[activeScan.status] || activeScan.status;

  // Calculate progress percentage (rough estimate based on status)
  const progressPercent = {
    QUEUED: 10,
    RUNNING: 50,
    COMPLETED: 100,
    FAILED: 0,
    AWAITING_CLARIFICATION: 50,
  }[activeScan.status] || 0;

  return (
    <div className="fixed bottom-6 right-6 z-40 max-w-xs">
      <div className="bg-card border border-border rounded-lg shadow-lg overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-muted relative overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              activeScan.status === "COMPLETED"
                ? "bg-green-600"
                : activeScan.status === "FAILED"
                  ? "bg-red-600"
                  : activeScan.status === "AWAITING_CLARIFICATION"
                    ? "bg-yellow-600"
                    : "bg-blue-600"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {activeScan.frameworkType.replace(/_/g, " ")}
              </p>
              <p className={`text-xs mt-1 flex items-center gap-1 ${statusColor}`}>
                {activeScan.status === "RUNNING" && (
                  <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                )}
                {status}
              </p>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-muted-foreground hover:text-foreground ml-2 flex-shrink-0"
              aria-label="Dismiss floating widget"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Action */}
          {needsClarification ? (
            <a
              href={`/scan?scanId=${activeScan.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-yellow-600/20 text-yellow-400 rounded hover:bg-yellow-600/30 transition-colors"
            >
              Answer question
              <ChevronRight className="w-3 h-3" />
            </a>
          ) : activeScan.status === "COMPLETED" ? (
            <a
              href={`/scans/${activeScan.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600/20 text-green-400 rounded hover:bg-green-600/30 transition-colors"
            >
              View results
              <ChevronRight className="w-3 h-3" />
            </a>
          ) : (
            <a
              href="/scan"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600/20 text-blue-400 rounded hover:bg-blue-600/30 transition-colors"
            >
              View scan
              <ChevronRight className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}