"use client";

/**
 * EditorBubbleMenu — floating formatting toolbar for text selection.
 *
 * Positioned with @floating-ui/react-dom (useFloating + autoUpdate) and
 * portaled to document.body via createPortal. This escapes ALL overflow
 * containers in the ancestor chain (Card overflow:hidden, scrollable
 * containers, etc.) while autoUpdate monitors every ancestor scroll
 * container to keep the menu anchored to the selection.
 *
 * Previously used Tiptap's <BubbleMenu> component, but that plugin:
 * - only supports a single scrollTarget (misses nested scroll)
 * - shows the element before computing position (flash on first show)
 * - uses position:absolute which gets clipped by overflow:hidden
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useFloating, offset, flip, shift, autoUpdate } from "@floating-ui/react-dom";
import { getOverflowAncestors } from "@floating-ui/dom";
import type { Editor } from "@tiptap/core";
import { posToDOMRect } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { Toggle } from "@multica/ui/components/ui/toggle";
import { Separator } from "@multica/ui/components/ui/separator";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@multica/ui/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@multica/ui/components/ui/dropdown-menu";
import { Input } from "@multica/ui/components/ui/input";
import { Button } from "@multica/ui/components/ui/button";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link2,
  List,
  ListOrdered,
  Quote,
  ChevronDown,
  Check,
  X,
  Unlink,
  Type,
  Heading1,
  Heading2,
  Heading3,
  Palette,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Trash2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Visibility logic
// ---------------------------------------------------------------------------

function shouldShowBubbleMenu(editor: Editor): boolean {
  if (!editor.isEditable) return false;
  // Don't check hasFocus() here — it's unreliable during transaction events.
  // Focus loss is handled separately by the debounced blur handler.
  const { state } = editor;
  const { selection } = state;
  if (selection.empty) return false;
  if (selection.constructor?.name === "CellSelection") return false;
  const { from, to } = selection;
  if (!state.doc.textBetween(from, to).length) return false;
  if (selection instanceof NodeSelection) return false;
  const $from = state.doc.resolve(from);
  if ($from.parent.type.name === "codeBlock") return false;
  return true;
}

function shouldShowTableBubbleMenu(editor: Editor): boolean {
  if (!editor.isEditable) return false;
  const selection = editor.state.selection as { constructor?: { name?: string }; empty?: boolean };
  return selection?.constructor?.name === "CellSelection" && !selection.empty;
}

/** Detect macOS for keyboard shortcut labels */
const isMac =
  typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
const mod = isMac ? "\u2318" : "Ctrl";

// ---------------------------------------------------------------------------
// Mark Toggle Button
// ---------------------------------------------------------------------------

type InlineMark = "bold" | "italic" | "strike" | "code";

type EditorCommand = (editor: Editor) => boolean;
type RunEditorCommand = (command: EditorCommand) => void;

const toggleMarkActions: Record<InlineMark, EditorCommand> = {
  bold: (e) => e.chain().focus().toggleBold().run(),
  italic: (e) => e.chain().focus().toggleItalic().run(),
  strike: (e) => e.chain().focus().toggleStrike().run(),
  code: (e) => e.chain().focus().toggleCode().run(),
};

interface CellSelectionLike {
  constructor?: { name?: string };
  $anchorCell?: { pos: number };
  $headCell?: { pos: number };
}

function createCellSelectionPreservingRunner(editor: Editor): RunEditorCommand {
  return (command) => {
    const selection = editor.state.selection as CellSelectionLike;
    const preserveCellSelection = selection?.constructor?.name === "CellSelection";
    const anchorCellPos = selection?.$anchorCell?.pos;
    const headCellPos = selection?.$headCell?.pos;

    command(editor);

    if (!preserveCellSelection) return;

    const commands = editor.commands as unknown as {
      setCellSelection?: (position: { anchorCell: number; headCell?: number }) => boolean;
    };
    if (!commands.setCellSelection) return;

    queueMicrotask(() => {
      const currentSelection = editor.state.selection as { constructor?: { name?: string } };
      if (currentSelection?.constructor?.name === "CellSelection") return;
      if (typeof anchorCellPos !== "number" || typeof headCellPos !== "number") return;

      const maxPos = editor.state.doc.content.size;
      const safeAnchor = Math.max(0, Math.min(anchorCellPos, maxPos));
      const safeHead = Math.max(0, Math.min(headCellPos, maxPos));
      commands.setCellSelection?.({ anchorCell: safeAnchor, headCell: safeHead });
    });
  };
}

function MarkButton({
  editor,
  mark,
  icon: Icon,
  label,
  shortcut,
  runCommand,
}: {
  editor: Editor;
  mark: InlineMark;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut: string;
  runCommand: RunEditorCommand;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle
            size="sm"
            pressed={editor.isActive(mark)}
            onClick={() => runCommand(toggleMarkActions[mark])}
            onMouseDown={(e) => e.preventDefault()}
          />
        }
      >
        <Icon className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8}>
        {label}
        <span className="ml-1.5 text-muted-foreground">{shortcut}</span>
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// URL normalisation
// ---------------------------------------------------------------------------

/** Protocols that can execute code in the browser — the only ones we block. */
const DANGEROUS_PROTOCOL_RE = /^(javascript|data|vbscript):/i;
const HAS_PROTOCOL_RE = /^[a-z][a-z0-9+.-]*:\/?\/?/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/")) return trimmed;
  if (DANGEROUS_PROTOCOL_RE.test(trimmed)) return "";
  if (HAS_PROTOCOL_RE.test(trimmed)) return trimmed;
  if (EMAIL_RE.test(trimmed)) return `mailto:${trimmed}`;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

// ---------------------------------------------------------------------------
// Link Edit Bar
// ---------------------------------------------------------------------------

function LinkEditBar({
  editor,
  onClose,
  runCommand,
}: {
  editor: Editor;
  onClose: () => void;
  runCommand: RunEditorCommand;
}) {
  const existingHref = editor.getAttributes("link").href as string | undefined;
  const [url, setUrl] = useState(existingHref ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  const apply = useCallback(() => {
    const href = normalizeUrl(url);
    if (!href) {
      runCommand((e) => e.chain().focus().extendMarkRange("link").unsetLink().run());
    } else {
      runCommand((e) => e.chain().focus().extendMarkRange("link").setLink({ href }).run());
    }
    onClose();
  }, [runCommand, url, onClose]);

  const remove = useCallback(() => {
    runCommand((e) => e.chain().focus().extendMarkRange("link").unsetLink().run());
    onClose();
  }, [runCommand, onClose]);

  return (
    <div
      className="bubble-menu-link-edit"
      onMouseDown={(e) => e.preventDefault()}
    >
      <Input
        ref={inputRef}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://..."
        aria-label="URL"
        className="h-7 flex-1 text-xs"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
            editor.commands.focus();
          }
        }}
      />
      <Button
        size="icon-xs"
        variant="ghost"
        onClick={apply}
        onMouseDown={(e) => e.preventDefault()}
      >
        <Check className="size-3.5" />
      </Button>
      {existingHref && (
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={remove}
          onMouseDown={(e) => e.preventDefault()}
        >
          <Unlink className="size-3.5" />
        </Button>
      )}
      <Button
        size="icon-xs"
        variant="ghost"
        onClick={() => {
          onClose();
          editor.commands.focus();
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Heading Dropdown
// ---------------------------------------------------------------------------

function HeadingDropdown({
  editor,
  onOpenChange,
  runCommand,
}: {
  editor: Editor;
  onOpenChange: (open: boolean) => void;
  runCommand: RunEditorCommand;
}) {
  const activeLevel = [1, 2, 3].find((l) =>
    editor.isActive("heading", { level: l }),
  );
  const label = activeLevel ? `H${activeLevel}` : "Text";
  const items = [
    { label: "Normal Text", icon: Type, active: !activeLevel, action: () => runCommand((e) => e.chain().focus().setParagraph().run()) },
    { label: "Heading 1", icon: Heading1, active: activeLevel === 1, action: () => runCommand((e) => e.chain().focus().toggleHeading({ level: 1 }).run()) },
    { label: "Heading 2", icon: Heading2, active: activeLevel === 2, action: () => runCommand((e) => e.chain().focus().toggleHeading({ level: 2 }).run()) },
    { label: "Heading 3", icon: Heading3, active: activeLevel === 3, action: () => runCommand((e) => e.chain().focus().toggleHeading({ level: 3 }).run()) },
  ];

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        className="inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-xs font-medium hover:bg-muted"
        onMouseDown={(e) => e.preventDefault()}
      >
        {label}
        <ChevronDown className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" sideOffset={8} align="start" className="w-auto">
        {items.map((item) => (
          <DropdownMenuItem key={item.label} onClick={item.action} className="gap-2 text-xs">
            <item.icon className="size-3.5" />
            {item.label}
            {item.active && <Check className="ml-auto size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// List Dropdown
// ---------------------------------------------------------------------------

function ListDropdown({
  editor,
  onOpenChange,
  runCommand,
}: {
  editor: Editor;
  onOpenChange: (open: boolean) => void;
  runCommand: RunEditorCommand;
}) {
  const isBullet = editor.isActive("bulletList");
  const isOrdered = editor.isActive("orderedList");

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              className="inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-xs font-medium hover:bg-muted aria-pressed:bg-muted"
              aria-pressed={isBullet || isOrdered}
              onMouseDown={(e) => e.preventDefault()}
            />
          }
        >
          <List className="size-3.5" />
          <ChevronDown className="size-3" />
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>List</TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="bottom" sideOffset={8} align="start" className="w-auto">
        <DropdownMenuItem onClick={() => runCommand((e) => e.chain().focus().toggleBulletList().run())} className="gap-2 text-xs">
          <List className="size-3.5" />
          Bullet List
          {isBullet && <Check className="ml-auto size-3.5" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => runCommand((e) => e.chain().focus().toggleOrderedList().run())} className="gap-2 text-xs">
          <ListOrdered className="size-3.5" />
          Ordered List
          {isOrdered && <Check className="ml-auto size-3.5" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TextFormattingControls({
  editor,
  runCommand,
  onOpenLinkEdit,
  onMenuOpenChange,
}: {
  editor: Editor;
  runCommand: RunEditorCommand;
  onOpenLinkEdit: () => void;
  onMenuOpenChange: (open: boolean) => void;
}) {
  return (
    <>
      <MarkButton editor={editor} mark="bold" icon={Bold} label="Bold" shortcut={`${mod}+B`} runCommand={runCommand} />
      <MarkButton editor={editor} mark="italic" icon={Italic} label="Italic" shortcut={`${mod}+I`} runCommand={runCommand} />
      <MarkButton editor={editor} mark="strike" icon={Strikethrough} label="Strikethrough" shortcut={`${mod}+Shift+S`} runCommand={runCommand} />
      <MarkButton editor={editor} mark="code" icon={Code} label="Code" shortcut={`${mod}+E`} runCommand={runCommand} />

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              size="sm"
              pressed={editor.isActive("link")}
              onClick={onOpenLinkEdit}
              onMouseDown={(e) => e.preventDefault()}
            />
          }
        >
          <Link2 className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>Link</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      <HeadingDropdown editor={editor} onOpenChange={onMenuOpenChange} runCommand={runCommand} />
      <ListDropdown editor={editor} onOpenChange={onMenuOpenChange} runCommand={runCommand} />
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              size="sm"
              pressed={editor.isActive("blockquote")}
              onClick={() => runCommand((e) => e.chain().focus().toggleBlockquote().run())}
              onMouseDown={(e) => e.preventDefault()}
            />
          }
        >
          <Quote className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>Quote</TooltipContent>
      </Tooltip>
    </>
  );
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

type TableActionIconType =
  | "add-row-above"
  | "add-row-below"
  | "add-col-left"
  | "add-col-right"
  | "delete-row"
  | "delete-col"
  | "merge"
  | "split";

function TableActionIcon({ type, className }: { type: TableActionIconType; className?: string }) {
  const stroke = "currentColor";
  const isDelete = type === "delete-row" || type === "delete-col";
  const actionTone = isDelete
    ? "color-mix(in srgb, var(--destructive) 24%, transparent)"
    : "color-mix(in srgb, #38bdf8 44%, transparent)";

  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={className ?? "h-4 w-4 shrink-0"}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke={stroke} strokeWidth="1.2" />

      {(type === "add-row-above" || type === "add-row-below" || type === "delete-row") && (
        <>
          <path d="M2 6h12M2 10h12" stroke={stroke} strokeWidth="1.1" />
          {type === "add-row-above" && <rect x="2.2" y="2.2" width="11.6" height="3.8" rx="0.8" fill={actionTone} />}
          {type === "add-row-below" && <rect x="2.2" y="10" width="11.6" height="3.8" rx="0.8" fill={actionTone} />}
          {type === "delete-row" && <rect x="2.2" y="6.3" width="11.6" height="3.4" rx="1" fill={actionTone} />}
        </>
      )}

      {(type === "add-col-left" || type === "add-col-right" || type === "delete-col") && (
        <>
          <path d="M6 2v12M10 2v12" stroke={stroke} strokeWidth="1.1" />
          {type === "add-col-left" && <rect x="2.2" y="2.2" width="3.8" height="11.6" rx="0.8" fill={actionTone} />}
          {type === "add-col-right" && <rect x="10" y="2.2" width="3.8" height="11.6" rx="0.8" fill={actionTone} />}
          {type === "delete-col" && <rect x="6.3" y="2.2" width="3.4" height="11.6" rx="1" fill={actionTone} />}
        </>
      )}

      {type === "merge" && (
        <>
          <path d="M8 2v12M2 8h12" stroke={stroke} strokeWidth="1.1" />
          <rect x="2.2" y="6.3" width="11.6" height="3.4" rx="1" fill={actionTone} />
        </>
      )}

      {type === "split" && (
        <>
          <path d="M2 8h12M8 2v12" stroke={stroke} strokeWidth="1.1" />
          <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="1" fill={actionTone} />
        </>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main Bubble Menu — useFloating + portal to body
// ---------------------------------------------------------------------------

function EditorBubbleMenu({ editor }: { editor: Editor }) {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<"toolbar" | "link-edit">("toolbar");

  // Virtual reference that tracks the text selection.
  // contextElement tells autoUpdate where to find scroll ancestors.
  const virtualRef = useMemo(
    () => ({
      getBoundingClientRect: () => {
        const { from, to } = editor.state.selection;
        return posToDOMRect(editor.view, from, to);
      },
      contextElement: editor.view.dom,
    }),
    [editor],
  );

  const { refs, floatingStyles, isPositioned, update } = useFloating({
    strategy: "fixed",
    placement: "top",
    open: visible,
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    elements: { reference: virtualRef },
    whileElementsMounted: autoUpdate,
  });

  // Show/hide based on selection state — no blur/focus handling.
  useEffect(() => {
    const onTransaction = () => {
      const show = shouldShowBubbleMenu(editor);
      setVisible(show);
      // Must call update() manually — autoUpdate can't detect virtual
      // reference movement (it's not a real DOM element).
      if (show) update();
    };
    editor.on("transaction", onTransaction);
    return () => { editor.off("transaction", onTransaction); };
  }, [editor, update]);

  // Close on outside click (mousedown not in editor and not in menu)
  useEffect(() => {
    if (!visible) return;
    const handle = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (editor.view.dom.contains(target)) return;
      if (target.closest(".bubble-menu") || target.closest(".bubble-menu-link-edit")) return;
      if (target.closest("[data-slot='dropdown-menu-content']") || target.closest("[data-slot='dropdown-menu-trigger']")) return;
      setVisible(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [visible, editor]);

  // Close on any ancestor scroll or window resize
  useEffect(() => {
    if (!visible) return;
    const close = () => {
      setVisible(false);
    };
    const ancestors = getOverflowAncestors(editor.view.dom);
    ancestors.forEach((el) => el.addEventListener("scroll", close, { passive: true }));
    window.addEventListener("resize", close);
    return () => {
      ancestors.forEach((el) => el.removeEventListener("scroll", close));
      window.removeEventListener("resize", close);
    };
  }, [visible, editor]);

  // Reset mode on selection change
  useEffect(() => {
    const handler = () => setMode("toolbar");
    editor.on("selectionUpdate", handler);
    return () => { editor.off("selectionUpdate", handler); };
  }, [editor]);

  // Refocus editor when Base UI dropdown closes
  const handleMenuOpenChange = useCallback(
    (open: boolean) => { if (!open) editor.commands.focus(); },
    [editor],
  );
  const runCommand = useCallback<RunEditorCommand>((command) => {
    command(editor);
  }, [editor]);

  const openLinkEdit = useCallback(() => setMode("link-edit"), []);
  const closeLinkEdit = useCallback(() => {
    setMode("toolbar");
    editor.commands.focus();
  }, [editor]);

  return createPortal(
    <div
      ref={refs.setFloating}
      style={{
        ...floatingStyles,
        zIndex: 50,
        // display:none when hidden — no residual animations from children.
        // Also hide until Floating UI has computed position (isPositioned)
        // to avoid a flash at top:0 left:0.
        display: visible && isPositioned ? undefined : "none",
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {mode === "link-edit" ? (
        <LinkEditBar editor={editor} onClose={closeLinkEdit} runCommand={runCommand} />
      ) : (
        <TooltipProvider delay={300}>
          <div className="bubble-menu">
            <TextFormattingControls
              editor={editor}
              runCommand={runCommand}
              onOpenLinkEdit={openLinkEdit}
              onMenuOpenChange={handleMenuOpenChange}
            />
          </div>
        </TooltipProvider>
      )}
    </div>,
    document.body,
  );
}

function TableBubbleMenu({
  editor,
  canMutateTable,
  canMergeCells,
  canSplitCell,
  applyCellAttribute,
  currentCellTextAlign,
}: {
  editor: Editor;
  canMutateTable: boolean;
  canMergeCells: boolean;
  canSplitCell: boolean;
  applyCellAttribute: (attribute: "backgroundColor" | "textColor" | "textAlign", value: string | null) => void;
  currentCellTextAlign: "left" | "center" | "right";
}) {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<"toolbar" | "link-edit">("toolbar");

  const virtualRef = useMemo(
    () => ({
      getBoundingClientRect: () => {
        const { from, to } = editor.state.selection;
        return posToDOMRect(editor.view, from, to);
      },
      contextElement: editor.view.dom,
    }),
    [editor],
  );

  const { refs, floatingStyles, isPositioned, update } = useFloating({
    strategy: "fixed",
    placement: "top",
    open: visible,
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    elements: { reference: virtualRef },
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    const onTransaction = () => {
      const show = shouldShowTableBubbleMenu(editor);
      setVisible(show);
      if (show) update();
    };
    editor.on("transaction", onTransaction);
    return () => { editor.off("transaction", onTransaction); };
  }, [editor, update]);

  useEffect(() => {
    if (!visible) return;
    const handle = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (editor.view.dom.contains(target)) return;
      if (target.closest(".table-bubble-menu")) return;
      if (target.closest(".bubble-menu-link-edit")) return;
      if (target.closest("[data-slot='dropdown-menu-content']") || target.closest("[data-slot='dropdown-menu-trigger']")) return;
      setVisible(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [visible, editor]);

  useEffect(() => {
    const handler = () => setMode("toolbar");
    editor.on("selectionUpdate", handler);
    return () => { editor.off("selectionUpdate", handler); };
  }, [editor]);

  const handleMenuOpenChange = useCallback(
    (open: boolean) => { if (!open) editor.commands.focus(); },
    [editor],
  );
  const runCommand = useMemo(() => createCellSelectionPreservingRunner(editor), [editor]);
  const openLinkEdit = useCallback(() => setMode("link-edit"), []);
  const closeLinkEdit = useCallback(() => {
    setMode("toolbar");
    editor.commands.focus();
  }, [editor]);

  return createPortal(
    <div
      ref={refs.setFloating}
      style={{
        ...floatingStyles,
        zIndex: 50,
        display: visible && isPositioned ? undefined : "none",
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {mode === "link-edit" ? (
        <LinkEditBar editor={editor} onClose={closeLinkEdit} runCommand={runCommand} />
      ) : (
      <div className="table-bubble-menu">
        <TooltipProvider delay={300}>
          <TextFormattingControls
            editor={editor}
            runCommand={runCommand}
            onOpenLinkEdit={openLinkEdit}
            onMenuOpenChange={handleMenuOpenChange}
          />

          <Separator orientation="vertical" className="mx-0.5 h-5" />

          <Tooltip>
            <TooltipTrigger
              render={
                <Toggle
                  size="sm"
                  disabled={!canMutateTable}
                  onClick={() => editor.chain().focus().addRowBefore().run()}
                  onMouseDown={(e) => e.preventDefault()}
                />
              }
            >
              <TableActionIcon type="add-row-above" className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8}>Add row above</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Toggle
                  size="sm"
                  disabled={!canMutateTable}
                  onClick={() => editor.chain().focus().addRowAfter().run()}
                  onMouseDown={(e) => e.preventDefault()}
                />
              }
            >
              <TableActionIcon type="add-row-below" className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8}>Add row below</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Toggle
                  size="sm"
                  disabled={!canMutateTable}
                  onClick={() => editor.chain().focus().deleteRow().run()}
                  onMouseDown={(e) => e.preventDefault()}
                />
              }
            >
              <TableActionIcon type="delete-row" className="size-4 text-destructive" />
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8}>Delete row</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="mx-0.5 h-5" />

          <Tooltip>
            <TooltipTrigger
              render={
                <Toggle
                  size="sm"
                  disabled={!canMutateTable}
                  onClick={() => editor.chain().focus().addColumnBefore().run()}
                  onMouseDown={(e) => e.preventDefault()}
                />
              }
            >
              <TableActionIcon type="add-col-left" className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8}>Add column left</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Toggle
                  size="sm"
                  disabled={!canMutateTable}
                  onClick={() => editor.chain().focus().addColumnAfter().run()}
                  onMouseDown={(e) => e.preventDefault()}
                />
              }
            >
              <TableActionIcon type="add-col-right" className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8}>Add column right</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Toggle
                  size="sm"
                  disabled={!canMutateTable}
                  onClick={() => editor.chain().focus().deleteColumn().run()}
                  onMouseDown={(e) => e.preventDefault()}
                />
              }
            >
              <TableActionIcon type="delete-col" className="size-4 text-destructive" />
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8}>Delete column</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="mx-0.5 h-5" />

          <Tooltip>
            <TooltipTrigger
              render={
                <Toggle
                  size="sm"
                  disabled={!canMergeCells}
                  onClick={() => editor.chain().focus().mergeCells().run()}
                  onMouseDown={(e) => e.preventDefault()}
                />
              }
            >
              <TableActionIcon type="merge" className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8}>Merge cells</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Toggle
                  size="sm"
                  disabled={!canSplitCell}
                  onClick={() => editor.chain().focus().splitCell().run()}
                  onMouseDown={(e) => e.preventDefault()}
                />
              }
            >
              <TableActionIcon type="split" className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8}>Split cell</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="mx-0.5 h-5" />

          <DropdownMenu onOpenChange={handleMenuOpenChange}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DropdownMenuTrigger
                    disabled={!canMutateTable}
                    className="inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-xs font-medium hover:bg-muted"
                    onMouseDown={(e) => e.preventDefault()}
                  />
                }
              >
                <Palette className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={8}>Cell background</TooltipContent>
            </Tooltip>
            <DropdownMenuContent side="bottom" sideOffset={8} align="start" className="w-56">
              <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">Cell background</div>
              <div className="grid grid-cols-4 gap-2 px-2 py-1.5">
                {TABLE_BG_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    disabled={!canMutateTable}
                    className="h-6 w-6 rounded border border-border disabled:opacity-40"
                    style={{ backgroundColor: color }}
                    onClick={() => applyCellAttribute("backgroundColor", color)}
                    title={color}
                  />
                ))}
              </div>
              <DropdownMenuItem disabled={!canMutateTable} onClick={() => applyCellAttribute("backgroundColor", null)}>
                Clear background
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu onOpenChange={handleMenuOpenChange}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DropdownMenuTrigger
                    disabled={!canMutateTable}
                    className="inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-xs font-medium hover:bg-muted"
                    onMouseDown={(e) => e.preventDefault()}
                  />
                }
              >
                <Type className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={8}>Cell text color</TooltipContent>
            </Tooltip>
            <DropdownMenuContent side="bottom" sideOffset={8} align="start" className="w-56">
              <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">Cell text color</div>
              <div className="grid grid-cols-4 gap-2 px-2 py-1.5">
                {TABLE_TEXT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    disabled={!canMutateTable}
                    className="h-6 w-6 rounded border border-border disabled:opacity-40"
                    style={{ backgroundColor: color }}
                    onClick={() => applyCellAttribute("textColor", color)}
                    title={color}
                  />
                ))}
              </div>
              <DropdownMenuItem disabled={!canMutateTable} onClick={() => applyCellAttribute("textColor", null)}>
                Clear text color
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu onOpenChange={handleMenuOpenChange}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DropdownMenuTrigger
                    disabled={!canMutateTable}
                    className="inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-xs font-medium hover:bg-muted"
                    onMouseDown={(e) => e.preventDefault()}
                  />
                }
              >
                {currentCellTextAlign === "center" ? <AlignCenter className="size-3.5" /> : currentCellTextAlign === "right" ? <AlignRight className="size-3.5" /> : <AlignLeft className="size-3.5" />}
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={8}>Cell text align</TooltipContent>
            </Tooltip>
            <DropdownMenuContent side="bottom" sideOffset={8} align="start" className="w-44">
              <DropdownMenuItem disabled={!canMutateTable} onClick={() => applyCellAttribute("textAlign", "left")}>
                <AlignLeft className="mr-2 size-4" />
                Left
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!canMutateTable} onClick={() => applyCellAttribute("textAlign", "center")}>
                <AlignCenter className="mr-2 size-4" />
                Center
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!canMutateTable} onClick={() => applyCellAttribute("textAlign", "right")}>
                <AlignRight className="mr-2 size-4" />
                Right
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Separator orientation="vertical" className="mx-0.5 h-5" />

          <Tooltip>
            <TooltipTrigger
              render={
                <Toggle
                  size="sm"
                  disabled={!canMutateTable}
                  onClick={() => editor.chain().focus().deleteTable().run()}
                  onMouseDown={(e) => e.preventDefault()}
                />
              }
            >
              <Trash2 className="size-3.5 text-destructive" />
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8}>Delete table</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      )}
    </div>,
    document.body,
  );
}

export { EditorBubbleMenu, TableBubbleMenu };
