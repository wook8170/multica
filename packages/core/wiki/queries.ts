import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const wikiCommentKeys = {
  all: (wikiId: string) => ["wiki_comments", wikiId] as const,
  list: (wikiId: string) => [...wikiCommentKeys.all(wikiId), "list"] as const,
};

export function wikiCommentListOptions(wikiId: string) {
  return queryOptions({
    queryKey: wikiCommentKeys.list(wikiId),
    queryFn: () => api.listWikiComments(wikiId),
    staleTime: Infinity,
  });
}
