CREATE TABLE wiki_comment (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wiki_id      UUID NOT NULL REFERENCES wikis(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    author_type  TEXT NOT NULL CHECK (author_type IN ('member')),
    author_id    UUID NOT NULL,
    content      TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wiki_comment_wiki_id ON wiki_comment(wiki_id);
CREATE INDEX idx_wiki_comment_workspace_id ON wiki_comment(workspace_id);
