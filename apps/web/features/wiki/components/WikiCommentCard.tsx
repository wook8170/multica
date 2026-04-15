"use client";

import { useRef, useState, useEffect } from "react";
import { ArrowUp, ChevronRight, Copy, Download, FileText, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@multica/ui/components/ui/card";
import { Button } from "@multica/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@multica/ui/components/ui/dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent } from "@multica/ui/components/ui/tooltip";
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
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@multica/ui/components/ui/collapsible";
import { ActorAvatar } from "@multica/views/common/actor-avatar";
import { cn } from "@multica/ui/lib/utils";
import { useActorName } from "@multica/core/workspace/hooks";
import { timeAgo } from "@multica/core/utils";
import { ContentEditor, type ContentEditorRef, copyMarkdown, ReadonlyContent, useFileDropZone, FileDropOverlay } from "@multica/views/editor";
import { FileUploadButton } from "@multica/ui/components/common/file-upload-button";
import { useFileUpload } from "@multica/core/hooks/use-file-upload";
import { api } from "@multica/core/api";
import type { WikiComment, Attachment } from "@multica/core/types";

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------

function DeleteCommentDialog({
  open,
  onOpenChange,
  onConfirm,
  hasReplies,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  hasReplies?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete comment</AlertDialogTitle>
          <AlertDialogDescription>
            {hasReplies
              ? "This comment and all its replies will be permanently deleted. This cannot be undone."
              : "This comment will be permanently deleted. This cannot be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Attachment list
// ---------------------------------------------------------------------------

function AttachmentList({ attachments, content, className }: { attachments?: Attachment[]; content?: string; className?: string }) {
  if (!attachments?.length) return null;
  const standalone = content
    ? attachments.filter((a) => !content.includes(a.url))
    : attachments;
  if (!standalone.length) return null;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {standalone.map((a) => (
        <div
          key={a.id}
          className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5 py-1 transition-colors hover:bg-muted"
        >
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{a.filename}</p>
          </div>
          {a.download_url && (
            <button
              type="button"
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              onClick={() => window.open(a.download_url, "_blank", "noopener,noreferrer")}
            >
              <Download className="size-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WikiReplyInput — inline reply composer (mirrors ReplyInput from issues)
// ---------------------------------------------------------------------------

interface WikiReplyInputProps {
  wikiId: string;
  placeholder?: string;
  avatarType: string;
  avatarId: string;
  onSubmit: (content: string, attachmentIds?: string[]) => Promise<void>;
  size?: "sm" | "default";
}

function WikiReplyInput({
  wikiId,
  placeholder = "Leave a reply...",
  avatarType,
  avatarId,
  onSubmit,
  size = "default",
}: WikiReplyInputProps) {
  const editorRef = useRef<ContentEditorRef>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const { uploadWithToast } = useFileUpload(api);
  const { isDragOver, dropZoneProps } = useFileDropZone({
    onDrop: (files) => editorRef.current?.uploadFiles(files),
  });

  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setIsExpanded(entry.contentRect.height > 32);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleUpload = async (file: File) => {
    const result = await uploadWithToast(file, { wikiId });
    if (result) {
      setAttachmentIds((prev) => [...prev, result.id]);
    }
    return result;
  };

  const handleSubmit = async () => {
    const content = editorRef.current?.getMarkdown()?.replace(/(\n\s*)+$/, "").trim();
    if (!content || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(content, attachmentIds.length > 0 ? attachmentIds : undefined);
      editorRef.current?.clearContent();
      setIsEmpty(true);
      setAttachmentIds([]);
    } finally {
      setSubmitting(false);
    }
  };

  const avatarSize = size === "sm" ? 22 : 28;

  return (
    <div className="group/editor flex items-start gap-2.5">
      <ActorAvatar actorType={avatarType} actorId={avatarId} size={avatarSize} className="mt-0.5 shrink-0" />
      <div
        {...dropZoneProps}
        className={cn(
          "relative min-w-0 flex-1 flex flex-col",
          size === "sm" ? "max-h-40" : "max-h-56",
          isExpanded && "pb-7",
        )}
      >
        <div className="flex-1 min-h-0 overflow-y-auto pr-14">
          <div ref={measureRef}>
            <ContentEditor
              ref={editorRef}
              placeholder={placeholder}
              onUpdate={(md) => setIsEmpty(!md.trim())}
              onSubmit={handleSubmit}
              onUploadFile={handleUpload}
              debounceMs={100}
            />
          </div>
        </div>
        <div className="absolute bottom-0 right-0 flex items-center gap-1 text-muted-foreground transition-colors group-focus-within/editor:text-foreground">
          <FileUploadButton size="sm" onSelect={(file) => editorRef.current?.uploadFiles([file])} />
          <button
            type="button"
            disabled={isEmpty || submitting}
            onClick={handleSubmit}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowUp className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        {isDragOver && <FileDropOverlay />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WikiCommentRow — single reply row rendered inside a Card
// ---------------------------------------------------------------------------

function WikiCommentRow({
  wikiId,
  comment,
  currentUserId,
  onEdit,
  onDelete,
}: {
  wikiId: string;
  comment: WikiComment;
  currentUserId?: string;
  onEdit: (commentId: string, content: string) => Promise<void>;
  onDelete: (commentId: string) => void;
}) {
  const { getActorName } = useActorName();
  const [editing, setEditing] = useState(false);
  const editEditorRef = useRef<ContentEditorRef>(null);
  const cancelledRef = useRef(false);
  const { uploadWithToast } = useFileUpload(api);
  const { isDragOver, dropZoneProps } = useFileDropZone({
    onDrop: (files) => editEditorRef.current?.uploadFiles(files),
    enabled: editing,
  });
  const isOwn = comment.author_type === "member" && comment.author_id === currentUserId;
  const isTemp = comment.id.startsWith("temp-");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cancelEdit = () => { cancelledRef.current = true; setEditing(false); };

  const saveEdit = async () => {
    if (cancelledRef.current) return;
    const trimmed = editEditorRef.current?.getMarkdown()?.replace(/(\n\s*)+$/, "").trim();
    if (!trimmed || trimmed === comment.content.trim()) { setEditing(false); return; }
    try {
      await onEdit(comment.id, trimmed);
      setEditing(false);
    } catch {
      toast.error("Failed to update comment");
    }
  };

  return (
    <div className={`py-3${isTemp ? " opacity-60" : ""}`}>
      <div className="flex items-center gap-2.5">
        <ActorAvatar actorType={comment.author_type} actorId={comment.author_id} size={24} />
        <span className="text-sm font-medium">{getActorName(comment.author_type, comment.author_id)}</span>
        <Tooltip>
          <TooltipTrigger render={<span className="text-xs text-muted-foreground cursor-default">{timeAgo(comment.created_at)}</span>} />
          <TooltipContent side="top">{new Date(comment.created_at).toLocaleString()}</TooltipContent>
        </Tooltip>
        {!isTemp && (
          <div className="ml-auto flex items-center gap-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-xs" className="text-muted-foreground"><MoreHorizontal className="h-4 w-4" /></Button>}
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => { copyMarkdown(comment.content); toast.success("Copied"); }}>
                  <Copy className="h-3.5 w-3.5" />Copy
                </DropdownMenuItem>
                {isOwn && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => { cancelledRef.current = false; setEditing(true); }}>
                      <Pencil className="h-3.5 w-3.5" />Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setConfirmDelete(true)} variant="destructive">
                      <Trash2 className="h-3.5 w-3.5" />Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <DeleteCommentDialog open={confirmDelete} onOpenChange={setConfirmDelete} onConfirm={() => onDelete(comment.id)} />
          </div>
        )}
      </div>

      {editing ? (
        <div
          {...dropZoneProps}
          className="relative mt-1.5 pl-8"
          onKeyDown={(e) => { if (e.key === "Escape") cancelEdit(); }}
        >
          <div className="text-sm leading-relaxed">
            <ContentEditor
              ref={editEditorRef}
              defaultValue={comment.content}
              placeholder="Edit comment..."
              onSubmit={saveEdit}
              onUploadFile={(file) => uploadWithToast(file, { wikiId })}
              debounceMs={100}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <FileUploadButton size="sm" onSelect={(file) => editEditorRef.current?.uploadFiles([file])} />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
              <Button size="sm" variant="outline" onClick={saveEdit}>Save</Button>
            </div>
          </div>
          {isDragOver && <FileDropOverlay />}
        </div>
      ) : (
        <>
          <div className="mt-1.5 pl-8 text-sm leading-relaxed text-foreground/85">
            <ReadonlyContent content={comment.content} />
          </div>
          <AttachmentList attachments={comment.attachments} content={comment.content} className="mt-1.5 pl-8" />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WikiCommentCard — one Card per thread (parent + all replies inside)
// ---------------------------------------------------------------------------

interface WikiCommentCardProps {
  wikiId: string;
  comment: WikiComment;
  allReplies: Map<string, WikiComment[]>;
  currentUserId?: string;
  onReply: (parentId: string, content: string, attachmentIds?: string[]) => Promise<void>;
  onEdit: (commentId: string, content: string) => Promise<void>;
  onDelete: (commentId: string) => void;
}

export function WikiCommentCard({
  wikiId,
  comment,
  allReplies,
  currentUserId,
  onReply,
  onEdit,
  onDelete,
}: WikiCommentCardProps) {
  const { getActorName } = useActorName();
  const { uploadWithToast } = useFileUpload(api);
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const editEditorRef = useRef<ContentEditorRef>(null);
  const cancelledRef = useRef(false);
  const { isDragOver: parentDragOver, dropZoneProps: parentDropZoneProps } = useFileDropZone({
    onDrop: (files) => editEditorRef.current?.uploadFiles(files),
    enabled: editing,
  });

  const isOwn = comment.author_type === "member" && comment.author_id === currentUserId;
  const isTemp = comment.id.startsWith("temp-");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cancelEdit = () => { cancelledRef.current = true; setEditing(false); };

  const saveEdit = async () => {
    if (cancelledRef.current) return;
    const trimmed = editEditorRef.current?.getMarkdown()?.replace(/(\n\s*)+$/, "").trim();
    if (!trimmed || trimmed === comment.content.trim()) { setEditing(false); return; }
    try {
      await onEdit(comment.id, trimmed);
      setEditing(false);
    } catch {
      toast.error("Failed to update comment");
    }
  };

  // Collect all nested replies recursively into a flat list
  const allNestedReplies: WikiComment[] = [];
  const collectReplies = (parentId: string) => {
    const children = allReplies.get(parentId) ?? [];
    for (const child of children) {
      allNestedReplies.push(child);
      collectReplies(child.id);
    }
  };
  collectReplies(comment.id);

  const replyCount = allNestedReplies.length;
  const contentPreview = comment.content.replace(/\n/g, " ").slice(0, 80);

  return (
    <Card className={cn("!py-0 !gap-0 overflow-hidden", isTemp && "opacity-60")}>
      <Collapsible open={open} onOpenChange={setOpen}>
        {/* Header */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-2.5">
            <CollapsibleTrigger className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
            </CollapsibleTrigger>
            <ActorAvatar actorType={comment.author_type} actorId={comment.author_id} size={24} />
            <span className="shrink-0 text-sm font-medium">
              {getActorName(comment.author_type, comment.author_id)}
            </span>
            <Tooltip>
              <TooltipTrigger
                render={<span className="shrink-0 text-xs text-muted-foreground cursor-default">{timeAgo(comment.created_at)}</span>}
              />
              <TooltipContent side="top">{new Date(comment.created_at).toLocaleString()}</TooltipContent>
            </Tooltip>

            {!open && contentPreview && (
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{contentPreview}</span>
            )}
            {!open && replyCount > 0 && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {replyCount} {replyCount === 1 ? "reply" : "replies"}
              </span>
            )}

            {open && !isTemp && (
              <div className="ml-auto flex items-center gap-0.5">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="ghost" size="icon-xs" className="text-muted-foreground"><MoreHorizontal className="h-4 w-4" /></Button>}
                  />
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { copyMarkdown(comment.content); toast.success("Copied"); }}>
                      <Copy className="h-3.5 w-3.5" />Copy
                    </DropdownMenuItem>
                    {isOwn && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => { cancelledRef.current = false; setEditing(true); }}>
                          <Pencil className="h-3.5 w-3.5" />Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setConfirmDelete(true)} variant="destructive">
                          <Trash2 className="h-3.5 w-3.5" />Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DeleteCommentDialog
                  open={confirmDelete}
                  onOpenChange={setConfirmDelete}
                  onConfirm={() => onDelete(comment.id)}
                  hasReplies={replyCount > 0}
                />
              </div>
            )}
          </div>
        </div>

        {/* Collapsible body */}
        <CollapsibleContent>
          {/* Parent comment body */}
          <div className="px-4 pb-3">
            {editing ? (
              <div
                {...parentDropZoneProps}
                className="relative pl-10"
                onKeyDown={(e) => { if (e.key === "Escape") cancelEdit(); }}
              >
                <div className="text-sm leading-relaxed">
                  <ContentEditor
                    ref={editEditorRef}
                    defaultValue={comment.content}
                    placeholder="Edit comment..."
                    onSubmit={saveEdit}
                    onUploadFile={(file) => uploadWithToast(file, { wikiId })}
                    debounceMs={100}
                  />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <FileUploadButton size="sm" onSelect={(file) => editEditorRef.current?.uploadFiles([file])} />
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
                    <Button size="sm" variant="outline" onClick={saveEdit}>Save</Button>
                  </div>
                </div>
                {parentDragOver && <FileDropOverlay />}
              </div>
            ) : (
              <>
                <div className="pl-10 text-sm leading-relaxed text-foreground/85">
                  <ReadonlyContent content={comment.content} />
                </div>
                <AttachmentList attachments={comment.attachments} content={comment.content} className="mt-1.5 pl-10" />
              </>
            )}
          </div>

          {/* Replies */}
          {allNestedReplies.map((reply) => (
            <div key={reply.id} className="border-t border-border/50 px-4">
              <WikiCommentRow
                wikiId={wikiId}
                comment={reply}
                currentUserId={currentUserId}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </div>
          ))}

          {/* Reply input */}
          <div className="border-t border-border/50 px-4 py-2.5">
            <WikiReplyInput
              wikiId={wikiId}
              placeholder="Leave a reply..."
              size="sm"
              avatarType="member"
              avatarId={currentUserId ?? ""}
              onSubmit={(content, attachmentIds) => onReply(comment.id, content, attachmentIds)}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
