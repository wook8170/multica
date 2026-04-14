"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import {
  Maximize2,
  Download,
  Link as LinkIcon,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@multica/ui/lib/utils";

// ---------------------------------------------------------------------------
// Lightbox — full-screen image preview (ESC or click backdrop to close)
// ---------------------------------------------------------------------------

function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 cursor-zoom-out"
      onClick={onClose}
    >
      <img
        src={src}
        alt={alt}
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Image NodeView — renders img with hover toolbar + lightbox
// ---------------------------------------------------------------------------

function ImageView({ node, editor, selected, deleteNode }: NodeViewProps) {
  const src = node.attrs.src as string;
  const alt = (node.attrs.alt as string) || "";
  const title = node.attrs.title as string | undefined;
  const uploading = node.attrs.uploading as boolean;
  const width = node.attrs.width as number | null;

  const [lightbox, setLightbox] = useState(false);
  const [dragging, setDragging] = useState(false);
  const isEditable = editor.isEditable;

  const handleView = () => setLightbox(true);

  const handleDownload = () => {
    // Cross-origin CDN images can't be fetched as blob (CORS),
    // and <a download> is ignored for cross-origin URLs.
    // Open in new tab — user can right-click → Save As.
    window.open(src, "_blank", "noopener,noreferrer");
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(src);
      toast.success("Link copied");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleResizeStart = (side: "left" | "right" | "top" | "bottom", event: React.MouseEvent<HTMLButtonElement>) => {
    if (!isEditable || uploading) return;
    event.preventDefault();
    event.stopPropagation();

    const figure = (event.currentTarget.closest("figure") as HTMLElement | null);
    if (!figure) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = width && Number.isFinite(width) && width > 0 ? width : figure.getBoundingClientRect().width;
    const minWidth = 120;
    const maxWidth = figure.parentElement?.getBoundingClientRect().width ?? window.innerWidth;

    setDragging(true);

    const onMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const adjustedDelta =
        side === "right"
          ? deltaX
          : side === "left"
            ? -deltaX
            : side === "bottom"
              ? deltaY
              : -deltaY;
      const next = Math.max(minWidth, Math.min(maxWidth, Math.round(startWidth + adjustedDelta)));
      editor.commands.updateAttributes("image", { width: next });
    };

    const onUp = () => {
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <NodeViewWrapper className="image-node">
      <figure
          className={cn(
            "image-figure",
            selected && isEditable && "image-selected",
          )}
          contentEditable={false}
          onClick={!isEditable && !uploading ? handleView : undefined}
        >
        {isEditable && (
          <span
            className="image-drag-handle"
            data-drag-handle
            title="Drag to move image"
            onClick={(e) => e.stopPropagation()}
            aria-hidden="true"
          />
        )}
        <img
          src={src}
          alt={alt}
          title={title || undefined}
          className={cn("image-content", uploading && "image-uploading")}
          style={width && Number.isFinite(width) && width > 0 ? { width: `${width}px` } : undefined}
          draggable={false}
        />
        {isEditable && !uploading && (
          <>
            <button
              type="button"
              className={cn("image-resize-edge image-resize-edge--left", dragging && "image-resize-active")}
              onMouseDown={(event) => handleResizeStart("left", event)}
              title="Drag to resize image"
            />
            <button
              type="button"
              className={cn("image-resize-edge image-resize-edge--top", dragging && "image-resize-active")}
              onMouseDown={(event) => handleResizeStart("top", event)}
              title="Drag to resize image"
            />
            <button
              type="button"
              className={cn("image-resize-edge image-resize-edge--right", dragging && "image-resize-active")}
              onMouseDown={(event) => handleResizeStart("right", event)}
              title="Drag to resize image"
            />
            <button
              type="button"
              className={cn("image-resize-edge image-resize-edge--bottom", dragging && "image-resize-active")}
              onMouseDown={(event) => handleResizeStart("bottom", event)}
              title="Drag to resize image"
            />
          </>
        )}
        {!uploading && (
          <div
            className="image-toolbar"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={handleView} title="View image">
              <Maximize2 className="size-3.5" />
            </button>
            <button type="button" onClick={handleDownload} title="Download">
              <Download className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={handleCopyLink}
              title="Copy link"
            >
              <LinkIcon className="size-3.5" />
            </button>
            {isEditable && (
              <button
                type="button"
                onClick={() => deleteNode()}
                title="Delete"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        )}
      </figure>
      {lightbox && (
        <ImageLightbox
          src={src}
          alt={alt}
          onClose={() => setLightbox(false)}
        />
      )}
    </NodeViewWrapper>
  );
}

export { ImageView, ImageLightbox };
