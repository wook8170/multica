"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const WikiView = dynamic(() => import("@/features/wiki/components/WikiView").then(m => ({ default: m.WikiView })), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
    </div>
  ),
});

export default function WikiPage() {
  return (
    <div className="flex h-full w-full flex-1">
      <WikiView />
    </div>
  );
}
