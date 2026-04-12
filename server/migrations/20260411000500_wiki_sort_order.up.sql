ALTER TABLE wikis ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_wikis_sort_order ON wikis(workspace_id, parent_id, sort_order);
