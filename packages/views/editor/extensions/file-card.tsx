"use client";

/**
 * FileCard — Tiptap node extension for rendering uploaded non-image files
 * as styled cards instead of plain markdown links.
 *
 * Markdown serialization: `[filename](href)` — standard link syntax.
 * Preprocessing in preprocess.ts converts standalone CDN file links back
 * to fileCard HTML on load, completing the roundtrip.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Eye, Loader2, Download, Trash2 } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import { AttachmentFileIcon, getAttachmentFileKind } from "../attachment-file-icon";


// ---------------------------------------------------------------------------
// CDN URL detection
// ---------------------------------------------------------------------------

const IMAGE_EXTS = /\.(png|jpe?g|gif|webp|svg|ico|bmp|tiff?)$/i;
// Uploaded files are keyed as {uuid}.{ext} regardless of CDN/MinIO/S3 domain
const UPLOAD_UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i;

/** Check if a URL points to an uploaded file (any storage backend). */
export function isCdnUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      UPLOAD_UUID_RE.test(u.pathname) ||
      u.hostname.endsWith(".copilothub.ai") ||
      u.hostname.endsWith(".amazonaws.com")
    );
  } catch {
    return false;
  }
}

/** Check if an uploaded URL is a non-image file that should render as a file card. */
export function isFileCardUrl(url: string): boolean {
  return isCdnUrl(url) && !IMAGE_EXTS.test(new URL(url).pathname);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Shared React view
// ---------------------------------------------------------------------------

function MarkdownFilePreview({
  href,
  filename,
  editable,
  onDelete,
}: {
  href: string;
  filename: string;
  editable: boolean;
  onDelete?: () => void;
}) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [content, setContent] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!href || !isPreviewOpen) return;
    let cancelled = false;
    setContent("");
    setError(false);
    fetch(href)
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => { cancelled = true; };
  }, [href, isPreviewOpen]);

  return (
    <>
      <div
        className="attachment-card-shell attachment-card-header flex items-center gap-2 px-2.5 py-1 transition-colors hover:bg-muted"
        contentEditable={false}
      >
        <div className="attachment-title flex-1">
          {editable && (
            <span className="attachment-drag-handle" data-drag-handle aria-hidden="true" />
          )}
          <AttachmentFileIcon href={href} filename={filename} className="size-4" />
          <p className="truncate text-sm">{filename || "Markdown"}</p>
        </div>
        <div className="attachment-actions">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="attachment-action-button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsPreviewOpen((open) => !open);
            }}
            title={isPreviewOpen ? "Hide markdown preview" : "Show markdown preview"}
          >
            <Eye className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="attachment-action-button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              window.open(href, "_blank", "noopener,noreferrer");
            }}
            title="Download markdown"
          >
            <Download className="size-3.5" />
          </Button>
          {editable && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="attachment-action-button attachment-action-button-destructive"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete?.();
              }}
              title="Delete markdown attachment"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
      {isPreviewOpen && error && (
        <div className="attachment-card-shell attachment-preview-error">
          Unable to load markdown preview.
        </div>
      )}
      {isPreviewOpen && !error && !content && (
        <div className="attachment-card-shell attachment-preview-loading">
          Loading markdown preview...
        </div>
      )}
      {isPreviewOpen && !error && content && (
        <div className="attachment-card-shell markdown-file-preview-content">
          <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>
            {content}
          </ReactMarkdown>
        </div>
      )}
    </>
  );
}

export function AttachmentCard({
  href,
  filename,
  uploading = false,
  editable = false,
  onDelete,
}: {
  href: string;
  filename: string;
  uploading?: boolean;
  editable?: boolean;
  onDelete?: () => void;
}) {
  const kind = getAttachmentFileKind(href, filename);

  const openFile = () => {
    window.open(href, "_blank", "noopener,noreferrer");
  };

  if (!uploading && kind === "markdown" && href) {
    return (
      <div className="file-card-node" data-type="fileCard" contentEditable={false}>
        <MarkdownFilePreview href={href} filename={filename} editable={editable} onDelete={onDelete} />
      </div>
    );
  }

  return (
    <div className="file-card-node" data-type="fileCard" contentEditable={false}>
      <div
        className="attachment-card-shell attachment-card-header flex items-center gap-2 px-2.5 py-1 transition-colors hover:bg-muted"
        contentEditable={false}
      >
        {editable && (
          <span className="attachment-drag-handle" data-drag-handle aria-hidden="true" />
        )}
        {uploading ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <AttachmentFileIcon href={href} filename={filename} className="size-4" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{uploading ? `Uploading ${filename}` : filename}</p>
        </div>
        <div className="attachment-actions">
          {!uploading && href && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="attachment-action-button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openFile();
              }}
              title="Download attachment"
            >
              <Download className="size-3.5" />
            </Button>
          )}
          {editable && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="attachment-action-button attachment-action-button-destructive"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete?.();
              }}
              title="Delete attachment"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {!uploading && kind === "pdf" && href && (
        <div className="attachment-preview pdf-file-preview">
          <iframe src={`${href}#toolbar=0&navpanes=0`} title={filename || "PDF preview"} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// React NodeView
// ---------------------------------------------------------------------------

function FileCardView({ node, editor, deleteNode }: NodeViewProps) {
  const href = (node.attrs.href as string) || "";
  const filename = (node.attrs.filename as string) || "";
  const uploading = node.attrs.uploading as boolean;

  return (
    <NodeViewWrapper as="div" className="file-card-node-wrapper" data-type="fileCard">
      <AttachmentCard
        href={href}
        filename={filename}
        uploading={uploading}
        editable={editor.isEditable}
        onDelete={deleteNode}
      />
    </NodeViewWrapper>
  );
}

// ---------------------------------------------------------------------------
// Tiptap Node Extension
// ---------------------------------------------------------------------------

export const FileCardExtension = Node.create({
  name: "fileCard",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      href: {
        default: "",
        rendered: false, // Don't put href on DOM — prevents link behavior
      },
      filename: {
        default: "",
        rendered: false,
      },
      fileSize: {
        default: 0,
        rendered: false,
      },
      uploading: {
        default: false,
        rendered: false,
      },
      uploadId: {
        default: null,
        rendered: false,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="fileCard"]',
        getAttrs: (el) => ({
          href: (el as HTMLElement).getAttribute("data-href"),
          filename: (el as HTMLElement).getAttribute("data-filename"),
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "fileCard",
        "data-href": node.attrs.href,
        "data-filename": node.attrs.filename,
      }),
    ];
  },

  // Markdown serialization: fileCard → [filename](href)
  renderMarkdown: (node: any) => {
    const { href, filename } = node.attrs || {};
    return `[${filename || "file"}](${href})`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileCardView);
  },
});
