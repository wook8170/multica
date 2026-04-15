"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWSEvent, useWSReconnect } from "@multica/core/realtime";
import { wikiCommentKeys, wikiCommentListOptions } from "@multica/core/wiki/queries";
import { useCreateWikiComment, useUpdateWikiComment, useDeleteWikiComment } from "@multica/core/wiki/mutations";
import type { WikiComment, WikiCommentCreatedPayload, WikiCommentUpdatedPayload, WikiCommentDeletedPayload } from "@multica/core/types";

export function useWikiComments(wikiId: string) {
  const qc = useQueryClient();

  const { data: comments = [], isLoading } = useQuery(wikiCommentListOptions(wikiId));

  const createMutation = useCreateWikiComment(wikiId);
  const updateMutation = useUpdateWikiComment(wikiId);
  const deleteMutation = useDeleteWikiComment(wikiId);

  // Derived: top-level comments and replies grouped by parent_id
  const topLevelComments = useMemo(
    () => comments.filter((c) => !c.parent_id),
    [comments],
  );

  const repliesByParent = useMemo(() => {
    const map = new Map<string, WikiComment[]>();
    for (const c of comments) {
      if (c.parent_id) {
        const list = map.get(c.parent_id) ?? [];
        list.push(c);
        map.set(c.parent_id, list);
      }
    }
    return map;
  }, [comments]);

  // Refetch on WS reconnect
  const handleReconnect = useCallback(() => {
    qc.invalidateQueries({ queryKey: wikiCommentKeys.list(wikiId) });
  }, [qc, wikiId]);
  useWSReconnect(handleReconnect);

  // Granular WS handlers — only update cache for this wiki
  const handleCreated = useCallback(
    (payload: unknown) => {
      const { comment } = payload as WikiCommentCreatedPayload;
      if (comment?.wiki_id !== wikiId) return;
      qc.setQueryData<WikiComment[]>(wikiCommentKeys.list(wikiId), (old) => {
        if (!old) return [comment];
        if (old.some((c) => c.id === comment.id)) return old;
        return [...old, comment];
      });
    },
    [qc, wikiId],
  );

  const handleUpdated = useCallback(
    (payload: unknown) => {
      const { comment } = payload as WikiCommentUpdatedPayload;
      if (comment?.wiki_id !== wikiId) return;
      qc.setQueryData<WikiComment[]>(
        wikiCommentKeys.list(wikiId),
        (old) => old?.map((c) => (c.id === comment.id ? comment : c)),
      );
    },
    [qc, wikiId],
  );

  const handleDeleted = useCallback(
    (payload: unknown) => {
      const { comment_id, wiki_id } = payload as WikiCommentDeletedPayload;
      if (wiki_id !== wikiId) return;
      qc.setQueryData<WikiComment[]>(wikiCommentKeys.list(wikiId), (old) => {
        if (!old) return old;
        // Cascade: collect deleted comment + all descendants
        const removed = new Set<string>();
        const collect = (id: string) => {
          removed.add(id);
          old.filter((c) => c.parent_id === id).forEach((c) => collect(c.id));
        };
        collect(comment_id);
        return old.filter((c) => !removed.has(c.id));
      });
    },
    [qc, wikiId],
  );

  useWSEvent("wiki_comment:created", handleCreated);
  useWSEvent("wiki_comment:updated", handleUpdated);
  useWSEvent("wiki_comment:deleted", handleDeleted);

  const submitComment = useCallback(
    (content: string, attachmentIds?: string[]) =>
      createMutation.mutateAsync({ content, attachmentIds }).then(() => undefined),
    [createMutation],
  );

  const submitReply = useCallback(
    (parentId: string, content: string, attachmentIds?: string[]) =>
      createMutation.mutateAsync({ content, attachmentIds, parentId }).then(() => undefined),
    [createMutation],
  );

  const editComment = useCallback(
    (commentId: string, content: string) =>
      updateMutation.mutateAsync({ commentId, content }).then(() => undefined),
    [updateMutation],
  );

  const deleteComment = useCallback(
    (commentId: string) => deleteMutation.mutate(commentId),
    [deleteMutation],
  );

  return {
    comments,
    topLevelComments,
    repliesByParent,
    isLoading,
    submitComment,
    submitReply,
    editComment,
    deleteComment,
  };
}
