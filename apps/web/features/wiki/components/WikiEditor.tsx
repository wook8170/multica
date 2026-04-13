import {
  Save, PanelRight, Trash2, Loader2, Check, AlertCircle, ChevronRight,
  Maximize2, Minimize2, FileText, Plus
} from "lucide-react";
import { useRef } from "react";
import { Button } from "@multica/ui/components/ui/button";
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
}

export function WikiEditor({
  id,
  title,
  content,
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
  ref
}: WikiEditorProps & { ref?: any }) {
  const { isHistoryOpen, setIsHistoryOpen, isFullWidth, setIsFullWidth } = useWikiStore();
  const authUser = useAuthStore((s) => s.user);
  const editorRef = useRef<any>(null);

  const handleSave = () => {
    const binaryState = editorRef.current?.getBinaryState();
    onSave(binaryState);
  };

  // Expose imperative methods
  if (ref) {
    ref.current = {
      restoreBinaryState: (state: string) => editorRef.current?.restoreBinaryState(state)
    };
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Top header — h-12 / px-4 matching inbox panel header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4 bg-background">
        <div className="flex items-center gap-1 text-sm min-w-0">
          <span className="text-muted-foreground shrink-0">Documents</span>
          {ancestors.map((a) => (
            <span key={a.id} className="contents">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />
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
          <span className="text-foreground font-semibold truncate min-w-0">
            {id === "new" ? "New Document" : (title || "Untitled")}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Full-width toggle */}
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", isFullWidth ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-muted")}
            onClick={() => setIsFullWidth(!isFullWidth)}
          >
            {isFullWidth ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
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
        </div>
      </div>

      {/* Editor area — pt-20 gives room for remote cursor name badges at the top */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden pt-20 pb-32 scrollbar-hide">
        <div className={cn(
          "mx-auto px-6 md:px-12 transition-all duration-300",
          isFullWidth ? "max-w-full" : "max-w-3xl"
        )}>
          <div className="mb-8">
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
              key={`content-${id}-${ydoc?.clientID ?? "static"}`}
              defaultValue={content}
              placeholder="Start writing..."
              onUpdate={onUpdateContent}
              onUploadFile={onUploadFile}
              showToolbar
              className="prose prose-sm max-w-none dark:prose-invert focus:outline-none leading-relaxed"
              ydoc={ydoc}
              provider={provider}
              user={user}
              field="content"
            />
          </div>

          {/* Child pages */}
          {((childPages && childPages.length > 0) || onCreateChild) && (
            <div className="mt-12 border-t border-border/40 pt-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">
                  Child pages
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
