"use client";

import { useQuery } from "@tanstack/react-query";
import { History, X, Clock, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import { api } from "@multica/core/api";
import { cn } from "@multica/ui/lib/utils";
import { useWikiStore } from "../store";
import { ActorAvatar } from "@multica/views/common/actor-avatar";

export function WikiHistorySidebar({ wikiId, onRestore }: { wikiId: string; onRestore?: (version: any) => void }) {
  const { isHistoryOpen, setIsHistoryOpen, viewingVersionId, setViewingVersionId } = useWikiStore();

  const { data: history = [], isLoading } = useQuery({
    queryKey: ["wiki-history", wikiId],
    queryFn: () => api.getWikiHistory(wikiId),
    enabled: !!wikiId && isHistoryOpen,
  });

  if (!isHistoryOpen) return null;

  return (
    <div className="flex h-full w-72 flex-col border-l bg-background">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b px-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <History className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h2 className="text-xs font-semibold tracking-tight text-foreground truncate">Version History</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
          onClick={() => setIsHistoryOpen(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-2 px-2 scrollbar-hide">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 opacity-40">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs font-medium">Loading...</span>
          </div>
        ) : (history?.length ?? 0) === 0 ? (
          <div className="text-center py-12 space-y-2 opacity-50">
            <Clock className="mx-auto h-6 w-6 text-muted-foreground/40" />
            <p className="text-xs font-medium text-muted-foreground">No versions yet</p>
          </div>
        ) : (
          <div className="space-y-1">
            {history?.map((version: any) => {
              const isSelected = viewingVersionId === version.id;
              return (
                <div
                  key={version.id}
                  onClick={() => setViewingVersionId(isSelected ? null : version.id)}
                  className={cn(
                    "group relative flex flex-col gap-1.5 p-2 rounded-md cursor-pointer transition-colors",
                    isSelected
                      ? "bg-primary/10"
                      : "hover:bg-muted"
                  )}
                >
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <h3 className={cn(
                      "text-xs font-semibold truncate leading-tight",
                      isSelected ? "text-primary" : "text-foreground/80"
                    )}>
                      v{version.version_number}
                    </h3>
                    <span className="shrink-0 text-[10px] text-muted-foreground/60 font-medium">
                      {new Date(version.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground/70 line-clamp-2 leading-snug">
                    {version.title || "Untitled"}
                  </p>

                  {isSelected && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRestore?.(version);
                      }}
                      className="h-6 px-2 text-xs font-medium mt-1 w-full"
                    >
                      <ArrowLeft className="mr-1 h-3 w-3" />
                      Restore this version
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
