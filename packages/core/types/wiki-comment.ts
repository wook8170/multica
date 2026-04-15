import type { Attachment } from "./attachment";

export type WikiCommentAuthorType = "member";

export interface WikiComment {
  id: string;
  wiki_id: string;
  parent_id: string | null;
  author_type: WikiCommentAuthorType;
  author_id: string;
  content: string;
  attachments: Attachment[];
  created_at: string;
  updated_at: string;
}
