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
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

interface ScanResult {
  score: number;
  riskLevel: string;
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

  const scanId = searchParams.get("scanId");
  const pendingQuestion = searchParams.get("question");

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [clarificationSubmitted, setClarificationSubmitted] = useState(false);
  const [scanPollStatus, setScanPollStatus] = useState<ScanPollStatus>("idle");
  const [scanScore, setScanScore] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const askedQuestionRef = useRef<string | null>(null);

  // Scroll to bottom helper
  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  // Initialize with scan clarification context if present
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (scanId && pendingQuestion) {
      askedQuestionRef.current = pendingQuestion;
      setMessages([
        {
          role: "assistant",
          content: `I'm running a compliance scan and need a bit more information to evaluate one of the controls accurately.\n\n**${pendingQuestion}**\n\nPlease provide your answer below and I'll resume the scan automatically.`,
          type: "clarification",
        },
      ]);
    }
  }, [scanId, pendingQuestion]);

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
              content: `Redirecting you to your results in 3 seconds — [click here to go now](/scan).`,
              type: "scan-status",
              scanResult: {
                score: data.score ?? 0,
                riskLevel: data.riskLevel ?? "UNKNOWN",
              },
            },
          ]);
          scrollToBottom();
          setTimeout(() => router.push("/scan"), 3000);
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
            content: "The scan has already completed — your answer wasn't needed after all! Redirecting you to your results in 30 seconds...\n\n[Click here to go now](/scan).",
            type: "scan-status",
          },
        ]);
        setTimeout(() => router.push("/scan"), 30000);
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

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: "user", content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    const currentInput = input;
    setInput("");
    setLoading(true);

    // If we're in clarification mode and haven't submitted yet, send the answer to the scan engine
    if (scanId && !clarificationSubmitted) {
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
            {isInScanMode && (
              <button
                onClick={() => router.push("/scan")}
                className="p-2 rounded-lg hover:bg-accent transition-colors"
                title="Back to Scan"
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
            onClick={() => router.push("/scan")}
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
            onClick={() => router.push("/scan")}
            className="text-sm text-red-400 hover:text-red-300 font-medium transition-colors"
          >
            Go to Scan Page &rarr;
          </button>
        </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto bg-gradient-to-br from-blue-50/30 via-background to-purple-50/20 dark:from-blue-950/10 dark:via-background dark:to-purple-950/5 px-8 py-6 space-y-6">
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
                        <p className="text-sm text-muted-foreground">Your compliance assessment is ready</p>
                      </div>
                      <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
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

                    <p className="text-xs text-muted-foreground mt-4">
                      View full results, download PDF reports, and see your remediation roadmap on the scan page.
                    </p>
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
      <div className="border-t border-border bg-card p-6">
        {isInScanMode && !clarificationSubmitted && (
          <div className="text-xs text-yellow-500 mb-2 px-1">
            Answer the question above to resume your scan
          </div>
        )}
        <div className="bg-background border border-border rounded-2xl p-3 focus-within:ring-2 focus-within:ring-blue-600/20 transition-all">
          <div className="flex items-end gap-2">
            <button className="p-2 rounded-lg hover:bg-accent transition-colors flex-shrink-0">
              <Paperclip className="w-5 h-5 text-muted-foreground" />
            </button>
            <textarea
              className="flex-1 bg-transparent text-foreground placeholder-muted-foreground text-sm resize-none focus:outline-none min-h-[24px] max-h-[120px] py-1.5"
              placeholder={
                isInScanMode && !clarificationSubmitted
                  ? "Type your answer here..."
                  : "Ask about GDPR, EU AI Act, ISO 27001..."
              }
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              disabled={loading}
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
