ALTER TABLE attachment
    ADD COLUMN wiki_id UUID REFERENCES wikis(id) ON DELETE CASCADE,
    ADD COLUMN upload_session_id UUID;

CREATE INDEX idx_attachment_wiki ON attachment(wiki_id) WHERE wiki_id IS NOT NULL;
CREATE INDEX idx_attachment_workspace_session ON attachment(workspace_id, upload_session_id)
    WHERE upload_session_id IS NOT NULL;
CREATE INDEX idx_attachment_wiki_orphan_gc ON attachment(created_at)
    WHERE wiki_id IS NULL AND issue_id IS NULL AND comment_id IS NULL AND upload_session_id IS NOT NULL;
