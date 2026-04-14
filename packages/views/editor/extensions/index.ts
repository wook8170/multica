/**
 * Shared extension factory for ContentEditor.
 */
import type { RefObject } from "react";
import StarterKit from "@tiptap/starter-kit";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Typography from "@tiptap/extension-typography";
import Image from "@tiptap/extension-image";
import TableRow from "@tiptap/extension-table-row";
import BaseTableHeader from "@tiptap/extension-table-header";
import BaseTableCell from "@tiptap/extension-table-cell";
import { Table } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown } from "@tiptap/markdown";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type { AnyExtension } from "@tiptap/core";
import type { UploadResult } from "@multica/core/hooks/use-file-upload";
import Collaboration from "@tiptap/extension-collaboration";
import { BaseMentionExtension } from "./mention-extension";
import { createMentionSuggestion } from "./mention-suggestion";
import { CodeBlockView } from "./code-block-view";
import { createMarkdownPasteExtension } from "./markdown-paste";
import { createSubmitExtension } from "./submit-shortcut";
import { createFileUploadExtension, type AmbiguousPastePayload } from "./file-upload";
import { FileCardExtension } from "./file-card";
import { ImageView } from "./image-view";
import { TableDeleteShortcutExtension } from "./table-delete-shortcut";

const lowlight = createLowlight(common);

const LinkEditable = Link.extend({ inclusive: false }).configure({
  openOnClick: false,
  autolink: true,
  linkOnPaste: true,
  defaultProtocol: "https",
});

const LinkReadonly = Link.configure({
  openOnClick: false,
  autolink: false,
});

const ImageExtension = Image.extend({
  draggable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      uploading: {
        default: false,
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.uploading ? { "data-uploading": "" } : {},
        parseHTML: (el: HTMLElement) => el.hasAttribute("data-uploading"),
      },
      width: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute("data-width") || el.getAttribute("width") || "";
          const parsed = Number.parseInt(raw, 10);
          return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          const width = attrs.width as number | null;
          return width && Number.isFinite(width) && width > 0
            ? { "data-width": String(Math.round(width)), width: String(Math.round(width)) }
            : {};
        },
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
}).configure({
  inline: false,
  allowBase64: false,
});

const TableCell = BaseTableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.backgroundColor || null,
        renderHTML: (attrs: Record<string, unknown>) => {
          const backgroundColor = attrs.backgroundColor as string | null;
          const textColor = attrs.textColor as string | null;
          const textAlign = attrs.textAlign as "left" | "center" | "right" | null;
          const styles = [
            backgroundColor ? `background-color: ${backgroundColor}` : null,
            textColor ? `color: ${textColor}` : null,
            textAlign ? `text-align: ${textAlign}` : null,
          ].filter(Boolean).join("; ");
          return styles ? { style: styles } : {};
        },
      },
      textColor: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.color || null,
        renderHTML: () => ({}),
      },
      textAlign: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const value = (element.style.textAlign || "").toLowerCase();
          if (value === "center") return "center";
          if (value === "right" || value === "end") return "right";
          return null;
        },
        renderHTML: () => ({}),
      },
    };
  },
});

const TableHeader = BaseTableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.backgroundColor || null,
        renderHTML: (attrs: Record<string, unknown>) => {
          const backgroundColor = attrs.backgroundColor as string | null;
          const textColor = attrs.textColor as string | null;
          const textAlign = attrs.textAlign as "left" | "center" | "right" | null;
          const styles = [
            backgroundColor ? `background-color: ${backgroundColor}` : null,
            textColor ? `color: ${textColor}` : null,
            textAlign ? `text-align: ${textAlign}` : null,
          ].filter(Boolean).join("; ");
          return styles ? { style: styles } : {};
        },
      },
      textColor: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.color || null,
        renderHTML: () => ({}),
      },
      textAlign: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const value = (element.style.textAlign || "").toLowerCase();
          if (value === "center") return "center";
          if (value === "right" || value === "end") return "right";
          return null;
        },
        renderHTML: () => ({}),
      },
    };
  },
});

export interface EditorExtensionsOptions {
  editable: boolean;
  placeholder?: string;
  queryClient?: import("@tanstack/react-query").QueryClient;
  onSubmitRef?: RefObject<(() => void) | undefined>;
  onUploadFileRef?: RefObject<
    ((file: File) => Promise<UploadResult | null>) | undefined
  >;
  onAmbiguousPasteRef?: RefObject<
    ((payload: AmbiguousPastePayload) => void) | undefined
  >;
  // Collaboration — typed as any to avoid ydoc/HocuspocusProvider peer-dep type errors
  ydoc?: any;
  provider?: any;
  user?: { name: string; color: string };
  field?: string;
}

export function createEditorExtensions(
  options: EditorExtensionsOptions,
): AnyExtension[] {
  const { editable, placeholder: placeholderText, ydoc } = options;

  const extensions: AnyExtension[] = [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: false,
      codeBlock: false,
      // Disable built-in history when collaborating (Collaboration extension provides undo/redo via Y.js)
      // @ts-expect-error - history extension can be disabled via false
      history: ydoc ? false : undefined,
    }),
    CodeBlockLowlight.extend({
      addNodeView() {
        return ReactNodeViewRenderer(CodeBlockView);
      },
    }).configure({ lowlight }),
    // ⚠️ Link MUST appear before markdownPaste in this array.
    // linkOnPaste relies on Link's handlePaste plugin firing first;
    // markdownPaste's handlePaste is a catch-all that returns true.
    editable ? LinkEditable : LinkReadonly,
    ImageExtension,
    Table.configure({
      resizable: editable,
      handleWidth: 10,
      cellMinWidth: 80,
      lastColumnResizable: true,
      allowTableNodeSelection: true,
    }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    Markdown,
    FileCardExtension,
    BaseMentionExtension.configure({
      HTMLAttributes: { class: "mention" },
      ...(editable && options.queryClient ? { suggestion: createMentionSuggestion(options.queryClient) } : {}),
    }),
  ];

  // Collaboration extension: binds Y.XmlFragment directly to ProseMirror state.
  // Remote changes are applied as proper ProseMirror transactions — no setContent(),
  // no manual observe(), no cursor mapping hacks needed.
  if (ydoc) {
    extensions.push(
      Collaboration.configure({ document: ydoc, field: options.field || "content" }),
    );
  }

  if (editable) {
    extensions.push(
      Typography,
      Placeholder.configure({ placeholder: placeholderText }),
      createMarkdownPasteExtension(),
      createSubmitExtension(() => options.onSubmitRef?.current?.()),
      createFileUploadExtension(options.onUploadFileRef!, options.onAmbiguousPasteRef),
      TableDeleteShortcutExtension,
    );
  }

  return extensions;
}
