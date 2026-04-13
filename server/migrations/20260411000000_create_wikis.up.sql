-- Check if namespaces/workspaces exist, but for now focus on creating the table safely
CREATE TABLE IF NOT EXISTS wikis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    parent_id UUID,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wikis_workspace_id ON wikis(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wikis_parent_id ON wikis(parent_id);
