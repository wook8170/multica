import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { UploadResult } from "@multica/core/hooks/use-file-upload";
import { createSafeId } from "@multica/core/utils";

function findNodeEndByPredicate(editor: any, predicate: (node: any) => boolean): number | null {
  let found: number | null = null;
  editor.state.doc.descendants((node: any, pos: number) => {
    if (found !== null) return false;
    if (predicate(node)) {
      found = pos + node.nodeSize;
      return false;
    }
    return undefined;
  });
  return found;
}

/** Find and remove a fileCard node by uploadId. */
function removeUploadingFileCard(editor: any, uploadId: string) {
  const { tr } = editor.state;
  let deleted = false;
  editor.state.doc.descendants((node: any, pos: number) => {
    if (deleted) return false;
    if (node.type.name === "fileCard" && node.attrs.uploadId === uploadId) {
      tr.delete(pos, pos + node.nodeSize);
      deleted = true;
      return false;
    }
    return undefined;
  });
  if (deleted) editor.view.dispatch(tr);
}

/** Update a fileCard node from uploading state to final state with real URL. */
function finalizeFileCard(editor: any, uploadId: string, href: string) {
  const { tr } = editor.state;
  let updated = false;
  editor.state.doc.descendants((node: any, nodePos: number) => {
    if (updated) return false;
    if (node.type.name === "fileCard" && node.attrs.uploadId === uploadId) {
      tr.setNodeMarkup(nodePos, undefined, {
        ...node.attrs,
        href,
        uploading: false,
      });
      updated = true;
      return false;
    }
    return undefined;
  });
  if (updated) editor.view.dispatch(tr);
}
function removeImageBySrc(editor: any, src: string) {
  if (!editor) return;
  const { tr } = editor.state;
  let deleted = false;
  editor.state.doc.descendants((node: any, pos: number) => {
    if (deleted) return false;
    if (node.type.name === "image" && node.attrs.src === src) {
      tr.delete(pos, pos + node.nodeSize);
      deleted = true;
      return false;
    }
    return undefined;
  });
  if (deleted) editor.view.dispatch(tr);
}

/**
 * Shared upload flow: insert blob preview → upload → replace with real URL.
 * Used by paste, drop, toolbar upload, and imperative upload calls.
 */
export async function uploadAndInsertFile(
  editor: any,
  file: File,
  handler: (file: File) => Promise<UploadResult | null>,
  pos?: number,
): Promise<number | null> {
  const isImage = file.type.startsWith("image/");

  if (isImage) {
    const blobUrl = URL.createObjectURL(file);
    const imgAttrs = { src: blobUrl, alt: file.name, uploading: true };
    if (pos !== undefined) {
      editor.chain().focus().insertContentAt(pos, { type: "image", attrs: imgAttrs }).run();
    } else {
      editor.chain().focus().setImage(imgAttrs).run();
    }
    let insertedEnd = findNodeEndByPredicate(editor, (node) => node.type.name === "image" && node.attrs.src === blobUrl);

    try {
      const result = await handler(file);
      if (result) {
        const { tr } = editor.state;
        let found = false;
        editor.state.doc.descendants((node: { type: { name: string }; attrs: { src: string } }, nodePos: number) => {
          if (found) return false;
          if (node.type.name === "image" && node.attrs.src === blobUrl) {
            tr.setNodeMarkup(nodePos, undefined, {
              ...node.attrs,
              src: result.link,
              alt: result.filename,
              uploading: false,
            });
            found = true;
            return false;
          }
          return undefined;
        });
        if (found) editor.view.dispatch(tr);
      } else {
        removeImageBySrc(editor, blobUrl);
      }
    } catch {
      removeImageBySrc(editor, blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
    return insertedEnd;
  } else {
    // Non-image: insert skeleton fileCard → upload → finalize with real URL
    const uploadId = createSafeId();
    const cardAttrs = { filename: file.name, href: "", fileSize: file.size, uploading: true, uploadId };
    const insertContent = { type: "fileCard", attrs: cardAttrs };
    if (pos !== undefined) {
      editor.chain().focus().insertContentAt(pos, insertContent).run();
    } else {
      editor.chain().focus().insertContent(insertContent).run();
    }
    let insertedEnd = findNodeEndByPredicate(editor, (node) => node.type.name === "fileCard" && node.attrs.uploadId === uploadId);

    try {
      const result = await handler(file);
      if (result) {
        finalizeFileCard(editor, uploadId, result.link);
      } else {
        removeUploadingFileCard(editor, uploadId);
      }
    } catch {
      removeUploadingFileCard(editor, uploadId);
    }
    return insertedEnd;
  }
}

export async function uploadAndInsertFiles(
  editor: any,
  files: File[],
  handler: (file: File) => Promise<UploadResult | null>,
  pos?: number,
) {
  if (files.length === 0) return;

  const pendingFiles = files.map((file) => {
    if (file.type.startsWith("image/")) {
      const blobUrl = URL.createObjectURL(file);
      return {
        file,
        type: "image" as const,
        blobUrl,
        content: { type: "image", attrs: { src: blobUrl, alt: file.name, uploading: true } },
      };
    }

    const uploadId = crypto.randomUUID();
    return {
      file,
      type: "file" as const,
      uploadId,
      content: {
        type: "fileCard",
        attrs: { filename: file.name, href: "", fileSize: file.size, uploading: true, uploadId },
      },
    };
  });

  const insertPos = pos ?? editor.state.selection.to;
  editor.chain().focus().insertContentAt(insertPos, pendingFiles.map((pending) => pending.content)).run();

  await Promise.all(pendingFiles.map(async (pending) => {
    try {
      const result = await handler(pending.file);
      if (pending.type === "image") {
        if (result) {
          const { tr } = editor.state;
          let found = false;
          editor.state.doc.descendants((node: { type: { name: string }; attrs: { src: string } }, nodePos: number) => {
            if (found) return false;
            if (node.type.name === "image" && node.attrs.src === pending.blobUrl) {
              tr.setNodeMarkup(nodePos, undefined, {
                ...node.attrs,
                src: result.link,
                alt: result.filename,
                uploading: false,
              });
              found = true;
              return false;
            }
            return undefined;
          });
          if (found) editor.view.dispatch(tr);
        } else {
          removeImageBySrc(editor, pending.blobUrl);
        }
      } else if (result) {
        finalizeFileCard(editor, pending.uploadId, result.link);
      } else {
        removeUploadingFileCard(editor, pending.uploadId);
      }
    } catch {
      if (pending.type === "image") {
        removeImageBySrc(editor, pending.blobUrl);
      } else {
        removeUploadingFileCard(editor, pending.uploadId);
      }
    } finally {
      if (pending.type === "image") {
        URL.revokeObjectURL(pending.blobUrl);
      }
    }
  }));
}

export interface AmbiguousPastePayload {
  files: FileList;
  html: string;
}

export function createFileUploadExtension(
  onUploadFileRef: React.RefObject<((file: File) => Promise<UploadResult | null>) | undefined>,
  onAmbiguousPasteRef?: React.RefObject<((payload: AmbiguousPastePayload) => void) | undefined>,
) {
  return Extension.create({
    name: "fileUpload",
    addProseMirrorPlugins() {
      const { editor } = this;

      const handleFiles = async (files: FileList) => {
        const handler = onUploadFileRef.current;
        if (!handler) return false;
        await uploadAndInsertFiles(editor, Array.from(files), handler);
        return true;
      };

      return [
        new Plugin({
          key: new PluginKey("fileUpload"),
          props: {
            handlePaste(_view, event) {
              const files = event.clipboardData?.files;
              if (!files?.length) return false;
              if (!onUploadFileRef.current) return false;
              // If clipboard also has an HTML table (Excel, Google Sheets),
              // ask the user whether to paste as image or table.
              const html = event.clipboardData?.getData("text/html") ?? "";
              if (html.includes("<table") && onAmbiguousPasteRef?.current) {
                event.preventDefault();
                onAmbiguousPasteRef.current({ files, html });
                return true;
              }
              event.preventDefault();
              handleFiles(files);
              return true;
            },
            handleDrop(view, event) {
              const dragEvent = event as DragEvent;
              const files = dragEvent.dataTransfer?.files;
              if (!files?.length) return false;
              const handler = onUploadFileRef.current;
              if (!handler) return false;
              dragEvent.preventDefault();
              dragEvent.stopPropagation();
              // Resolve drop position from mouse coordinates; multi-file drops
              // are inserted sequentially from that same document position.
              const dropPos = view.posAtCoords({ left: dragEvent.clientX, top: dragEvent.clientY });
              uploadAndInsertFiles(editor, Array.from(files), handler, dropPos?.pos);
              return true;
            },
          },
        }),
      ];
    },
  });
}
