"use client";

import { Suspense } from "react";
import ScanRunner from "./ScanRunner";

export default function ScanPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="text-muted-foreground">Loading...</div></div>}>
      <ScanRunner />
    </Suspense>
  );
}
