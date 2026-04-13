"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, X, Clock, ArrowLeft, Loader2, FileText, Download, Info, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@multica/ui/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@multica/ui/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@multica/ui/components/ui/popover";
import { api } from "@multica/core/api";
import { cn } from "@multica/ui/lib/utils";
import { AttachmentFileIcon } from "@multica/views/editor";
import { useWikiStore } from "../store";
import { ActorAvatar } from "@multica/views/common/actor-avatar";
import { useActorName } from "@multica/core/workspace/hooks";

// ---------------------------------------------------------------------------
// PropRow
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
// Attachment helpers
// ---------------------------------------------------------------------------
const IMAGE_EXTS = /\.(png|jpe?g|gif|webp|svg|ico|bmp|tiff?)$/i;
// Uploaded files are keyed as {uuid}.{ext} — match this in the URL path
const UPLOAD_UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i;

function isUploadedFileUrl(url: string): boolean {
  try {
    return UPLOAD_UUID_RE.test(new URL(url).pathname);
  } catch { return false; }
}

function basename(url: string): string {
  try { return decodeURIComponent(new URL(url).pathname.split("/").pop() || url); }
  catch { return url; }
}

interface RawAttachment {
  href: string;
  filename: string;
  type: "image" | "file";
}

// Content is stored as Markdown — parse with regex instead of DOM.
//   Images:    ![alt](url)
//   File cards: [filename](url)  (rendered by file-card extension)
// Detect uploaded files by UUID key pattern so this works with any CDN/MinIO domain.
function extractAttachments(markdown: string): RawAttachment[] {
  if (!markdown) return [];
  const result: RawAttachment[] = [];
  const seen = new Set<string>();

  const add = (href: string, filename: string) => {
    if (!isUploadedFileUrl(href) || seen.has(href)) return;
    seen.add(href);
    result.push({
      href,
      filename: filename || basename(href),
      type: IMAGE_EXTS.test(href) ? "image" : "file",
    });
  };

  // ![alt](url) — images
  for (const m of markdown.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)) {
    add(m[2]!, m[1]!);
  }
  // [text](url) — file card links (non-image uploads)
  for (const m of markdown.matchAll(/(?<!!)\[([^\]]+)\]\(([^)\s]+)\)/g)) {
    add(m[2]!, m[1]!);
  }

  return result;
}

// A single canonical attachment entry across all versions
interface AttachmentEntry {
  href: string;
  filename: string;
  type: "image" | "file";
  /** Version numbers (as strings) where this attachment appears, newest-first */
  versions: string[];
  /** Whether it exists in the current (live) content */
  inCurrent: boolean;
}

function buildAttachmentMap(
  currentContent: string,
  history: any[],
): AttachmentEntry[] {
  const map = new Map<string, AttachmentEntry>();

  const upsert = (raw: RawAttachment, versionLabel: string | null, isCurrent: boolean) => {
    let entry = map.get(raw.href);
    if (!entry) {
      entry = { href: raw.href, filename: raw.filename, type: raw.type, versions: [], inCurrent: false };
      map.set(raw.href, entry);
    }
    if (isCurrent) entry.inCurrent = true;
    if (versionLabel && !entry.versions.includes(versionLabel)) {
      entry.versions.push(versionLabel);
    }
  };

  // Current content
  extractAttachments(currentContent).forEach((a) => upsert(a, null, true));

  // History versions — sorted newest-first (API usually returns newest-first already)
  const sorted = [...history].sort((a, b) => (b.version_number ?? 0) - (a.version_number ?? 0));
  sorted.forEach((v) => {
    extractAttachments(v.content || "").forEach((a) =>
      upsert(a, `v${v.version_number}`, false),
    );
  });

  return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface ChildPage {
  id: string;
  title: string;
}

interface WikiPropertiesPanelProps {
  wikiId: string;
  currentContent?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  childPages?: ChildPage[];
  onNavigateTo?: (id: string) => void;
  onRestore?: (version: any) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function WikiPropertySidebar({
  wikiId,
  currentContent = "",
  createdBy,
  updatedBy,
  createdAt,
  updatedAt,
  childPages = [],
  onNavigateTo,
  onRestore,
}: WikiPropertiesPanelProps) {
  const queryClient = useQueryClient();
  const { isHistoryOpen, setIsHistoryOpen, viewingVersionId, setViewingVersionId } = useWikiStore();
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [subPagesOpen, setSubPagesOpen] = useState(true);
  const [attachmentsOpen, setAttachmentsOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [compactConfirmOpen, setCompactConfirmOpen] = useState(false);
  const { getActorName } = useActorName();

  const { data: rawHistory, isLoading } = useQuery({
    queryKey: ["wiki-history", wikiId],
    queryFn: () => api.getWikiHistory(wikiId),
    enabled: !!wikiId && isHistoryOpen,
  });
  const history: any[] = Array.isArray(rawHistory) ? rawHistory : [];

  const attachments = useMemo(
    () => buildAttachmentMap(currentContent, history).filter((a) => a.inCurrent),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentContent, rawHistory],
  );

  const compactHistoryMutation = useMutation({
    mutationFn: () => api.compactWikiHistory(wikiId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["wiki-history", wikiId] });
      const changedCount = result.deleted_versions + result.cleared_binary_state;
      toast.success(changedCount > 0 ? "History cleaned." : "History already matches the policy.");
    },
    onError: () => toast.error("Failed to clean history."),
  });

  const handleCompactHistory = () => {
    setCompactConfirmOpen(false);
    compactHistoryMutation.mutate();
  };

  return (
    <>
    <div className="flex h-full w-full flex-col border-l bg-background">
      {/* Header */}
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
              <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", propertiesOpen && "rotate-90")} />
              Properties
            </button>
            {propertiesOpen && (
              <div className="space-y-0.5 pl-2">
                {createdBy && (
                  <PropRow label="Created by">
                    <ActorAvatar actorType="member" actorId={createdBy} size={16} />
                    <span className="truncate text-foreground/80">{getActorName("member", createdBy)}</span>
                  </PropRow>
                )}
                <PropRow label="Created">
                  <span className="text-muted-foreground">{shortDate(createdAt)}</span>
                </PropRow>
                {updatedBy && (
                  <PropRow label="Updated by">
                    <ActorAvatar actorType="member" actorId={updatedBy} size={16} />
                    <span className="truncate text-foreground/80">{getActorName("member", updatedBy)}</span>
                  </PropRow>
                )}
                <PropRow label="Updated">
                  <span className="text-muted-foreground">{shortDate(updatedAt)}</span>
                </PropRow>
              </div>
            )}
          </div>

          {/* Attachments section — only shown when there are any */}
          {attachments.length > 0 && (
            <div>
              <button
                className={cn(
                  "flex w-full items-center gap-1 text-xs font-medium transition-colors mb-2",
                  !attachmentsOpen && "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setAttachmentsOpen(!attachmentsOpen)}
              >
                <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", attachmentsOpen && "rotate-90")} />
                <span>Attachments</span>
                <span className="ml-1 text-[10px] font-normal text-muted-foreground/60">{attachments.length}</span>
              </button>

              {attachmentsOpen && (
                <div className="pl-2 space-y-1.5">
                  {attachments.map((att) => (
                    <a
                      key={att.href}
                      href={att.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5 py-1.5 transition-colors hover:bg-muted no-underline"
                    >
                      <AttachmentFileIcon href={att.href} filename={att.filename} className="h-3.5 w-3.5" />
                      <p className="min-w-0 flex-1 truncate text-xs text-foreground/80 leading-tight">
                        {att.filename}
                      </p>
                      <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-60 transition-opacity" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sub Pages section */}
          {childPages.length > 0 && (
            <div>
              <button
                className={cn(
                  "flex w-full items-center gap-1 text-xs font-medium transition-colors mb-2",
                  !subPagesOpen && "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setSubPagesOpen(!subPagesOpen)}
              >
                <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", subPagesOpen && "rotate-90")} />
                <span>Sub Pages</span>
                <span className="ml-1 text-[10px] font-normal text-muted-foreground/60">{childPages.length}</span>
              </button>

              {subPagesOpen && (
                <div className="pl-2 space-y-1.5">
                  {childPages.map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => onNavigateTo?.(child.id)}
                      className="group flex w-full items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5 py-1.5 text-left transition-colors hover:bg-muted"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-xs text-foreground/80 leading-tight">
                        {child.title || "Untitled"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* History section */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-1 text-xs font-medium transition-colors",
                  !historyOpen && "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setHistoryOpen(!historyOpen)}
              >
                <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", historyOpen && "rotate-90")} />
                History
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Clean history"
                  disabled={compactHistoryMutation.isPending}
                  onClick={() => setCompactConfirmOpen(true)}
                >
                  {compactHistoryMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Popover>
                  <PopoverTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="History retention policy"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </Button>
                    }
                  />
                  <PopoverContent align="end" side="left" className="w-72 p-3">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-foreground">History policy</p>
                      <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                        <li>Latest 20 versions are kept in full.</li>
                        <li>After 30 days, older history is compacted to one version per day.</li>
                        <li>Yjs binary snapshots are kept only for the latest 10 versions.</li>
                        <li>Uploaded file objects remain available while current content or retained history references them.</li>
                      </ul>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

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
                    {(() => {
                      const maxVer = Math.max(...history.map((v: any) => v.version_number ?? 0));
                      return history.map((version: any) => {
                      const isSelected = viewingVersionId === version.id;
                      const isLatest = version.version_number === maxVer;

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
                            <div className="flex items-center gap-1.5 min-w-0">
                              {isLatest ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-semibold leading-none shrink-0">
                                  Current
                                </span>
                              ) : (
                                <span className={cn(
                                  "text-xs font-semibold shrink-0",
                                  isSelected ? "text-primary" : "text-foreground/80",
                                )}>
                                  v{version.version_number}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground/60 truncate shrink-0">
                              {new Date(version.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                              {" · "}
                              {new Date(version.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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

                          {isSelected && !isLatest && (
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
                    });
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
    <AlertDialog open={compactConfirmOpen} onOpenChange={setCompactConfirmOpen}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Clean history?</AlertDialogTitle>
          <AlertDialogDescription>
            Versions outside the history policy will be removed. Latest 20 versions stay available, and older history after 30 days is kept as one version per day.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setCompactConfirmOpen(false)}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={compactHistoryMutation.isPending}
            onClick={handleCompactHistory}
          >
            {compactHistoryMutation.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            Clean history
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
