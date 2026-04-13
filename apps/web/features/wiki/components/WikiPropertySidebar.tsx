"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, X, Clock, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import { api } from "@multica/core/api";
import { cn } from "@multica/ui/lib/utils";
import { useWikiStore } from "../store";
import { ActorAvatar } from "@multica/views/common/actor-avatar";
import { useActorName } from "@multica/core/workspace/hooks";

// ---------------------------------------------------------------------------
// PropRow — matches issue-detail panel style
// ---------------------------------------------------------------------------
function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-2 rounded-md px-2 -mx-2 hover:bg-accent/50 transition-colors">
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs truncate">
        {children}
      </div>
    </div>
  );
}

function shortDate(str?: string) {
  if (!str) return "—";
  return new Date(str).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface WikiPropertiesPanelProps {
  wikiId: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  onRestore?: (version: any) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function WikiPropertySidebar({
  wikiId,
  createdBy,
  updatedBy,
  createdAt,
  updatedAt,
  onRestore,
}: WikiPropertiesPanelProps) {
  const { isHistoryOpen, setIsHistoryOpen, viewingVersionId, setViewingVersionId } = useWikiStore();
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const { getActorName } = useActorName();

  const { data: rawHistory, isLoading } = useQuery({
    queryKey: ["wiki-history", wikiId],
    queryFn: () => api.getWikiHistory(wikiId),
    enabled: !!wikiId && isHistoryOpen,
  });
  const history: any[] = Array.isArray(rawHistory) ? rawHistory : [];

  if (!isHistoryOpen) return null;

  return (
    <div className="flex h-full w-64 flex-col border-l bg-background">
      {/* Header — h-12 matching editor */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <span className="text-sm font-semibold text-foreground">Properties</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setIsHistoryOpen(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="p-4 space-y-5">

          {/* Properties section */}
          <div>
            <button
              className={cn(
                "flex w-full items-center gap-1 text-xs font-medium transition-colors mb-2",
                !propertiesOpen && "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setPropertiesOpen(!propertiesOpen)}
            >
              <ChevronRight className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                propertiesOpen && "rotate-90",
              )} />
              Properties
            </button>

            {propertiesOpen && (
              <div className="space-y-0.5 pl-2">
                {createdBy && (
                  <PropRow label="Created by">
                    <ActorAvatar actorType="member" actorId={createdBy} size={16} />
                    <span className="truncate text-foreground/80">
                      {getActorName("member", createdBy)}
                    </span>
                  </PropRow>
                )}
                <PropRow label="Created">
                  <span className="text-muted-foreground">{shortDate(createdAt)}</span>
                </PropRow>
                {updatedBy && (
                  <PropRow label="Updated by">
                    <ActorAvatar actorType="member" actorId={updatedBy} size={16} />
                    <span className="truncate text-foreground/80">
                      {getActorName("member", updatedBy)}
                    </span>
                  </PropRow>
                )}
                <PropRow label="Updated">
                  <span className="text-muted-foreground">{shortDate(updatedAt)}</span>
                </PropRow>
              </div>
            )}
          </div>

          {/* History section */}
          <div>
            <button
              className={cn(
                "flex w-full items-center gap-1 text-xs font-medium transition-colors mb-2",
                !historyOpen && "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setHistoryOpen(!historyOpen)}
            >
              <ChevronRight className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                historyOpen && "rotate-90",
              )} />
              History
            </button>

            {historyOpen && (
              <div className="pl-2">
                {isLoading ? (
                  <div className="flex items-center gap-2 py-4 opacity-40">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span className="text-xs">Loading…</span>
                  </div>
                ) : history.length === 0 ? (
                  <div className="flex items-center gap-2 py-4 opacity-40">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground/40" />
                    <span className="text-xs text-muted-foreground">No versions yet</span>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {history.map((version: any) => {
                      const isSelected = viewingVersionId === version.id;
                      return (
                        <div
                          key={version.id}
                          onClick={() => setViewingVersionId(isSelected ? null : version.id)}
                          className={cn(
                            "group flex flex-col gap-1 rounded-md px-2 py-2 -mx-2 cursor-pointer transition-colors",
                            isSelected ? "bg-primary/10" : "hover:bg-accent/50",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <span className={cn(
                              "text-xs font-semibold shrink-0",
                              isSelected ? "text-primary" : "text-foreground/80",
                            )}>
                              v{version.version_number}
                            </span>
                            <span className="text-[10px] text-muted-foreground/60 truncate">
                              {new Date(version.created_at).toLocaleDateString(undefined, {
                                month: "short", day: "numeric",
                              })}
                              {" · "}
                              {new Date(version.created_at).toLocaleTimeString([], {
                                hour: "2-digit", minute: "2-digit",
                              })}
                            </span>
                          </div>

                          {version.created_by && (
                            <div className="flex items-center gap-1.5">
                              <ActorAvatar actorType="member" actorId={version.created_by} size={14} />
                              <span className="text-[11px] text-muted-foreground/70 truncate">
                                {getActorName("member", version.created_by)}
                              </span>
                            </div>
                          )}

                          {isSelected && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); onRestore?.(version); }}
                              className="h-6 px-2 text-xs font-medium mt-1 w-full"
                            >
                              <ArrowLeft className="mr-1 h-3 w-3" />
                              Restore
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
