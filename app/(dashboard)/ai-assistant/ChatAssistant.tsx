"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Bot,
  User,
  Send,
  Paperclip,
  Smile,
  MoreVertical,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  ExternalLink,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useScanContext } from "../contexts/ScanContext";

interface ScanResult {
  score: number;
  riskLevel: string;
  framework?: string;
  controlCounts?: {
    passed: number;
    failed: number;
    noEvidence: number;
  };
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  type?: "clarification" | "scan-status" | "normal";
  scanResult?: ScanResult;
}

type ScanPollStatus = "idle" | "polling" | "completed" | "failed";

export default function ChatAssistant() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { activeScan, needsClarification, clearActiveScan, setActiveScan } = useScanContext();

  const scanId = searchParams.get("scanId") || activeScan?.id;
  const pendingQuestion = searchParams.get("question") || activeScan?.pendingQuestion;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [clarificationSubmitted, setClarificationSubmitted] = useState(false);
  const [scanPollStatus, setScanPollStatus] = useState<ScanPollStatus>("idle");
  const [scanScore, setScanScore] = useState<number | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [lastEventTime, setLastEventTime] = useState<number>(Date.now());
  const [conversationMode, setConversationMode] = useState(false);
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const [clarificationError, setClarificationError] = useState<string | null>(null);
  const [showClarificationSkip, setShowClarificationSkip] = useState(false);
  const [submittingClarification, setSubmittingClarification] = useState(false);
  const [showFrameworkSelector, setShowFrameworkSelector] = useState(false);
  const [availableFrameworks, setAvailableFrameworks] = useState<any[]>([]);
  const [selectingFramework, setSelectingFramework] = useState(false);
  const clarificationTextareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const askedQuestionRef = useRef<string | null>(null);
  const eventsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMessageTimeRef = useRef<number>(Date.now());
  const clarificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clarificationQuestionTimeRef = useRef<number>(Date.now());
  const completionHandledRef = useRef(false);

  // Scroll to bottom helper
  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  // Scroll events to bottom
  const scrollEventsToBottom = useCallback(() => {
    setTimeout(() => eventsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  // Poll for events when scan is active and running
  useEffect(() => {
    if (!activeScan || !["QUEUED", "RUNNING"].includes(activeScan.status)) {
      if (eventsPollRef.current) clearInterval(eventsPollRef.current);
      return;
    }

    const pollEvents = async () => {
      try {
        const res = await fetch(`/api/scan/${activeScan.id}/events?limit=8`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.events && data.events.length > 0) {
          setEvents(data.events);
          setLastEventTime(Date.now());
          scrollEventsToBottom();
        }
      } catch {
        // Keep polling on network errors
      }
    };

    pollEvents();
    eventsPollRef.current = setInterval(pollEvents, 3000);

    return () => {
      if (eventsPollRef.current) clearInterval(eventsPollRef.current);
    };
  }, [activeScan?.id, activeScan?.status, scrollEventsToBottom]);

  // Handle conversation mode idle timeout
  useEffect(() => {
    if (!conversationMode) return;

    const resetTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        // If no messages sent in last 30s and feed is still active, collapse it
        if (Date.now() - lastMessageTimeRef.current > 30000) {
          setConversationMode(false);
        }
      }, 10000);
    };

    resetTimer();

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [conversationMode]);

  // Handle clarification question timing (show Skip after 30s)
  useEffect(() => {
    if (!needsClarification) {
      setShowClarificationSkip(false);
      if (clarificationTimerRef.current) clearTimeout(clarificationTimerRef.current);
      return;
    }

    clarificationQuestionTimeRef.current = Date.now();
    setClarificationAnswer("");
    setClarificationError(null);
    setShowClarificationSkip(false);

    // Auto-focus clarification textarea
    setTimeout(() => clarificationTextareaRef.current?.focus(), 100);

    if (clarificationTimerRef.current) clearTimeout(clarificationTimerRef.current);
    clarificationTimerRef.current = setTimeout(() => {
      setShowClarificationSkip(true);
    }, 30000);

    return () => {
      if (clarificationTimerRef.current) clearTimeout(clarificationTimerRef.current);
    };
  }, [needsClarification]);

  // Initialize with scan clarification context if present
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    // Load scan from URL on mount
    if (scanId && !activeScan) {
      fetch(`/api/scan/${scanId}`)
        .then((res) => res.json())
        .then((data) => {
          setActiveScan(data);
          if (data.status === "AWAITING_CLARIFICATION" && data.pendingQuestion) {
            askedQuestionRef.current = data.pendingQuestion;
            setMessages([
              {
                role: "assistant",
                content: `I'm running a compliance scan and need a bit more information to evaluate one of the controls accurately.\n\n**${data.pendingQuestion}**\n\nPlease provide your answer below and I'll resume the scan automatically.`,
                type: "clarification",
              },
            ]);
          }
        })
        .catch(() => {});
    } else if (scanId && pendingQuestion) {
      askedQuestionRef.current = pendingQuestion;
      setMessages([
        {
          role: "assistant",
          content: `I'm running a compliance scan and need a bit more information to evaluate one of the controls accurately.\n\n**${pendingQuestion}**\n\nPlease provide your answer below and I'll resume the scan automatically.`,
          type: "clarification",
        },
      ]);
    }
  }, [scanId, pendingQuestion, activeScan, setActiveScan]);

  // Reset tracking when scanId changes (new scan)
  useEffect(() => {
    askedQuestionRef.current = null;
    completionHandledRef.current = false;
  }, [scanId]);

  // Handle scan completion from context
  useEffect(() => {
    if (!activeScan || activeScan.status !== "COMPLETED" || completionHandledRef.current) {
      return;
    }

    completionHandledRef.current = true;

    const handleCompletion = async () => {
      // Wait 1s before showing result card
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Count control results
      const controlCounts = {
        passed: 0,
        failed: 0,
        noEvidence: 0,
      };

      if (activeScan.controlResults && Array.isArray(activeScan.controlResults)) {
        activeScan.controlResults.forEach((control: any) => {
          if (control.result === "PASS") controlCounts.passed++;
          else if (control.result === "FAIL") controlCounts.failed++;
          else if (control.result === "NO_EVIDENCE") controlCounts.noEvidence++;
        });
      }

      // Add result card as AI message
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Your ${activeScan.frameworkType.replace(/_/g, " ")} compliance scan is complete! Here's your assessment:`,
          type: "scan-status",
          scanResult: {
            score: activeScan.score ?? 0,
            riskLevel: activeScan.riskLevel ?? "UNKNOWN",
            framework: activeScan.frameworkType,
            controlCounts,
          },
        },
      ]);

      scrollToBottom();

      // Add follow-up message after 1.5s
      setTimeout(() => {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: "Would you like me to explain any of the failed controls or help you improve your compliance score?",
            type: "normal",
          },
        ]);
        scrollToBottom();

        // Clear the active scan after adding follow-up
        clearActiveScan();
      }, 1500);
    };

    handleCompletion();
  }, [activeScan?.status, activeScan?.id, scrollToBottom, clearActiveScan]);

  // Poll scan status after clarification is submitted
  useEffect(() => {
    if (scanPollStatus !== "polling" || !scanId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/scan/status/${scanId}`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === "COMPLETED") {
          setScanPollStatus("completed");
          setScanScore(data.score ?? null);
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: `Redirecting you to your results in 30 seconds — [click here to go now](/scans/${scanId}).`,
              type: "scan-status",
              scanResult: {
                score: data.score ?? 0,
                riskLevel: data.riskLevel ?? "UNKNOWN",
              },
            },
          ]);
          scrollToBottom();
          clearInterval(interval);
        } else if (data.status === "FAILED") {
          setScanPollStatus("failed");
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: `Something went wrong while resuming the scan: ${data.errorMessage || "Unknown error"}. You can try running the scan again from the Scan page.`,
              type: "scan-status",
            },
          ]);
          scrollToBottom();
          clearInterval(interval);
        }
        // AWAITING_CLARIFICATION again means another question — but we handle that below
        else if (data.status === "AWAITING_CLARIFICATION" && data.pendingQuestion) {
          // Only add the question if we haven't already shown it
          if (askedQuestionRef.current !== data.pendingQuestion) {
            askedQuestionRef.current = data.pendingQuestion;
            setScanPollStatus("idle");
            setClarificationSubmitted(false);
            setMessages((m) => [
              ...m,
              {
                role: "assistant",
                content: `I have another question to continue the scan:\n\n**${data.pendingQuestion}**\n\nPlease answer below and I'll keep going.`,
                type: "clarification",
              },
            ]);
            scrollToBottom();
          }
          clearInterval(interval);
        }
      } catch {
        // keep polling
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [scanPollStatus, scanId, scrollToBottom]);

  // Detect if a message is likely a real answer or just conversation
  function isLikelyAnswer(message: string): boolean {
    const conversationalPhrases = [
      "come again", "what", "huh", "repeat", "can you", "pardon",
      "sorry", "ok", "okay", "thanks", "thank you", "hi", "hello",
      "hmm", "yes please", "no problem", "sure", "got it", "gotcha",
      "i see", "yeah", "yep", "nope", "maybe", "idk", "i don't know"
    ];

    const lower = message.toLowerCase().trim();

    // Very short messages that are purely conversational
    if (conversationalPhrases.some(phrase => lower.includes(phrase) && message.length < 50)) {
      return false;
    }

    // Very short responses without substance are not answers
    if (message.trim().length < 3) {
      return false;
    }

    // If it's a question or looks confused, not an answer
    if (message.includes("?") && message.length < 50) {
      return false;
    }

    return true;
  }

  // Detect scan intent from user message
  function detectScanIntent(message: string): boolean {
    const keywords = ["scan", "audit", "check compliance", "run a scan", "gdpr scan", "eu ai act", "check my project"];
    const lower = message.toLowerCase();
    return keywords.some(keyword => lower.includes(keyword));
  }

  // Submit clarification answer
  async function submitClarificationAnswer(answer: string, skipQuestion: boolean = false) {
    if (!scanId || !answer.trim()) return;

    // Validate answer is likely a real answer (unless skipping)
    if (!skipQuestion && !isLikelyAnswer(answer)) {
      setClarificationError(
        "That doesn't look like a compliance answer. Please describe what your system actually does."
      );
      return;
    }

    setSubmittingClarification(true);
    try {
      const res = await fetch(`/api/scan/${scanId}/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: skipQuestion ? "" : answer }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to submit" }));
        setClarificationError(data.error || "Failed to submit clarification");
        setSubmittingClarification(false);
        return;
      }

      // Success — clear form and resume polling
      setClarificationAnswer("");
      setClarificationError(null);
      setSubmittingClarification(false);
      setScanPollStatus("polling");

      // AI message about resuming
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: skipQuestion
            ? `Skipped that question. Resuming your scan...\n\n${events[events.length - 1] || "Scanning..."}`
            : `Got it — resuming your scan.\n\n${events[events.length - 1] || "Scanning..."}`,
          type: "scan-status",
        },
      ]);

      scrollToBottom();
    } catch (e) {
      setClarificationError(e instanceof Error ? e.message : "Failed to submit");
      setSubmittingClarification(false);
    }
  }

  // Submit clarification answer to the scan engine
  async function submitClarification(answer: string) {
    if (!scanId) return false;
    try {
      const res = await fetch(`/api/scan/${scanId}/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });
      const data = await res.json();

      // Check if scan already completed (race condition)
      if (data.alreadyCompleted) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: `The scan has already completed — your answer wasn't needed after all! Redirecting you to your results in 30 seconds...\n\n[Click here to go now](/scans/${scanId}).`,
            type: "scan-status",
          },
        ]);
        return true;
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit clarification");
      }
      return true;
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `I couldn't submit that answer: ${err instanceof Error ? err.message : "Unknown error"}. Please try again.`,
          type: "scan-status",
        },
      ]);
      return false;
    }
  }

  async function selectFramework(frameworkId: string) {
    if (selectingFramework) return;
    setSelectingFramework(true);

    try {
      const projectId = searchParams.get("projectId");
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frameworkId,
          ...(projectId ? { projectId } : {}),
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to start scan");
      }

      const { scanId: newScanId } = await res.json();

      // Fetch the scan details
      const scanRes = await fetch(`/api/scan/${newScanId}`);
      if (!scanRes.ok) throw new Error("Failed to fetch scan details");
      const scanData = await scanRes.json();

      // Set activeScan in context
      setActiveScan(scanData);

      // Find framework name
      const selectedFramework = availableFrameworks.find((f) => f.id === frameworkId);
      const frameworkName = selectedFramework?.type.replace(/_/g, " ") || "compliance";

      // Add message about starting scan
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Starting your ${frameworkName} scan. Watch the feed below — I'll flag anything important.`,
          type: "scan-status",
        },
      ]);

      setShowFrameworkSelector(false);
      scrollToBottom();
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `I couldn't start the scan: ${e instanceof Error ? e.message : "Unknown error"}. Please try again from the Scan page.`,
          type: "normal",
        },
      ]);
      setShowFrameworkSelector(false);
    }

    setSelectingFramework(false);
  }

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: "user", content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    const currentInput = input;
    setInput("");
    setLoading(true);
    lastMessageTimeRef.current = Date.now();

    // If we're in clarification mode and haven't submitted yet, check intent
    if (scanId && !clarificationSubmitted) {
      // Check if this looks like a real answer or just conversation
      if (!isLikelyAnswer(currentInput)) {
        // It's conversational — send to chat API for a response that rephrases the question
        try {
          const res = await fetch("/api/ai/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: newMessages.filter((m) => m.role !== "system").map((m) => ({
                role: m.role,
                content: m.content,
              })),
              scanId,
            }),
          });

          const reader = res.body?.getReader();
          const decoder = new TextDecoder();
          let assistantText = "";

          setMessages((m) => [...m, { role: "assistant", content: "" }]);

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              assistantText += decoder.decode(value, { stream: true });
              setMessages((m) => [
                ...m.slice(0, -1),
                { role: "assistant", content: assistantText },
              ]);
            }
          }
        } catch {
          setMessages((m) => [
            ...m,
            { role: "assistant", content: "Sorry, I had trouble connecting. Please try again." },
          ]);
        }
        setLoading(false);
        scrollToBottom();
        return;
      }

      // It looks like a real answer — submit to the scan engine
      const success = await submitClarification(currentInput);
      if (success) {
        setClarificationSubmitted(true);
        setScanPollStatus("polling");
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: "Thanks! I've recorded your answer and resumed the scan. I'll let you know when it's done -- this usually takes a minute or two.",
            type: "scan-status",
          },
        ]);
        setLoading(false);
        scrollToBottom();
        return;
      }
      setLoading(false);
      return;
    }

    // Check for scan intent (only if no active scan)
    if (detectScanIntent(currentInput) && !activeScan) {
      // Fetch available frameworks
      try {
        const projectId = searchParams.get("projectId");
        const frameworkRes = await fetch(`/api/frameworks${projectId ? `?projectId=${projectId}` : ""}`);
        if (!frameworkRes.ok) throw new Error("Failed to fetch frameworks");
        const { frameworks } = await frameworkRes.json();

        if (frameworks && frameworks.length > 0) {
          setAvailableFrameworks(frameworks);
          setShowFrameworkSelector(true);

          // Add AI message about running a scan
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: "I can run a compliance scan for you.\n\nWhich framework would you like to check?",
              type: "normal",
            },
          ]);

          scrollToBottom();
          setLoading(false);
          return;
        }
      } catch (e) {
        // Fall through to normal chat if framework fetch fails
      }
    }

    // If already have an active scan and user mentions scan
    if (detectScanIntent(currentInput) && activeScan) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `You already have a ${activeScan.frameworkType.replace(/_/g, " ")} scan running.\n\nWant to wait for it to finish or view the current progress?`,
          type: "normal",
        },
      ]);
      setLoading(false);
      scrollToBottom();
      return;
    }

    // Normal AI chat flow
    const chatMessages = newMessages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatMessages,
          scanId: scanId || undefined,
        }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      setMessages((m) => [...m, { role: "assistant", content: "" }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          assistantText += decoder.decode(value, { stream: true });
          setMessages((m) => [
            ...m.slice(0, -1),
            { role: "assistant", content: assistantText },
          ]);
        }
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Sorry, I had trouble connecting. Please try again." },
      ]);
    }

    setLoading(false);
    scrollToBottom();
  }

  const isInScanMode = !!scanId;
  const isWaitingForScan = scanPollStatus === "polling";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-sm border-b border-border px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {isInScanMode && scanId && (
              <button
                onClick={() => router.push(`/scans/${scanId}`)}
                className="p-2 rounded-lg hover:bg-accent transition-colors"
                title="Back to Scan Results"
              >
                <ArrowLeft className="w-5 h-5 text-muted-foreground" />
              </button>
            )}
            <div className="bg-gradient-to-br from-blue-600 to-purple-600 rounded-full p-2">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">AI Compliance Assistant</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {isInScanMode
                  ? isWaitingForScan
                    ? "Scan in progress..."
                    : scanPollStatus === "completed"
                      ? "Scan complete"
                      : "Scan clarification needed"
                  : "Always here to help"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button className="p-2 rounded-lg hover:bg-accent transition-colors">
              <MoreVertical className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </header>

      {/* Scan status banner */}
      {isInScanMode && isWaitingForScan && (
        <div className="bg-blue-600/10 border-b border-blue-600/20 px-8 py-3 flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
          <span className="text-sm text-blue-400">
            Scan is resuming with your answer... I'll update you when it's done.
          </span>
        </div>
      )}
      {isInScanMode && scanPollStatus === "completed" && (
        <div className="bg-green-600/10 border-b border-green-600/20 px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span className="text-sm text-green-400">
              Scan complete{scanScore !== null ? ` — ${scanScore}% compliance` : ""}
            </span>
          </div>
          <button
            onClick={() => scanId && router.push(`/scans/${scanId}`)}
            className="text-sm text-green-400 hover:text-green-300 font-medium transition-colors"
          >
            View Full Results &rarr;
          </button>
        </div>
      )}
      {isInScanMode && scanPollStatus === "failed" && (
        <div className="bg-red-600/10 border-b border-red-600/20 px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span className="text-sm text-red-400">Scan encountered an error</span>
          </div>
          <button
            onClick={() => scanId && router.push(`/scans/${scanId}`)}
            className="text-sm text-red-400 hover:text-red-300 font-medium transition-colors"
          >
            Go to Results &rarr;
          </button>
        </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto bg-gradient-to-br from-blue-50/30 via-background to-purple-50/20 dark:from-blue-950/10 dark:via-background dark:to-purple-950/5 px-8 py-6 space-y-6">
        {/* Verbose Event Feed */}
        {activeScan && ["QUEUED", "RUNNING", "COMPLETED"].includes(activeScan.status) && (
          <div
            className={`mb-8 transition-all duration-200 overflow-hidden ${
              conversationMode && activeScan.status !== "COMPLETED" ? "max-h-12" : "max-h-96"
            }`}
            style={{ opacity: conversationMode && activeScan.status !== "COMPLETED" ? 0.7 : 1 }}
          >
            {/* Header */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className={`${conversationMode && activeScan.status !== "COMPLETED" ? "text-xs" : "text-sm"} font-semibold text-foreground transition-all`}>
                  {activeScan.frameworkType.replace(/_/g, " ")} Scan · {activeScan.status === "COMPLETED" ? "Complete" : activeScan.status === "RUNNING" ? "Running" : "Queued"}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {activeScan.score !== null ? `${activeScan.score}%` : "—"}
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    activeScan.status === "COMPLETED" ? "bg-green-600" : "bg-blue-600"
                  }`}
                  style={{
                    width: `${
                      activeScan.status === "COMPLETED"
                        ? "100%"
                        : activeScan.status === "QUEUED"
                          ? "10%"
                          : activeScan.score !== null
                            ? `${Math.min(activeScan.score, 95)}%`
                            : "45%"
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* Collapsed thin bar view */}
            {conversationMode && activeScan.status !== "COMPLETED" && events.length > 0 && (
              <div className="text-xs text-muted-foreground font-mono truncate">
                <span className="text-muted-foreground/60">[Last event]</span>
                <span className="mx-1">·</span>
                <span>{events[events.length - 1]}</span>
              </div>
            )}

            {/* Event Feed (expanded) */}
            {(!conversationMode || activeScan.status === "COMPLETED") && (
              <div className="bg-card border border-border rounded-xl p-4 max-h-64 overflow-y-auto space-y-1">
                {events.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic">
                    Initializing scan...
                  </div>
                ) : (
                  <>
                    {events.map((event, idx) => {
                      // Opacity fade: brightest at bottom
                      const opacityLevels = [0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 0.95, 1.0];
                      const opacity = opacityLevels[Math.min(idx, opacityLevels.length - 1)];

                      // Try to extract timestamp from event if it starts with HH:MM:SS
                      const timeMatch = event.match(/^(\d{2}:\d{2}:\d{2})\s*·\s*(.*)$/);
                      const displayEvent = timeMatch ? timeMatch[2] : event;
                      const timestamp = timeMatch ? timeMatch[1] : null;

                      // If no timestamp, generate one (use event index for rough time)
                      const finalTimestamp = timestamp || new Date().toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                      });

                      return (
                        <div
                          key={idx}
                          className="text-xs text-foreground/80 font-mono transition-opacity"
                          style={{ opacity }}
                        >
                          <span className="text-muted-foreground">{finalTimestamp}</span>
                          <span className="text-muted-foreground mx-1">·</span>
                          <span>{displayEvent}</span>
                        </div>
                      );
                    })}

                    {/* Pulsing indicator if no new events for 10s */}
                    {Date.now() - lastEventTime > 10000 && (
                      <div className="text-xs text-muted-foreground animate-pulse mt-2">
                        Waiting for next update...
                      </div>
                    )}

                    <div ref={eventsEndRef} />
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="bg-gradient-to-br from-blue-600 to-purple-600 rounded-full p-4 w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <Bot className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">How can I help you today?</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                Ask me anything about EU compliance -- GDPR, EU AI Act, ISO 27001, and more.
                I can also help you run scans, answer clarification questions, and generate reports.
              </p>

              {/* Quick action suggestions */}
              <div className="mt-6 flex flex-wrap gap-2 justify-center max-w-lg">
                {[
                  "Run a compliance scan",
                  "What is GDPR Article 6?",
                  "How do I prepare for an audit?",
                  "Generate a privacy policy",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                    }}
                    className="px-4 py-2 bg-card border border-border rounded-full text-sm text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {/* Framework selector (shown after AI message about running scan) */}
        {showFrameworkSelector && availableFrameworks.length > 0 && (
          <div className="flex gap-2 flex-wrap justify-start">
            {availableFrameworks.map((fw) => (
              <button
                key={fw.id}
                onClick={() => selectFramework(fw.id)}
                disabled={selectingFramework}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors font-medium text-sm"
              >
                {fw.type.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && (
              <div className="flex-shrink-0 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full w-8 h-8 flex items-center justify-center mt-1">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}
            <div className="max-w-2xl">
              {m.type === "scan-status" && m.scanResult ? (
                <>
                  <div className="bg-gradient-to-br from-green-500/20 to-blue-500/20 border border-green-500/30 rounded-2xl rounded-bl-sm shadow-lg p-6 mb-3">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-foreground mb-1">Scan Complete!</h3>
                        <p className="text-sm text-muted-foreground">Your {m.scanResult.framework?.replace(/_/g, " ") || "compliance"} assessment is ready</p>
                      </div>
                      <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0" />
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="bg-card/50 rounded-lg p-3 border border-border">
                        <p className="text-xs text-muted-foreground mb-1">Compliance Score</p>
                        <p
                          className={`text-2xl font-bold ${
                            m.scanResult.score >= 80
                              ? "text-green-500"
                              : m.scanResult.score >= 50
                                ? "text-amber-500"
                                : "text-red-500"
                          }`}
                        >
                          {m.scanResult.score}%
                        </p>
                      </div>
                      <div className="bg-card/50 rounded-lg p-3 border border-border">
                        <p className="text-xs text-muted-foreground mb-1">Risk Level</p>
                        <p
                          className={`text-lg font-bold ${
                            m.scanResult.riskLevel === "LOW"
                              ? "text-green-500"
                              : m.scanResult.riskLevel === "MEDIUM"
                                ? "text-amber-500"
                                : "text-red-500"
                          }`}
                        >
                          {m.scanResult.riskLevel}
                        </p>
                      </div>
                    </div>

                    {m.scanResult.controlCounts && (
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="bg-card/50 rounded-lg p-3 border border-border">
                          <p className="text-xs text-muted-foreground mb-1">Passed</p>
                          <p className="text-lg font-bold text-green-500">{m.scanResult.controlCounts.passed}</p>
                        </div>
                        <div className="bg-card/50 rounded-lg p-3 border border-border">
                          <p className="text-xs text-muted-foreground mb-1">Failed</p>
                          <p className="text-lg font-bold text-red-500">{m.scanResult.controlCounts.failed}</p>
                        </div>
                        <div className="bg-card/50 rounded-lg p-3 border border-border">
                          <p className="text-xs text-muted-foreground mb-1">No Evidence</p>
                          <p className="text-lg font-bold text-amber-500">{m.scanResult.controlCounts.noEvidence}</p>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 mt-4">
                      {scanId && (
                        <>
                          <button
                            type="button"
                            onClick={() => router.push(`/scans/${scanId}`)}
                            title="View the complete scan results"
                            aria-label="View complete scan results and detailed controls"
                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-green-600/20 text-green-400 rounded-lg text-sm font-medium hover:bg-green-600/30 transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                            View Full Results
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const link = document.createElement("a");
                              link.href = `/api/scan/${scanId}/pdf`;
                              link.download = `scan-${scanId}.pdf`;
                              link.click();
                            }}
                            title="Download PDF report"
                            aria-label="Download scan report as PDF"
                            className="px-4 py-2 bg-blue-600/20 text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-600/30 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div
                    className="bg-blue-500/10 border border-blue-500/30 rounded-2xl rounded-bl-sm shadow-sm px-5 py-3 text-foreground text-sm"
                  >
                    {m.content ? renderMarkdown(m.content) : <span className="animate-pulse text-muted-foreground">●</span>}
                  </div>
                </>
              ) : (
                <div
                  className={`text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-blue-600 text-white rounded-2xl rounded-br-sm px-5 py-3"
                      : m.type === "clarification"
                        ? "bg-yellow-500/10 border border-yellow-500/30 rounded-2xl rounded-bl-sm shadow-sm px-5 py-3 text-foreground"
                        : "bg-card border border-border rounded-2xl rounded-bl-sm shadow-sm px-5 py-3 text-foreground"
                  }`}
                >
                  {m.content ? renderMarkdown(m.content) : <span className="animate-pulse text-muted-foreground">●</span>}
                </div>
              )}
            </div>
            {m.role === "user" && (
              <div className="flex-shrink-0 bg-blue-600 rounded-full w-8 h-8 flex items-center justify-center mt-1">
                <User className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-border bg-card p-6 space-y-4">
        {/* Clarification Card */}
        {needsClarification && scanId && (
          <div className="bg-yellow-950/30 border border-yellow-700/50 rounded-xl p-4 space-y-3">
            {/* Progress bar pulses amber */}
            <div className="w-full h-1 bg-yellow-900/30 rounded-full overflow-hidden">
              <div className="h-full bg-yellow-600 w-full animate-pulse" />
            </div>

            {/* Header */}
            <div className="flex items-start gap-2">
              <span className="text-sm text-yellow-400 font-medium">⏸ Scan paused</span>
              <span className="text-xs text-yellow-300">Needs your input</span>
            </div>

            {/* Question */}
            <div>
              <p className="text-xs text-yellow-300/70 uppercase tracking-wide mb-1">
                Control: {activeScan?.pendingControlCode || "—"}
              </p>
              <p className="text-sm text-foreground">
                {activeScan?.pendingQuestion}
              </p>
            </div>

            {/* Answer input */}
            <div>
              <textarea
                ref={clarificationTextareaRef}
                value={clarificationAnswer}
                onChange={(e) => {
                  setClarificationAnswer(e.target.value);
                  setClarificationError(null);
                }}
                placeholder="Type your answer here..."
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-yellow-600/30 resize-none"
                rows={3}
              />
            </div>

            {/* Error message */}
            {clarificationError && (
              <div className="text-xs text-yellow-300 bg-yellow-900/20 border border-yellow-700/30 rounded p-2">
                {clarificationError}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => submitClarificationAnswer(clarificationAnswer, false)}
                disabled={submittingClarification || !clarificationAnswer.trim()}
                className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg text-sm font-medium hover:bg-yellow-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {submittingClarification ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Answer"
                )}
              </button>

              {showClarificationSkip && (
                <button
                  type="button"
                  onClick={() => submitClarificationAnswer("", true)}
                  disabled={submittingClarification}
                  className="px-4 py-2 text-yellow-400 hover:text-yellow-300 text-sm font-medium transition-colors"
                >
                  Skip
                </button>
              )}
            </div>
          </div>
        )}

        {needsClarification && (
          <div className="text-xs text-amber-400/70 px-1">
            Your scan is paused. Answer the question above to continue.
          </div>
        )}
        {isInScanMode && !clarificationSubmitted && !needsClarification && (
          <div className="text-xs text-yellow-500 px-1">
            Answer the question above to resume your scan
          </div>
        )}
        <div className={`bg-background border border-border rounded-2xl p-3 focus-within:ring-2 focus-within:ring-blue-600/20 transition-all ${
          needsClarification ? "opacity-50 cursor-not-allowed" : ""
        }`}>
          <div className="flex items-end gap-2">
            <button className="p-2 rounded-lg hover:bg-accent transition-colors flex-shrink-0" disabled={needsClarification}>
              <Paperclip className="w-5 h-5 text-muted-foreground" />
            </button>
            <textarea
              className="flex-1 bg-transparent text-foreground placeholder-muted-foreground text-sm resize-none focus:outline-none min-h-[24px] max-h-[120px] py-1.5"
              placeholder={
                needsClarification
                  ? "Answer the scan question above first"
                  : isInScanMode && !clarificationSubmitted
                    ? "Type your answer here..."
                    : "Ask about GDPR, EU AI Act, ISO 27001..."
              }
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // Enter conversation mode when user starts typing (if scan is running)
                if (activeScan && ["QUEUED", "RUNNING"].includes(activeScan.status)) {
                  setConversationMode(true);
                }
              }}
              onFocus={() => {
                // Enter conversation mode when user focuses on input
                if (activeScan && ["QUEUED", "RUNNING"].includes(activeScan.status)) {
                  setConversationMode(true);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              disabled={loading || needsClarification}
            />
            <button className="p-2 rounded-lg hover:bg-accent transition-colors flex-shrink-0">
              <Smile className="w-5 h-5 text-muted-foreground" />
            </button>
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-500 disabled:opacity-50 transition-colors flex-shrink-0"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Simple inline markdown: bold, links, and line breaks */
function renderMarkdown(text: string) {
  // First split by links: [text](url)
  const linkParts = text.split(/(\[[^\]]+\]\([^\)]+\))/g);

  return (
    <>
      {linkParts.map((part, i) => {
        // Handle links
        if (part.startsWith("[") && part.includes("](")) {
          const match = part.match(/\[([^\]]+)\]\(([^\)]+)\)/);
          if (match) {
            const [, linkText, url] = match;
            return (
              <button
                key={i}
                onClick={() => {
                  if (url.startsWith("/")) {
                    window.location.href = url;
                  } else {
                    window.open(url, "_blank");
                  }
                }}
                className="text-blue-500 hover:text-blue-600 underline font-medium"
              >
                {linkText}
              </button>
            );
          }
        }

        // Handle bold and line breaks in non-link parts
        const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
        return (
          <span key={i}>
            {boldParts.map((boldPart, j) => {
              if (boldPart.startsWith("**") && boldPart.endsWith("**")) {
                return <strong key={j} className="font-semibold">{boldPart.slice(2, -2)}</strong>;
              }
              // Split by newlines to preserve line breaks
              return boldPart.split("\n").map((line, k, arr) => (
                <span key={`${j}-${k}`}>
                  {line}
                  {k < arr.length - 1 && <br />}
                </span>
              ));
            })}
          </span>
        );
      })}
    </>
  );
}
