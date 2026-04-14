CREATE TABLE IF NOT EXISTS wiki_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    wiki_id UUID NOT NULL REFERENCES wikis(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    binary_state BYTEA,
    base_version INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, wiki_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_wiki_drafts_wiki_id ON wiki_drafts(wiki_id);
CREATE INDEX IF NOT EXISTS idx_wiki_drafts_updated_at ON wiki_drafts(updated_at);
