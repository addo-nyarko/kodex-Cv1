"use client";

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";

type ScanResult = {
  id: string;
  status: string;
  score: number | null;
  riskLevel: string | null;
  frameworkType: string;
  pendingQuestion: string | null;
  pendingControlCode: string | null;
  errorMessage: string | null;
  controlResults: any[];
  report: any | null;
  shadowPass: any | null;
};

type ScanContextType = {
  activeScan: ScanResult | null;
  needsClarification: boolean;
  clarificationQuestion: string | null;
  clarificationControlCode: string | null;
  isPolling: boolean;
  setActiveScan: (scan: ScanResult) => void;
  clearActiveScan: () => void;
};

const ScanContext = createContext<ScanContextType | undefined>(undefined);

export function ScanProvider({ children }: { children: React.ReactNode }) {
  const [activeScan, setActiveScan] = useState<ScanResult | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Hydrate from sessionStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = sessionStorage.getItem("activeScan");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setActiveScan(parsed);
      } catch (e) {
        sessionStorage.removeItem("activeScan");
      }
    }
  }, []);

  // Poll scan status every 5s when scan is active and not already completed
  const pollScan = useCallback(async () => {
    if (!activeScan || !["QUEUED", "RUNNING", "AWAITING_CLARIFICATION"].includes(activeScan.status)) {
      return;
    }

    try {
      const res = await fetch(`/api/scan/${activeScan.id}`);
      if (!res.ok) return;
      const updated = await res.json();
      setActiveScan(updated);
      sessionStorage.setItem("activeScan", JSON.stringify(updated));

      // Clear if completed
      if (updated.status === "COMPLETED" || updated.status === "FAILED") {
        setIsPolling(false);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    } catch (e) {
      // Keep polling on network errors
    }
  }, [activeScan]);

  // Set up polling when scan is active
  useEffect(() => {
    if (!activeScan || !["QUEUED", "RUNNING", "AWAITING_CLARIFICATION"].includes(activeScan.status)) {
      setIsPolling(false);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    setIsPolling(true);
    pollRef.current = setInterval(pollScan, 5000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeScan, pollScan]);

  const setActiveScanState = useCallback((scan: ScanResult) => {
    setActiveScan(scan);
    sessionStorage.setItem("activeScan", JSON.stringify(scan));
  }, []);

  const clearActiveScan = useCallback(() => {
    setActiveScan(null);
    sessionStorage.removeItem("activeScan");
    setIsPolling(false);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const needsClarification = activeScan?.status === "AWAITING_CLARIFICATION";
  const clarificationQuestion = activeScan?.pendingQuestion ?? null;
  const clarificationControlCode = activeScan?.pendingControlCode ?? null;

  const value: ScanContextType = {
    activeScan,
    needsClarification,
    clarificationQuestion,
    clarificationControlCode,
    isPolling,
    setActiveScan: setActiveScanState,
    clearActiveScan,
  };

  return (
    <ScanContext.Provider value={value}>
      {children}
    </ScanContext.Provider>
  );
}

export function useScanContext() {
  const context = useContext(ScanContext);
  if (context === undefined) {
    throw new Error("useScanContext must be used within a ScanProvider");
  }
  return context;
}