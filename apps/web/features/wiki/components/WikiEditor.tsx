import {
  Save, PanelRight, Trash2, Loader2, Check, AlertCircle, ChevronRight,
  Maximize2, Minimize2, FileText, Plus, Minus, Wifi, WifiOff
} from "lucide-react";
import { useRef, useState, useMemo, useEffect } from "react";
import { Button } from "@multica/ui/components/ui/button";
import { Badge } from "@multica/ui/components/ui/badge";
import { ContentEditor, TitleEditor } from "@multica/views/editor";
import { useWikiStore } from "../store";
import { useAuthStore } from "@multica/core/auth";
import { cn } from "@multica/ui/lib/utils";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface Ancestor { id: string; title: string }
interface ChildPage { id: string; title: string }

interface WikiEditorProps {
  id: string;
  title: string;
  content: string;
  restoreKey?: number;
  ancestors?: Ancestor[];
  onNavigateTo?: (id: string) => void;
  onUpdateTitle: (val: string) => void;
  onUpdateContent: (val: string) => void;
  onSave: (binaryState?: string | null) => void;
  onUploadFile?: (file: File) => Promise<any>;
  onDelete: () => void;
  saveStatus: SaveStatus;
  childPages?: ChildPage[];
  onCreateChild?: () => void;
  // Collaboration
  ydoc?: any;
  provider?: any;
  user?: { name: string; color: string; id?: string };
  collabConnected?: boolean;
  showRemoteCursors?: boolean;
}

export function WikiEditor({
  id,
  title,
  content,
  restoreKey = 0,
  ancestors = [],
  onNavigateTo,
  onUpdateTitle,
  onUpdateContent,
  onSave,
  onUploadFile,
  onDelete,
  saveStatus,
  childPages,
  onCreateChild,
  ydoc,
  provider,
  user,
  collabConnected,
  showRemoteCursors,
  ref
}: WikiEditorProps & { ref?: any }) {
  const { isHistoryOpen, setIsHistoryOpen, isFullWidth, setIsFullWidth } = useWikiStore();
  const authUser = useAuthStore((s) => s.user);
  const editorRef = useRef<any>(null);
  const contentViewportRef = useRef<HTMLDivElement | null>(null);
  const [contentViewportWidth, setContentViewportWidth] = useState(0);

  const baseWidthRem = 48; // max-w-3xl
  const baseWidthPx = baseWidthRem * 16;
  const maxWidthPercent = useMemo(() => {
    if (contentViewportWidth <= 0) return 160;
    const usableWidthPx = Math.max(baseWidthPx, contentViewportWidth);
    return Math.max(100, Math.round((usableWidthPx / baseWidthPx) * 100));
  }, [contentViewportWidth]);

  const widthSteps = useMemo<number[]>(() => {
    if (maxWidthPercent <= 100) return [100];
    const raw = [
      100,
      Math.round(100 + (maxWidthPercent - 100) * (1 / 3)),
      Math.round(100 + (maxWidthPercent - 100) * (2 / 3)),
      maxWidthPercent,
    ];
    return raw.filter((v, idx) => idx === 0 || v > raw[idx - 1]!);
  }, [maxWidthPercent]);

  const defaultWidthIndex = 0;
  const [widthIndex, setWidthIndex] = useState(defaultWidthIndex);
  const widthPercent = widthSteps[widthIndex] ?? 100;
  const pageWidthRem = (baseWidthRem * widthPercent) / 100;
  const maxWidthIndex = Math.max(0, widthSteps.length - 1);
  const isAtMinWidth = !isFullWidth && widthIndex === defaultWidthIndex;
  const isAtMaxWidth = isFullWidth || widthIndex === maxWidthIndex;
  const quickTargetIndex = isAtMinWidth ? maxWidthIndex : defaultWidthIndex;
  const currentPercentLabel = isFullWidth ? maxWidthPercent : widthPercent;

  useEffect(() => {
    const el = contentViewportRef.current;
    if (!el) return;
    const updateWidth = () => setContentViewportWidth(el.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setWidthIndex((idx) => Math.min(idx, widthSteps.length - 1));
  }, [widthSteps.length]);

  const handleSave = () => {
    const binaryState = editorRef.current?.getBinaryState();
    onSave(binaryState);
  };

  // Expose imperative methods
  if (ref) {
    ref.current = {
      getBinaryState: () => editorRef.current?.getBinaryState() ?? null,
      restoreBinaryState: (state: string) => editorRef.current?.restoreBinaryState(state),
    };
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Top header — h-12 / px-4 matching inbox panel header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 min-w-0">
          {ancestors.length > 0 && (
            <div className="flex items-center gap-1 text-sm min-w-0 shrink-0">
              {ancestors.map((a, i) => (
                <span key={a.id} className="contents">
                  {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />}
                  <button
                    type="button"
                    onClick={() => onNavigateTo?.(a.id)}
                    className="text-muted-foreground max-w-[120px] truncate hover:text-foreground hover:underline underline-offset-2 transition-colors shrink-0"
                    title={a.title}
                  >
                    {a.title || "Untitled"}
                  </button>
                </span>
              ))}
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />
            </div>
          )}
          <h1 className="text-sm font-semibold truncate min-w-0">
            {id === "new" ? "New Document" : (title || "Untitled")}
          </h1>
        </div>

        <div className="flex items-center gap-1">
          {id !== "new" && (
            <Badge
              variant="secondary"
              title={collabConnected ? "Collaboration active" : "Collaboration offline"}
              className={cn(
                "mr-1 shrink-0 gap-1.5 px-2 py-0.5 text-xs font-medium",
                collabConnected ? "bg-success/10 text-success" : "",
              )}
            >
              {collabConnected ? (
                <Wifi className="h-3 w-3" />
              ) : (
                <WifiOff className="h-3 w-3" />
              )}
              {collabConnected ? "Collaborate" : "Offline"}
            </Badge>
          )}

          <div className="mr-1 flex items-center gap-0.5 rounded-md border border-border/70 bg-muted/30 p-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:bg-muted"
              onClick={() => {
                if (isFullWidth) {
                  setIsFullWidth(false);
                  setWidthIndex(maxWidthIndex);
                  return;
                }
                setWidthIndex((idx) => Math.max(0, idx - 1));
              }}
              disabled={!isFullWidth && widthIndex === 0}
              title="Narrower page"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 min-w-12 px-2 text-[11px] font-semibold text-foreground hover:bg-muted"
              onClick={() => {
                setIsFullWidth(false);
                setWidthIndex(quickTargetIndex);
              }}
              title={isAtMinWidth ? "Set to max step" : "Set to 100%"}
            >
              {currentPercentLabel}%
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:bg-muted"
              onClick={() => {
                if (isFullWidth) return;
                setWidthIndex((idx) => Math.min(widthSteps.length - 1, idx + 1));
              }}
              disabled={isFullWidth || widthIndex === widthSteps.length - 1}
              title="Wider page"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Full-width toggle */}
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", isAtMaxWidth ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-muted")}
            onClick={() => {
              if (isAtMaxWidth) {
                setIsFullWidth(false);
                setWidthIndex(defaultWidthIndex);
                return;
              }
              setIsFullWidth(true);
            }}
          >
            {isAtMaxWidth ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>

          <div className="w-[1px] h-4 bg-border/40" />

          {/* Save status + save button */}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1 text-xs text-green-500 px-1">
              <Check className="h-3.5 w-3.5" />
              Saved
            </span>
          )}
          {saveStatus === "error" && (
            <span className="flex items-center gap-1 text-xs text-destructive px-1">
              <AlertCircle className="h-3.5 w-3.5" />
              Error
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
            onClick={handleSave}
            disabled={saveStatus === "saving"}
          >
            {saveStatus === "saving"
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Save className="h-4 w-4" />
            }
          </Button>

          {/* Delete */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>

          <div className="w-[1px] h-4 bg-border/40" />

          {/* Properties sidebar toggle */}
          <Button
            variant={isHistoryOpen ? "secondary" : "ghost"}
            size="icon"
            className={cn("h-8 w-8", !isHistoryOpen && "text-muted-foreground")}
            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
          >
            <PanelRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Editor area — pt-8 gives enough room for remote cursor name badges while moving content up */}
      <div ref={contentViewportRef} className="flex-1 overflow-y-auto overflow-x-hidden pt-8 pb-32 scrollbar-hide">
        <div
          className="mx-auto w-full px-6 md:px-8 transition-all duration-300"
          style={{ maxWidth: isFullWidth ? "100%" : `${pageWidthRem}rem` }}
        >
          <div className="mb-4">
            <TitleEditor
              key={`title-${id}`}
              defaultValue={title}
              placeholder="Document title..."
              className="w-full text-3xl md:text-4xl font-bold tracking-tight border-none focus-within:ring-0 px-0 leading-tight text-foreground placeholder:text-muted-foreground/40"
              onChange={onUpdateTitle}
            />
          </div>

          <div className="min-h-[600px]">
            <ContentEditor
              ref={editorRef}
              key={`content-${id}-${ydoc?.clientID ?? "static"}-${restoreKey}`}
              defaultValue={content}
              forceDefault={restoreKey > 0}
              placeholder="Start writing..."
              onUpdate={onUpdateContent}
              onUploadFile={onUploadFile}
              showToolbar
              className="prose prose-sm max-w-none dark:prose-invert focus:outline-none leading-relaxed"
              ydoc={ydoc}
              provider={provider}
              user={user}
              showRemoteCursors={showRemoteCursors}
              field="content"
            />
          </div>

          {/* Sub Pages */}
          {((childPages && childPages.length > 0) || onCreateChild) && (
            <div className="mt-12 border-t border-border/40 pt-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">
                  Sub Pages
                  {childPages && childPages.length > 0 && (
                    <span className="ml-2 text-xs font-normal normal-case text-muted-foreground/60">{childPages.length}</span>
                  )}
                </h2>
                {onCreateChild && (
                  <button
                    type="button"
                    onClick={onCreateChild}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New
                  </button>
                )}
              </div>
              {childPages && childPages.length > 0 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {childPages.map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => onNavigateTo?.(child.id)}
                      className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-3 text-left hover:bg-accent hover:border-border transition-colors group"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-primary/60 transition-colors" />
                      <span className="truncate text-sm text-foreground">
                        {child.title || "Untitled"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
