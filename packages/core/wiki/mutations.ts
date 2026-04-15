import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { wikiCommentKeys } from "./queries";
import type { WikiComment } from "../types";

export function useCreateWikiComment(wikiId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      content,
      attachmentIds,
      parentId,
    }: {
      content: string;
      attachmentIds?: string[];
      parentId?: string;
    }) => api.createWikiComment(wikiId, content, attachmentIds, parentId),
    onSuccess: (comment) => {
      qc.setQueryData<WikiComment[]>(wikiCommentKeys.list(wikiId), (old) => {
        if (!old) return [comment];
        if (old.some((c) => c.id === comment.id)) return old;
        return [...old, comment];
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: wikiCommentKeys.list(wikiId) });
    },
  });
}

export function useUpdateWikiComment(wikiId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, content }: { commentId: string; content: string }) =>
      api.updateWikiComment(commentId, content),
    onMutate: async ({ commentId, content }) => {
      await qc.cancelQueries({ queryKey: wikiCommentKeys.list(wikiId) });
      const prev = qc.getQueryData<WikiComment[]>(wikiCommentKeys.list(wikiId));
      qc.setQueryData<WikiComment[]>(
        wikiCommentKeys.list(wikiId),
        (old) => old?.map((c) => (c.id === commentId ? { ...c, content } : c)),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(wikiCommentKeys.list(wikiId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: wikiCommentKeys.list(wikiId) });
    },
  });
}

export function useDeleteWikiComment(wikiId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => api.deleteWikiComment(commentId),
    onMutate: async (commentId) => {
      await qc.cancelQueries({ queryKey: wikiCommentKeys.list(wikiId) });
      const prev = qc.getQueryData<WikiComment[]>(wikiCommentKeys.list(wikiId));

      // Cascade: collect all child comment IDs (mirrors useDeleteComment in issues)
      const toRemove = new Set<string>([commentId]);
      if (prev) {
        let changed = true;
        while (changed) {
          changed = false;
          for (const c of prev) {
            if (c.parent_id && toRemove.has(c.parent_id) && !toRemove.has(c.id)) {
              toRemove.add(c.id);
              changed = true;
            }
          }
        }
      }

      qc.setQueryData<WikiComment[]>(
        wikiCommentKeys.list(wikiId),
        (old) => old?.filter((c) => !toRemove.has(c.id)),
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(wikiCommentKeys.list(wikiId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: wikiCommentKeys.list(wikiId) });
    },
  });
}
