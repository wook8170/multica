import {
  Save, MoreHorizontal, History, Trash, Loader2, Check, AlertCircle, ChevronRight,
  Maximize2, Minimize2
} from "lucide-react";
import { useRef } from "react";
import { Button } from "@multica/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@multica/ui/components/ui/dropdown-menu";
import { ContentEditor, TitleEditor } from "@multica/views/editor";
import { useWikiStore } from "../store";
import { useAuthStore } from "@multica/core/auth";
import { cn } from "@multica/ui/lib/utils";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface WikiEditorProps {
  id: string;
  title: string;
  content: string;
  parentTitle?: string | null;
  onUpdateTitle: (val: string) => void;
  onUpdateContent: (val: string) => void;
  onSave: (binaryState?: string | null) => void;
  onUploadFile?: (file: File) => Promise<any>;
  onDelete: () => void;
  saveStatus: SaveStatus;
  // Collaboration
  ydoc?: any;
  provider?: any;
  user?: { name: string; color: string; id?: string };
}

export function WikiEditor({
  id,
  title,
  content,
  parentTitle,
  onUpdateTitle,
  onUpdateContent,
  onSave,
  onUploadFile,
  onDelete,
  saveStatus,
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
      {/* Top header */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b px-4 bg-background">
        <div className="flex items-center gap-2 text-xs md:text-sm">
          <span className="text-muted-foreground font-medium">Documents</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
          {parentTitle && (
            <>
              <span className="text-muted-foreground max-w-[140px] truncate font-medium">{parentTitle}</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
            </>
          )}
          <span className="text-foreground font-semibold truncate max-w-[240px] md:max-w-[300px]">
            {id === "new" ? "New Document" : title}
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

          {/* History */}
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", isHistoryOpen ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-muted")}
            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
          >
            <History className="h-4 w-4" />
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

          {/* Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:bg-muted">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            } />
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
              >
                <Trash className="mr-2 h-4 w-4" />
                Delete Document
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto pt-12 pb-32 scrollbar-hide">
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
        </div>
      </div>
    </div>
  );
}
