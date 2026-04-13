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
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { Table } from "@tiptap/extension-table";
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
import { createFileUploadExtension } from "./file-upload";
import { FileCardExtension } from "./file-card";
import { ImageView } from "./image-view";

const lowlight = createLowlight(common);

const LinkEditable = Link.extend({ inclusive: false }).configure({
  openOnClick: true,
  autolink: true,
  linkOnPaste: false,
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
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
}).configure({
  inline: false,
  allowBase64: false,
});

export interface EditorExtensionsOptions {
  editable: boolean;
  placeholder?: string;
  queryClient?: import("@tanstack/react-query").QueryClient;
  onSubmitRef?: RefObject<(() => void) | undefined>;
  onUploadFileRef?: RefObject<
    ((file: File) => Promise<UploadResult | null>) | undefined
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
    editable ? LinkEditable : LinkReadonly,
    ImageExtension,
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
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
      createFileUploadExtension(options.onUploadFileRef!),
    );
  }

  return extensions;
}
