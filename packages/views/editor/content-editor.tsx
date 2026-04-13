import {
  Bold, Italic, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, CheckSquare,
  Quote, Minus, Link as LinkIcon, Paperclip, Table as TableIcon,
  RotateCcw
} from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useCallback,
  useState,
} from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import * as Y from "yjs";
import { cn } from "@multica/ui/lib/utils";
import type { UploadResult } from "@multica/core/hooks/use-file-upload";
import { useQueryClient } from "@tanstack/react-query";
import { createEditorExtensions } from "./extensions";
import { uploadAndInsertFile, uploadAndInsertFiles } from "./extensions/file-upload";
import { preprocessMarkdown } from "./utils/preprocess";
import { Button } from "@multica/ui/components/ui/button";
import "./content-editor.css";

interface ContentEditorProps {
  defaultValue?: string;
  onUpdate?: (markdown: string) => void;
  placeholder?: string;
  editable?: boolean;
  className?: string;
  debounceMs?: number;
  onSubmit?: () => void;
  onBlur?: () => void;
  onUploadFile?: (file: File) => Promise<UploadResult | null>;
  showToolbar?: boolean;
  // Collaboration (Agent D)
  ydoc?: any;
  provider?: any;
  user?: { name: string; color: string; id?: string };
  field?: string;
  showRemoteCursors?: boolean;
  // When true, forces defaultValue into the editor even if the Yjs fragment already has content
  // (used for version restore to override collaborative state)
  forceDefault?: boolean;
}

interface ContentEditorRef {
  getMarkdown: () => string;
  getBinaryState: () => string | null;
  restoreBinaryState: (base64State: string) => void;
  clearContent: () => void;
  focus: () => void;
  uploadFile: (file: File) => void;
}

const ContentEditor = forwardRef<ContentEditorRef, ContentEditorProps>(
  function ContentEditor(
    {
      defaultValue = "",
      onUpdate,
      placeholder: placeholderText = "",
      editable = true,
      className,
      debounceMs = 300,
      onSubmit,
      onBlur,
      onUploadFile,
      showToolbar = false,
      ydoc,
      provider,
      user,
      field,
      showRemoteCursors = true,
      forceDefault = false,
    },
    ref,
  ) {
    // Remote user cursor state
    const [remoteCursors, setRemoteCursors] = useState<Record<string, any>>({});
    // Keep a ref so the seeding effect closure always reads the latest value
    const forceDefaultRef = useRef(forceDefault);
    forceDefaultRef.current = forceDefault;
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const cursorLastSeenRef = useRef<Record<string, number>>({}); // cursor TTL tracking
    const removalTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({}); // grace-period timers (keyed by userKey)
    const clientUserMapRef = useRef<Record<string, string>>({}); // clientID → userKey (stable per-user key)
    const fileInputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const onUpdateRef = useRef(onUpdate);
    const onSubmitRef = useRef(onSubmit);
    const onBlurRef = useRef(onBlur);
    const onUploadFileRef = useRef(onUploadFile);
    const prevContentRef = useRef(defaultValue);

    onUpdateRef.current = onUpdate;
    onSubmitRef.current = onSubmit;
    onBlurRef.current = onBlur;
    onUploadFileRef.current = onUploadFile;

    const queryClient = useQueryClient();

    const editor = useEditor({
      immediatelyRender: false,
      editable,
      content: ydoc ? undefined : (defaultValue ? preprocessMarkdown(defaultValue) : ""),
      contentType: defaultValue && !ydoc ? "markdown" : undefined,
      extensions: createEditorExtensions({
        editable,
        placeholder: placeholderText,
        queryClient,
        onSubmitRef,
        onUploadFileRef,
        ydoc,
        provider,
        user,
        field,
      }),
      onUpdate: ({ editor: ed }) => {
        if (!onUpdateRef.current) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          // Strip &nbsp; / \u00a0 that ProseMirror inserts to keep empty paragraphs
          // non-empty — they must not be persisted to the database.
          const md = ed.getMarkdown().replace(/&nbsp;/g, " ").replace(/\u00a0/g, " ");
          onUpdateRef.current?.(md);
        }, debounceMs);
      },
      onBlur: () => {
        onBlurRef.current?.();
      },
      editorProps: {
        attributes: {
          class: cn(
            "rich-text-editor text-sm outline-none px-4 py-3 leading-relaxed",
            !editable && "readonly",
            className,
          ),
        },
      },
    });

    const setLink = useCallback(() => {
      if (!editor) return;
      const previousUrl = editor.getAttributes("link").href;
      const url = window.prompt("URL", previousUrl);
      if (url === null) return;
      if (url === "") { editor.chain().focus().extendMarkRange("link").unsetLink().run(); return; }
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }, [editor]);

    const handleFileClick = () => fileInputRef.current?.click();
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files?.length && editor && onUploadFileRef.current) {
        uploadAndInsertFiles(
          editor,
          Array.from(files),
          onUploadFileRef.current,
          editor.state.selection.to,
        );
      }
      e.target.value = "";
    };

    // Awareness: share cursor position and display remote cursors.
    // Presence layer fully decoupled from Content Sync.
    useEffect(() => {
      if (!editor || !ydoc || !provider || !user) return;

      const awareness = provider.awareness;
      const localStateId = awareness.clientID;
      let lastCursorState: { from: number; to: number } | null = null;
      let cursorThrottleTimer: ReturnType<typeof setTimeout> | null = null;

      // Local cursor sharing: throttled at 50ms.
      // No IME guard — awareness must update during Korean composition too,
      // otherwise the remote avatar freezes and disappears until composition ends.
      const setLocalCursor = () => {
        if (cursorThrottleTimer) return;

        cursorThrottleTimer = setTimeout(() => {
          cursorThrottleTimer = null;
          try {
            const { from, to } = editor.state.selection;
            if (lastCursorState?.from === from && lastCursorState?.to === to) return;
            lastCursorState = { from, to };
            awareness.setLocalState({
              user: { name: user.name, color: user.color, id: user.id || String(localStateId) },
              cursor: { anchor: from, head: to },
            });
          } catch (e) {
            console.error("Failed to set local cursor state:", e);
          }
        }, 50);
      };

      // Listen to both selectionUpdate (cursor move) and update (content change during IME)
      editor.on("selectionUpdate", setLocalCursor);
      editor.on("update", setLocalCursor);

      // Receive remote cursors.
      // Uses the Y.js awareness change payload { added, updated, removed } to apply
      // surgical updates instead of rebuilding the whole cursor map on every event.
      // Clients are only removed when they explicitly disconnect (appear in `removed`).
      // Temporary absence of `cursor` state (e.g., partial awareness updates) is ignored
      // so the avatar never unmounts and remounts on every keystroke.
      const handleAwarenessChange = (changes: { added: number[]; updated: number[]; removed: number[] } | null) => {
        try {
          const states = awareness.getStates();
          const now = Date.now();

          setRemoteCursors((prev) => {
            const next = { ...prev };
            let dirty = false;

            if (changes === null) {
              // Initial population: read all current states
              states.forEach((state: any, clientID: any) => {
                if (clientID === localStateId) return;
                if (state?.cursor && state?.user) {
                  // Key by actual user ID so the same user on reconnect updates in place
                  const userKey = state.user.id || String(clientID);
                  clientUserMapRef.current[String(clientID)] = userKey;
                  cursorLastSeenRef.current[userKey] = now;
                  next[userKey] = { user: state.user, cursor: state.cursor };
                  dirty = true;
                }
              });
              return dirty ? next : prev;
            }

            // Add / update — cancel any pending grace-period removal first
            for (const clientID of [...(changes.added ?? []), ...(changes.updated ?? [])]) {
              if (clientID === localStateId) continue;
              const state = states.get(clientID);
              if (!state?.cursor || !state?.user) continue; // partial update — keep last position
              const userKey = state.user.id || String(clientID);
              clientUserMapRef.current[String(clientID)] = userKey;
              // Cancel grace timer for this user (reconnect case)
              if (removalTimersRef.current[userKey]) {
                clearTimeout(removalTimersRef.current[userKey]);
                delete removalTimersRef.current[userKey];
              }
              cursorLastSeenRef.current[userKey] = now;
              const old = prev[userKey];
              if (!old || old.cursor.head !== state.cursor.head || old.cursor.anchor !== state.cursor.anchor) {
                next[userKey] = { user: state.user, cursor: state.cursor };
                dirty = true;
              }
            }

            // Removed clients: look up stable userKey via clientUserMap,
            // then schedule a short grace period (handles brief network hiccups).
            for (const clientID of (changes.removed ?? [])) {
              const userKey = clientUserMapRef.current[String(clientID)];
              delete clientUserMapRef.current[String(clientID)];
              if (!userKey || !next[userKey]) continue;
              if (removalTimersRef.current[userKey]) clearTimeout(removalTimersRef.current[userKey]);
              removalTimersRef.current[userKey] = setTimeout(() => {
                delete removalTimersRef.current[userKey];
                setRemoteCursors((p) => {
                  if (!p[userKey]) return p;
                  const n = { ...p };
                  delete n[userKey];
                  delete cursorLastSeenRef.current[userKey];
                  return n;
                });
              }, 1500);
            }

            return dirty ? next : prev;
          });
        } catch (e) {
          console.error("Failed to handle awareness change:", e);
        }
      };

      awareness.on("change", handleAwarenessChange);

      // Stale cursor TTL cleanup: remove ghost cursors not updated for 30 seconds
      const STALE_TTL_MS = 30_000;
      const ttlCleanup = setInterval(() => {
        const now = Date.now();
        const staleKeys = Object.entries(cursorLastSeenRef.current)
          .filter(([, t]) => now - t > STALE_TTL_MS)
          .map(([k]) => k);
        if (staleKeys.length > 0) {
          staleKeys.forEach((k) => delete cursorLastSeenRef.current[k]);
          setRemoteCursors((prev) => {
            const next = { ...prev };
            staleKeys.forEach((k) => delete next[k]);
            return next;
          });
        }
      }, 15_000);

      // Remove cursor on tab hide, restore on tab focus (prevents ghost cursors)
      const handleVisibilityChange = () => {
        if (document.hidden) {
          awareness.setLocalState(null);
        } else {
          lastCursorState = null; // force re-send
          setLocalCursor();
        }
      };
      document.addEventListener("visibilitychange", handleVisibilityChange);

      // Set initial state
      setLocalCursor();
      handleAwarenessChange(null);

      return () => {
        if (cursorThrottleTimer) clearTimeout(cursorThrottleTimer);
        clearInterval(ttlCleanup);
        Object.values(removalTimersRef.current).forEach(clearTimeout);
        removalTimersRef.current = {};
        clientUserMapRef.current = {};
        // Clear local cursor immediately on unmount (document exit)
        awareness.setLocalState(null);
        awareness.off("change", handleAwarenessChange);
        editor.off("selectionUpdate", setLocalCursor);
        editor.off("update", setLocalCursor);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      };
    }, [editor, ydoc, provider, user]);

    // Initial content seeding: when the Y.XmlFragment is empty (new doc / first collaborator),
    // populate it from defaultValue. The Collaboration extension owns all subsequent syncing.
    useEffect(() => {
      if (!editor || !ydoc || !provider) return;

      const fieldName = field || "content";
      const seed = () => {
        const fragment = ydoc.getXmlFragment(fieldName);
        // Seed when: (a) new/empty document, or (b) forceDefault is set (version restore).
        // forceDefault is read from a ref so the closure always gets the latest value
        // without adding it as a dep (this effect must only re-run on editor/ydoc/provider change).
        // Also check editor.isEmpty to catch the case where TipTap initialised an empty
        // paragraph into the fragment (length > 0 but still visually empty).
        const isEmpty = fragment.length === 0 || editor.isEmpty;
        if ((isEmpty || forceDefaultRef.current) && defaultValue) {
          editor.commands.setContent(preprocessMarkdown(defaultValue), { contentType: "markdown" });
        }
      };

      // Seed immediately so the editor is never blank while waiting for the collab
      // server. If the server later sends non-empty content, the Collaboration
      // extension's Yjs merge will take over and update the editor automatically.
      seed();

      if (provider.isSynced) return;

      // Also seed after sync in case the server sends a non-empty document
      // that overwrote our immediate seed (edge case: server has older empty state).
      const onSync = (payload: { state: boolean } | boolean) => {
        const isSynced = typeof payload === "object" ? payload.state : payload;
        if (!isSynced) return;
        seed();
        provider.off("sync", onSync);
      };
      provider.on("sync", onSync);
      return () => { provider.off("sync", onSync); };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor, ydoc, provider]);

    useEffect(() => {
      return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, []);

    useEffect(() => {
      if (!editor || editable) return;
      if (defaultValue === prevContentRef.current) return;
      prevContentRef.current = defaultValue;
      const processed = defaultValue ? preprocessMarkdown(defaultValue) : "";
      if (processed) editor.commands.setContent(processed, { contentType: "markdown" });
      else editor.commands.clearContent();
    }, [editor, editable, defaultValue]);

    useImperativeHandle(ref, () => ({
      getMarkdown: () => editor?.getMarkdown() ?? "",
      getBinaryState: () => {
        if (!ydoc) return null;
        const update = Y.encodeStateAsUpdate(ydoc);
        return Buffer.from(update).toString("base64");
      },
      restoreBinaryState: (base64State: string) => {
        if (!ydoc) return;
        const update = Buffer.from(base64State, "base64");
        Y.applyUpdate(ydoc, update);
      },
      clearContent: () => { editor?.commands.clearContent(); },
      focus: () => { editor?.commands.focus(); },
      uploadFile: (file: File) => {
        if (!editor || !onUploadFileRef.current) return;
        const endPos = editor.state.doc.content.size;
        uploadAndInsertFile(editor, file, onUploadFileRef.current, endPos);
      },
    }));

    if (!editor) return null;

    return (
      <div className={cn("relative flex h-full flex-col overflow-hidden bg-transparent")}>
        {showToolbar && editable && (
          <div className="sticky top-0 z-20 flex flex-wrap items-center gap-1 border-b bg-background px-4 py-2 overflow-x-auto scrollbar-hide">
            {/* Inline Formatting */}
            <div className="flex items-center gap-0.5 pr-1.5 border-r border-border/60">
              <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold (Ctrl+B)">
                <Bold className="size-3.5" />
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic (Ctrl+I)">
                <Italic className="size-3.5" />
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Strikethrough">
                <Strikethrough className="size-3.5" />
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().unsetAllMarks().run()} title="Clear Formatting">
                <RotateCcw className="size-3.5" />
              </ToolbarButton>
            </div>

            {/* Headings */}
            <div className="flex items-center gap-0.5 px-1.5 border-r border-border/60">
              <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Heading 1">
                <Heading1 className="size-3.5" />
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading 2">
                <Heading2 className="size-3.5" />
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Heading 3">
                <Heading3 className="size-3.5" />
              </ToolbarButton>
            </div>

            {/* Lists */}
            <div className="flex items-center gap-0.5 px-1.5 border-r border-border/60">
              <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet List">
                <List className="size-3.5" />
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered List">
                <ListOrdered className="size-3.5" />
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().toggleTaskList?.().run()} active={editor.isActive("taskList")} title="Task List">
                <CheckSquare className="size-3.5" />
              </ToolbarButton>
            </div>

            {/* Insert Blocks */}
            <div className="flex items-center gap-0.5 px-1.5 border-r border-border/60">
              <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Quote">
                <Quote className="size-3.5" />
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Separator">
                <Minus className="size-3.5" />
              </ToolbarButton>
            </div>

            {/* Rich Media & Tools */}
            <div className="flex items-center gap-0.5 pl-1.5">
              <ToolbarButton onClick={setLink} active={editor.isActive("link")} title="Hyperlink">
                <LinkIcon className="size-3.5" />
              </ToolbarButton>
              <ToolbarButton onClick={handleFileClick} title="Attach image or file">
                <Paperclip className="size-3.5" />
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Insert Table">
                <TableIcon className="size-3.5" />
              </ToolbarButton>
            </div>
            
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} multiple />
          </div>
        )}
        {/* scrollContainerRef: used by RemoteCursor for absolute position calculation */}
        {/* pt-7: reserve space so the name badge (rendered above the caret) isn't clipped at the top */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto relative pt-7">
          <EditorContent editor={editor} />

          {/* Remote user cursors (Presence layer, decoupled from Content) */}
          {showRemoteCursors && Object.entries(remoteCursors).map(([clientID, { user: remoteUser, cursor }]) => {
            if (!cursor) return null;
            return (
              <RemoteCursor
                key={clientID}
                editor={editor}
                user={remoteUser}
                anchor={cursor.anchor ?? cursor.head}
                head={cursor.head}
                scrollContainer={scrollContainerRef.current}
              />
            );
          })}
        </div>
      </div>
    );
  },
);

const ToolbarButton = ({ children, onClick, active, title }: any) => (
  <Button
    type="button"
    variant={active ? "secondary" : "ghost"}
    size="icon-sm"
    onClick={onClick}
    title={title}
    className={cn(
      "h-7 w-7 transition-colors",
      active ? "text-brand bg-brand/5" : "text-muted-foreground"
    )}
  >
    {children}
  </Button>
);

/** Compute cursor pixel position from a ProseMirror position. Returns null on failure. */
function computeCursorPos(
  head: number,
  editor: any,
  scrollContainer: HTMLElement | null,
): { x: number; y: number } | null {
  if (!editor) return null;
  try {
    const docSize = editor.state.doc.content.size;
    const safeHead = Math.max(1, Math.min(head, Math.max(1, docSize - 1)));
    const coords = editor.view.coordsAtPos(safeHead);
    if (scrollContainer) {
      const rect = scrollContainer.getBoundingClientRect();
      return {
        x: coords.left - rect.left + scrollContainer.scrollLeft,
        y: coords.top - rect.top + scrollContainer.scrollTop,
      };
    }
    return { x: coords.left, y: coords.top };
  } catch (_e) {
    return null;
  }
}

function RemoteCursor({
  editor,
  user,
  anchor,
  head,
  scrollContainer,
}: {
  editor: any;
  user: { name: string; color: string };
  anchor: number;
  head: number;
  scrollContainer: HTMLElement | null;
}) {
  const [headPos, setHeadPos] = useState<{ x: number; y: number } | null>(
    () => computeCursorPos(head, editor, scrollContainer),
  );
  const [anchorPos, setAnchorPos] = useState<{ x: number; y: number } | null>(
    () => anchor !== head ? computeCursorPos(anchor, editor, scrollContainer) : null,
  );
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const hp = computeCursorPos(head, editor, scrollContainer);
      if (hp) setHeadPos(hp);
      if (anchor !== head) {
        const ap = computeCursorPos(anchor, editor, scrollContainer);
        if (ap) setAnchorPos(ap);
      } else {
        setAnchorPos(null);
      }
    });
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [editor, head, anchor, scrollContainer]);

  if (!headPos) return null;

  const color = user.color || "#3b82f6";
  const isRange = anchor !== head && anchorPos !== null;
  // Same-line selection: y positions within 4px of each other
  const isSameLine = isRange && anchorPos !== null && Math.abs(anchorPos.y - headPos.y) < 4;
  const posClass = scrollContainer ? "absolute" : "fixed";
  const isVisibleInScrollContainer = !scrollContainer ||
    (headPos.y >= scrollContainer.scrollTop &&
      headPos.y <= scrollContainer.scrollTop + scrollContainer.clientHeight &&
      headPos.x >= scrollContainer.scrollLeft &&
      headPos.x <= scrollContainer.scrollLeft + scrollContainer.clientWidth);

  if (!isVisibleInScrollContainer) return null;

  return (
    <>
      {/* Same-line selection highlight */}
      {isSameLine && anchorPos && (
        <div
          className={`pointer-events-none z-10 ${posClass}`}
          style={{
            left: `${Math.min(anchorPos.x, headPos.x)}px`,
            top: `${headPos.y}px`,
            width: `${Math.abs(headPos.x - anchorPos.x)}px`,
            height: "1.35em",
            backgroundColor: `${color}28`,
            borderRadius: "2px",
          }}
        />
      )}

      {/* Cursor caret at head position */}
      <div
        className={`pointer-events-none z-20 ${posClass}`}
        style={{ left: `${headPos.x}px`, top: `${headPos.y}px` }}
      >
        {/* Name badge */}
        <div
          className="absolute bottom-full mb-1 left-0 px-2 py-1 rounded-md text-[11px] font-semibold text-white whitespace-nowrap leading-tight"
          style={{
            backgroundColor: color,
            boxShadow: `0 2px 8px ${color}60, 0 1px 3px rgba(0,0,0,0.25)`,
          }}
        >
          {user.name}
          {isRange && !isSameLine && <span className="ml-1 opacity-70">▋</span>}
        </div>
        {/* Cursor line */}
        <div
          className="remote-cursor-caret"
          style={{
            width: "2px",
            height: "1.4em",
            backgroundColor: color,
            borderRadius: "1px",
            boxShadow: `0 0 6px ${color}99, 0 0 2px ${color}`,
          }}
        />
      </div>
    </>
  );
}

export { ContentEditor, type ContentEditorProps, type ContentEditorRef };
