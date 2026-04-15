DROP INDEX IF EXISTS idx_attachment_wiki_orphan_gc;
DROP INDEX IF EXISTS idx_attachment_workspace_session;
DROP INDEX IF EXISTS idx_attachment_wiki;

ALTER TABLE attachment
    DROP COLUMN IF EXISTS upload_session_id,
    DROP COLUMN IF EXISTS wiki_id;
