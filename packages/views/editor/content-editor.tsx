import {
  Bold, Italic, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, CheckSquare, Plus,
  Quote, Minus, Link as LinkIcon, Paperclip, Table as TableIcon,
  RotateCcw, Rows3, Columns3, Palette, Type, Trash2,
  AlignLeft, AlignCenter, AlignRight,
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
import { buildStyledTableNodeFromHtml } from "./utils/table-from-html";
import { Button } from "@multica/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@multica/ui/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@multica/ui/components/ui/context-menu";
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
import "./content-editor.css";
import type { AmbiguousPastePayload } from "./extensions/file-upload";

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

interface AmbiguousPasteState {
  open: boolean;
  files: File[];
  html: string;
}

interface TableEdgeControlsState {
  visible: boolean;
  rightVisible: boolean;
  bottomVisible: boolean;
  rightX: number;
  rightY: number;
  bottomX: number;
  bottomY: number;
}

const TABLE_BG_COLORS = [
  "#ffffff",
  "#fef3c7",
  "#dbeafe",
  "#dcfce7",
  "#fee2e2",
  "#ede9fe",
  "#fce7f3",
  "#f3f4f6",
];

const TABLE_TEXT_COLORS = [
  "#111827",
  "#1d4ed8",
  "#166534",
  "#b91c1c",
  "#6d28d9",
  "#92400e",
  "#0f766e",
  "#6b7280",
];

const TABLE_BG_COLOR_MENU = [
  { label: "Default", value: "#ffffff" },
  { label: "Yellow", value: "#fef3c7" },
  { label: "Blue", value: "#dbeafe" },
  { label: "Green", value: "#dcfce7" },
  { label: "Red", value: "#fee2e2" },
  { label: "Violet", value: "#ede9fe" },
  { label: "Pink", value: "#fce7f3" },
  { label: "Gray", value: "#f3f4f6" },
];

const TABLE_TEXT_COLOR_MENU = [
  { label: "Default", value: "#111827" },
  { label: "Blue", value: "#1d4ed8" },
  { label: "Green", value: "#166534" },
  { label: "Red", value: "#b91c1c" },
  { label: "Violet", value: "#6d28d9" },
  { label: "Brown", value: "#92400e" },
  { label: "Teal", value: "#0f766e" },
  { label: "Gray", value: "#6b7280" },
];

function extractFirstTableHtml(html: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const table = doc.querySelector("table");
    return table?.outerHTML ?? html;
  } catch {
    return html;
  }
}

function looksLikeHtmlContent(value: string): boolean {
  const trimmed = value.trim();
  return /^<\/?[a-z][^>]*>/i.test(trimmed);
}

function editorNeedsHtmlPersistence(editor: any): boolean { // eslint-disable-line @typescript-eslint/no-explicit-any
  let needsHtml = false;
  editor.state.doc.descendants((node: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (needsHtml) return false;
    if (node.type?.name !== "tableCell" && node.type?.name !== "tableHeader") return undefined;
    const attrs = node.attrs || {};
    const hasStyle = !!attrs.backgroundColor || !!attrs.textColor || !!attrs.textAlign;
    const hasMerge = (attrs.colspan ?? 1) > 1 || (attrs.rowspan ?? 1) > 1;
    if (hasStyle || hasMerge) {
      needsHtml = true;
      return false;
    }
    return undefined;
  });
  return needsHtml;
}

function setEditorContent(editor: any, value: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!value) {
    editor.commands.clearContent();
    return;
  }
  if (looksLikeHtmlContent(value)) {
    editor.commands.setContent(value);
    return;
  }
  editor.commands.setContent(preprocessMarkdown(value), { contentType: "markdown" });
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
    const onAmbiguousPasteRef = useRef<((payload: AmbiguousPastePayload) => void) | undefined>(undefined);
    const [ambiguousPaste, setAmbiguousPaste] = useState<AmbiguousPasteState>({
      open: false,
      files: [],
      html: "",
    });
    const [tableEdgeControls, setTableEdgeControls] = useState<TableEdgeControlsState>({
      visible: false,
      rightVisible: false,
      bottomVisible: false,
      rightX: 0,
      rightY: 0,
      bottomX: 0,
      bottomY: 0,
    });
    const tableActionTargetsRef = useRef<{
      rowCell: HTMLTableCellElement | null;
      colCell: HTMLTableCellElement | null;
    }>({ rowCell: null, colCell: null });

    onUpdateRef.current = onUpdate;
    onSubmitRef.current = onSubmit;
    onBlurRef.current = onBlur;
    onUploadFileRef.current = onUploadFile;
    onAmbiguousPasteRef.current = (payload) => {
      setAmbiguousPaste({
        open: true,
        files: Array.from(payload.files),
        html: payload.html,
      });
    };

    const queryClient = useQueryClient();

    const editor = useEditor({
      immediatelyRender: false,
      editable,
      content: ydoc ? undefined : (defaultValue ? (looksLikeHtmlContent(defaultValue) ? defaultValue : preprocessMarkdown(defaultValue)) : ""),
      contentType: defaultValue && !ydoc && !looksLikeHtmlContent(defaultValue) ? "markdown" : undefined,
      extensions: createEditorExtensions({
        editable,
        placeholder: placeholderText,
        queryClient,
        onSubmitRef,
        onUploadFileRef,
        onAmbiguousPasteRef,
        ydoc,
        provider,
        user,
        field,
      }),
      onUpdate: ({ editor: ed }) => {
        if (!onUpdateRef.current) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          const nextContent = editorNeedsHtmlPersistence(ed)
            ? ed.getHTML()
            : ed.getMarkdown().replace(/&nbsp;/g, " ").replace(/\u00a0/g, " ");
          onUpdateRef.current?.(nextContent);
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

    const inTable = !!editor && (editor.isActive("table") || editor.isActive("tableCell") || editor.isActive("tableHeader"));
    const canMutateTable = inTable && editable;
    const canMergeCells = canMutateTable && editor.can().chain().focus().mergeCells().run();
    const canSplitCell = canMutateTable && editor.can().chain().focus().splitCell().run();
    const applyCellAttribute = useCallback((attribute: "backgroundColor" | "textColor" | "textAlign", value: string | null) => {
      if (!editor || !editor.isActive("table")) return;
      editor.chain().focus().setCellAttribute(attribute, value).run();
    }, [editor]);
    const currentCellTextAlign = (editor?.getAttributes("tableCell").textAlign
      ?? editor?.getAttributes("tableHeader").textAlign
      ?? "left") as "left" | "center" | "right";

    const focusEditorAtMouse = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
      if (!editor) return;
      const currentSelection = editor.state.selection as { constructor?: { name?: string } };
      if (currentSelection?.constructor?.name === "CellSelection") return;
      const inTableDom = (event.target as HTMLElement | null)?.closest("td, th");
      if (!inTableDom) return;
      const pos = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
      if (!pos) return;
      editor.chain().focus().setTextSelection(pos.pos).run();
    }, [editor]);

    const hideTableEdgeControls = useCallback(() => {
      setTableEdgeControls((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      tableActionTargetsRef.current = { rowCell: null, colCell: null };
    }, []);

    const syncTableEdgeControls = useCallback((table: HTMLTableElement | null, pointerX: number, pointerY: number) => {
      const scrollContainer = scrollContainerRef.current;
      if (!table || !scrollContainer || !table.isConnected) {
        hideTableEdgeControls();
        return;
      }

      const cells = Array.from(table.querySelectorAll("td, th")) as HTMLTableCellElement[];
      if (cells.length === 0) {
        hideTableEdgeControls();
        return;
      }

      let rightCell = cells[0] ?? null;
      let bottomCell = cells[0] ?? null;
      let maxRight = Number.NEGATIVE_INFINITY;
      let maxBottom = Number.NEGATIVE_INFINITY;

      for (const item of cells) {
        const r = item.getBoundingClientRect();
        if (r.right > maxRight) {
          maxRight = r.right;
          rightCell = item;
        }
        if (r.bottom > maxBottom) {
          maxBottom = r.bottom;
          bottomCell = item;
        }
      }

      const containerRect = scrollContainer.getBoundingClientRect();
      const tableRect = table.getBoundingClientRect();
      const left = tableRect.left - containerRect.left + scrollContainer.scrollLeft;
      const top = tableRect.top - containerRect.top + scrollContainer.scrollTop;
      const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
      const xWithinTable = clamp(pointerX - tableRect.left, 8, Math.max(8, tableRect.width - 8));
      const yWithinTable = clamp(pointerY - tableRect.top, 8, Math.max(8, tableRect.height - 8));

      const borderThreshold = 10;
      const nearRightBorder = Math.abs(pointerX - tableRect.right) <= borderThreshold;
      const nearBottomBorder = Math.abs(pointerY - tableRect.bottom) <= borderThreshold;
      const pointerInsideVertical = pointerY >= tableRect.top && pointerY <= tableRect.bottom;
      const pointerInsideHorizontal = pointerX >= tableRect.left && pointerX <= tableRect.right;
      const showRight = nearRightBorder && pointerInsideVertical;
      const showBottom = nearBottomBorder && pointerInsideHorizontal;

      if (!showRight && !showBottom) {
        hideTableEdgeControls();
        return;
      }

      const nextControls: TableEdgeControlsState = {
        visible: true,
        rightVisible: showRight,
        bottomVisible: showBottom,
        rightX: left + tableRect.width,
        rightY: top + yWithinTable,
        bottomX: left + xWithinTable,
        bottomY: top + tableRect.height,
      };

      tableActionTargetsRef.current = { rowCell: bottomCell, colCell: rightCell };
      setTableEdgeControls(nextControls);
    }, [hideTableEdgeControls]);

    const handleEditorMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
      if (!editable || !editor) {
        hideTableEdgeControls();
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-table-edge-controls='true']")) return;
      const cell = target?.closest("td, th") as HTMLTableCellElement | null;
      if (!cell) {
        hideTableEdgeControls();
        return;
      }
      const table = cell.closest("table") as HTMLTableElement | null;
      if (!table) {
        hideTableEdgeControls();
        return;
      }
      syncTableEdgeControls(table, event.clientX, event.clientY);
    }, [editable, editor, hideTableEdgeControls, syncTableEdgeControls]);

    const handleEditorMouseLeave = useCallback(() => {
      hideTableEdgeControls();
    }, [hideTableEdgeControls]);

    const runTableEdgeAction = useCallback((action: "add-row" | "delete-row" | "add-col" | "delete-col") => {
      if (!editor) return;
      const targetCell = action === "add-row" || action === "delete-row"
        ? tableActionTargetsRef.current.rowCell
        : tableActionTargetsRef.current.colCell;
      if (!targetCell) return;

      const rect = targetCell.getBoundingClientRect();
      const pos = editor.view.posAtCoords({
        left: rect.left + Math.max(6, Math.min(rect.width - 6, rect.width * 0.5)),
        top: rect.top + Math.max(6, Math.min(rect.height - 6, rect.height * 0.5)),
      });
      if (!pos) return;

      editor.chain().focus().setTextSelection(pos.pos).run();

      let ran = false;
      if (action === "add-row") ran = editor.chain().focus().addRowAfter().run();
      if (action === "delete-row") ran = editor.chain().focus().deleteRow().run();
      if (action === "add-col") ran = editor.chain().focus().addColumnAfter().run();
      if (action === "delete-col") ran = editor.chain().focus().deleteColumn().run();
      if (!ran) return;

      if (action === "delete-row" || action === "delete-col") {
        hideTableEdgeControls();
        return;
      }

      const table = targetCell.closest("table") as HTMLTableElement | null;
      requestAnimationFrame(() => {
        if (!table) return;
        const tableRect = table.getBoundingClientRect();
        const scrollContainer = scrollContainerRef.current;
        const containerRect = scrollContainer?.getBoundingClientRect();
        const pointerX = action === "add-col"
          ? tableRect.right - 1
          : (scrollContainer && containerRect
            ? containerRect.left + tableEdgeControls.bottomX - scrollContainer.scrollLeft
            : tableRect.left + (tableRect.width / 2));
        const pointerY = action === "add-row"
          ? tableRect.bottom - 1
          : (scrollContainer && containerRect
            ? containerRect.top + tableEdgeControls.rightY - scrollContainer.scrollTop
            : tableRect.top + (tableRect.height / 2));
        syncTableEdgeControls(table, pointerX, pointerY);
      });
    }, [editor, hideTableEdgeControls, syncTableEdgeControls, tableEdgeControls.bottomX, tableEdgeControls.rightY]);

    const handleFileClick = () => fileInputRef.current?.click();
    const closeAmbiguousPaste = () => {
      setAmbiguousPaste({ open: false, files: [], html: "" });
    };
    const handlePasteAsImage = () => {
      if (!editor || !onUploadFileRef.current || ambiguousPaste.files.length === 0) {
        closeAmbiguousPaste();
        return;
      }
      uploadAndInsertFiles(
        editor,
        ambiguousPaste.files,
        onUploadFileRef.current,
        editor.state.selection.to,
      );
      closeAmbiguousPaste();
    };
    const handlePasteAsTable = () => {
      if (!editor || !ambiguousPaste.html) {
        closeAmbiguousPaste();
        return;
      }
      const tableNode = buildStyledTableNodeFromHtml(ambiguousPaste.html);
      if (tableNode) {
        editor.chain().focus().insertContent(tableNode).run();
      } else {
        const tableHtml = extractFirstTableHtml(ambiguousPaste.html);
        editor.chain().focus().insertContent(tableHtml).run();
      }
      closeAmbiguousPaste();
    };

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
          setEditorContent(editor, defaultValue);
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
      setEditorContent(editor, defaultValue);
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
        <AlertDialog open={ambiguousPaste.open} onOpenChange={(open) => { if (!open) closeAmbiguousPaste(); }}>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Paste spreadsheet content as</AlertDialogTitle>
              <AlertDialogDescription>
                We detected both a table and an image in your clipboard. Choose how to paste it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={closeAmbiguousPaste}>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="outline" onClick={handlePasteAsTable}>
                Paste as table
              </AlertDialogAction>
              <AlertDialogAction onClick={handlePasteAsImage}>
                Paste as image
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
              <ToolbarButton onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive("taskList")} title="Task List">
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

              <DropdownMenu>
                <DropdownMenuTrigger className="flex h-7 items-center rounded-md px-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                  <Rows3 className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuGroup>
                    <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">Rows</div>
                    <DropdownMenuItem disabled={!inTable} onClick={() => editor.chain().focus().addRowBefore().run()}>
                      Add row above
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!inTable} onClick={() => editor.chain().focus().addRowAfter().run()}>
                      Add row below
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={!inTable} onClick={() => editor.chain().focus().deleteRow().run()}>
                    <TableActionIcon type="delete-row" className="mr-2 text-destructive" />
                    Delete row
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger className="flex h-7 items-center rounded-md px-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                  <Columns3 className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuGroup>
                    <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">Columns</div>
                    <DropdownMenuItem disabled={!inTable} onClick={() => editor.chain().focus().addColumnBefore().run()}>
                      Add column left
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!inTable} onClick={() => editor.chain().focus().addColumnAfter().run()}>
                      Add column right
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={!inTable} onClick={() => editor.chain().focus().deleteColumn().run()}>
                    <TableActionIcon type="delete-col" className="mr-2 text-destructive" />
                    Delete column
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger className="flex h-7 items-center rounded-md px-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                  <Palette className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuGroup>
                    <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">Cell background</div>
                    <div className="grid grid-cols-4 gap-2 px-2 py-1.5">
                      {TABLE_BG_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          disabled={!inTable}
                          className="h-6 w-6 rounded border border-border disabled:opacity-40"
                          style={{ backgroundColor: color }}
                          onClick={() => applyCellAttribute("backgroundColor", color)}
                          title={color}
                        />
                      ))}
                    </div>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={!inTable} onClick={() => applyCellAttribute("backgroundColor", null)}>
                    Clear background
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger className="flex h-7 items-center rounded-md px-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                  <Type className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuGroup>
                    <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">Cell text color</div>
                    <div className="grid grid-cols-4 gap-2 px-2 py-1.5">
                      {TABLE_TEXT_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          disabled={!inTable}
                          className="h-6 w-6 rounded border border-border disabled:opacity-40"
                          style={{ backgroundColor: color }}
                          onClick={() => applyCellAttribute("textColor", color)}
                          title={color}
                        />
                      ))}
                    </div>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={!inTable} onClick={() => applyCellAttribute("textColor", null)}>
                    Clear text color
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger className="flex h-7 items-center rounded-md px-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                  {currentCellTextAlign === "center" ? <AlignCenter className="size-3.5" /> : currentCellTextAlign === "right" ? <AlignRight className="size-3.5" /> : <AlignLeft className="size-3.5" />}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuGroup>
                    <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">Cell text align</div>
                    <DropdownMenuItem disabled={!inTable} onClick={() => applyCellAttribute("textAlign", "left")}>
                      <AlignLeft className="mr-2 size-4" />
                      Left
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!inTable} onClick={() => applyCellAttribute("textAlign", "center")}>
                      <AlignCenter className="mr-2 size-4" />
                      Center
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!inTable} onClick={() => applyCellAttribute("textAlign", "right")}>
                      <AlignRight className="mr-2 size-4" />
                      Right
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <ToolbarButton onClick={() => editor.chain().focus().deleteTable().run()} title="Delete Table" active={false} disabled={!inTable}>
                <Trash2 className="size-3.5" />
              </ToolbarButton>
            </div>
            
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} multiple />
          </div>
        )}
        {/* scrollContainerRef: used by RemoteCursor for absolute position calculation */}
        {/* pt-7: reserve space so the name badge (rendered above the caret) isn't clipped at the top */}
        <ContextMenu>
          <ContextMenuTrigger
            onContextMenuCapture={focusEditorAtMouse}
            className="block h-full"
          >
            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto relative pt-7"
              onMouseMove={handleEditorMouseMove}
              onMouseLeave={handleEditorMouseLeave}
            >
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

              {editable && tableEdgeControls.visible && (
                <>
                  {tableEdgeControls.rightVisible && (
                    <div
                      data-table-edge-controls="true"
                      className="absolute z-30 flex flex-col gap-0.5 rounded-lg border border-border/90 bg-background/92 p-0.5 shadow-[0_4px_14px_rgba(0,0,0,0.08)] backdrop-blur"
                      style={{
                        left: `${tableEdgeControls.rightX}px`,
                        top: `${tableEdgeControls.rightY}px`,
                        transform: "translate(-50%, -50%)",
                      }}
                    >
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-md text-sky-700 hover:bg-sky-500/14"
                        title="Add column"
                        onClick={() => runTableEdgeAction("add-col")}
                      >
                        <Plus className="size-3" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-md text-destructive hover:bg-destructive/12"
                        title="Delete column"
                        onClick={() => runTableEdgeAction("delete-col")}
                      >
                        <Minus className="size-3" />
                      </button>
                    </div>
                  )}

                  {tableEdgeControls.bottomVisible && (
                    <div
                      data-table-edge-controls="true"
                      className="absolute z-30 flex items-center gap-0.5 rounded-lg border border-border/90 bg-background/92 p-0.5 shadow-[0_4px_14px_rgba(0,0,0,0.08)] backdrop-blur"
                      style={{
                        left: `${tableEdgeControls.bottomX}px`,
                        top: `${tableEdgeControls.bottomY}px`,
                        transform: "translate(-50%, -50%)",
                      }}
                    >
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-md text-sky-700 hover:bg-sky-500/14"
                        title="Add row"
                        onClick={() => runTableEdgeAction("add-row")}
                      >
                        <Plus className="size-3" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-md text-destructive hover:bg-destructive/12"
                        title="Delete row"
                        onClick={() => runTableEdgeAction("delete-row")}
                      >
                        <Minus className="size-3" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </ContextMenuTrigger>

          <ContextMenuContent className="w-56">
            <ContextMenuGroup>
              <ContextMenuItem disabled={!canMutateTable} onClick={() => editor.chain().focus().addRowBefore().run()}>
                <TableActionIcon type="add-row-above" className="mr-2" />
                Add row above
              </ContextMenuItem>
              <ContextMenuItem disabled={!canMutateTable} onClick={() => editor.chain().focus().addRowAfter().run()}>
                <TableActionIcon type="add-row-below" className="mr-2" />
                Add row below
              </ContextMenuItem>
              <ContextMenuItem disabled={!canMutateTable} onClick={() => editor.chain().focus().deleteRow().run()}>
                <TableActionIcon type="delete-row" className="mr-2 text-destructive" />
                Delete row
              </ContextMenuItem>
            </ContextMenuGroup>

            <ContextMenuSeparator />

            <ContextMenuGroup>
              <ContextMenuItem disabled={!canMutateTable} onClick={() => editor.chain().focus().addColumnBefore().run()}>
                <TableActionIcon type="add-col-left" className="mr-2" />
                Add column left
              </ContextMenuItem>
              <ContextMenuItem disabled={!canMutateTable} onClick={() => editor.chain().focus().addColumnAfter().run()}>
                <TableActionIcon type="add-col-right" className="mr-2" />
                Add column right
              </ContextMenuItem>
              <ContextMenuItem disabled={!canMutateTable} onClick={() => editor.chain().focus().deleteColumn().run()}>
                <TableActionIcon type="delete-col" className="mr-2 text-destructive" />
                Delete column
              </ContextMenuItem>
            </ContextMenuGroup>

            <ContextMenuSeparator />

            <ContextMenuGroup>
              <ContextMenuItem disabled={!canMergeCells} onClick={() => editor.chain().focus().mergeCells().run()}>
                <TableActionIcon type="merge" className="mr-2" />
                Merge cells
              </ContextMenuItem>
              <ContextMenuItem disabled={!canSplitCell} onClick={() => editor.chain().focus().splitCell().run()}>
                <TableActionIcon type="split" className="mr-2" />
                Split cell
              </ContextMenuItem>
            </ContextMenuGroup>

            <ContextMenuSeparator />

            <ContextMenuSub>
              <ContextMenuSubTrigger disabled={!canMutateTable}>
                <Palette className="mr-2 size-4" />
                Cell background
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                {TABLE_BG_COLOR_MENU.map((color) => (
                  <ContextMenuItem key={color.value} disabled={!canMutateTable} onClick={() => applyCellAttribute("backgroundColor", color.value)}>
                    <span className="mr-2 inline-block h-4 w-4 rounded-sm border border-border" style={{ backgroundColor: color.value }} />
                    {color.label}
                  </ContextMenuItem>
                ))}
                <ContextMenuSeparator />
                <ContextMenuItem disabled={!canMutateTable} onClick={() => applyCellAttribute("backgroundColor", null)}>
                  <RotateCcw className="mr-2 size-4 text-muted-foreground" />
                  Clear background
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuSub>
              <ContextMenuSubTrigger disabled={!canMutateTable}>
                <Type className="mr-2 size-4" />
                Cell text color
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                {TABLE_TEXT_COLOR_MENU.map((color) => (
                  <ContextMenuItem key={color.value} disabled={!canMutateTable} onClick={() => applyCellAttribute("textColor", color.value)}>
                    <span className="mr-2 inline-block h-4 w-4 rounded-full border border-border" style={{ backgroundColor: color.value }} />
                    {color.label}
                  </ContextMenuItem>
                ))}
                <ContextMenuSeparator />
                <ContextMenuItem disabled={!canMutateTable} onClick={() => applyCellAttribute("textColor", null)}>
                  <RotateCcw className="mr-2 size-4 text-muted-foreground" />
                  Clear text color
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuSub>
              <ContextMenuSubTrigger disabled={!canMutateTable}>
                <AlignLeft className="mr-2 size-4" />
                Cell text align
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-44">
                <ContextMenuItem disabled={!canMutateTable} onClick={() => applyCellAttribute("textAlign", "left")}>
                  <AlignLeft className="mr-2 size-4" />
                  Left
                </ContextMenuItem>
                <ContextMenuItem disabled={!canMutateTable} onClick={() => applyCellAttribute("textAlign", "center")}>
                  <AlignCenter className="mr-2 size-4" />
                  Center
                </ContextMenuItem>
                <ContextMenuItem disabled={!canMutateTable} onClick={() => applyCellAttribute("textAlign", "right")}>
                  <AlignRight className="mr-2 size-4" />
                  Right
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuSeparator />

            <ContextMenuItem
              variant="destructive"
              disabled={!canMutateTable}
              onClick={() => editor.chain().focus().deleteTable().run()}
            >
              <Trash2 className="mr-2 size-4" />
              Delete table
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>
    );
  },
);

type TableActionIconType =
  | "add-row-above"
  | "add-row-below"
  | "add-col-left"
  | "add-col-right"
  | "delete-row"
  | "delete-col"
  | "merge"
  | "split";

const TableActionIcon = ({ type, className }: { type: TableActionIconType; className?: string }) => {
  const stroke = "currentColor";
  const highlightStrong = "color-mix(in srgb, #38bdf8 36%, transparent)";
  const highlightSoft = "color-mix(in srgb, #38bdf8 24%, transparent)";
  const deleteHighlight = "color-mix(in srgb, var(--destructive) 26%, transparent)";

  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={cn("h-4 w-4 shrink-0 text-muted-foreground", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke={stroke} strokeWidth="1.2" />

      {(type === "add-row-above" || type === "add-row-below") && (
        <>
          <path d="M2 6h12M2 10h12" stroke={stroke} strokeWidth="1.1" />
          {type === "add-row-above"
            ? <rect x="2.2" y="2.2" width="11.6" height="2.8" rx="0.8" fill={highlightStrong} />
            : <rect x="2.2" y="11" width="11.6" height="2.8" rx="0.8" fill={highlightStrong} />}
        </>
      )}

      {(type === "add-col-left" || type === "add-col-right") && (
        <>
          <path d="M6 2v12M10 2v12" stroke={stroke} strokeWidth="1.1" />
          {type === "add-col-left"
            ? <rect x="2.2" y="2.2" width="2.8" height="11.6" rx="0.8" fill={highlightStrong} />
            : <rect x="11" y="2.2" width="2.8" height="11.6" rx="0.8" fill={highlightStrong} />}
        </>
      )}

      {type === "merge" && (
        <>
          <path d="M8 2v12M2 8h12" stroke={stroke} strokeWidth="1.1" />
          <rect x="2.2" y="6.3" width="11.6" height="3.4" rx="1" fill={highlightStrong} />
        </>
      )}

      {type === "split" && (
        <>
          <path d="M2 8h12M8 2v12" stroke={stroke} strokeWidth="1.1" />
          <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="1" fill={highlightSoft} />
        </>
      )}

      {type === "delete-row" && (
        <>
          <path d="M2 6h12M2 10h12" stroke={stroke} strokeWidth="1.1" />
          <rect x="2.2" y="6.3" width="11.6" height="3.4" rx="1" fill={deleteHighlight} />
        </>
      )}

      {type === "delete-col" && (
        <>
          <path d="M6 2v12M10 2v12" stroke={stroke} strokeWidth="1.1" />
          <rect x="6.3" y="2.2" width="3.4" height="11.6" rx="1" fill={deleteHighlight} />
        </>
      )}
    </svg>
  );
};

const ToolbarButton = ({ children, onClick, active, title, disabled }: any) => (
  <Button
    type="button"
    variant={active ? "secondary" : "ghost"}
    size="icon-sm"
    onClick={onClick}
    title={title}
    disabled={disabled}
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
