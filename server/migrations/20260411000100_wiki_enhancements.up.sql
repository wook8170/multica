-- Wiki Versions (History)
CREATE TABLE IF NOT EXISTS wiki_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wiki_id UUID NOT NULL REFERENCES wikis(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wiki_versions_wiki_id ON wiki_versions(wiki_id);

-- Wiki Tags (Hashtags)
CREATE TABLE IF NOT EXISTS wiki_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    wiki_id UUID NOT NULL REFERENCES wikis(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wiki_tags_workspace_id ON wiki_tags(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wiki_tags_wiki_id ON wiki_tags(wiki_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wiki_tags_wiki_id_name ON wiki_tags(wiki_id, name);
