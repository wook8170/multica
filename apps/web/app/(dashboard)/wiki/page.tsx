"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
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

function WikiPageContent() {
  const searchParams = useSearchParams();
  const initialId = searchParams.get("id") || null;
  return (
    <div className="flex h-full w-full flex-1">
      <WikiView initialSelectedId={initialId} />
    </div>
  );
}

export default function WikiPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
        </div>
      }
    >
      <WikiPageContent />
    </Suspense>
  );
}
