"use client";

import { Suspense } from "react";
import ChatAssistant from "./ChatAssistant";

export default function AIAssistantPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full">
          <div className="text-muted-foreground text-sm">Loading assistant...</div>
        </div>
      }
    >
      <ChatAssistant />
    </Suspense>
  );
}
