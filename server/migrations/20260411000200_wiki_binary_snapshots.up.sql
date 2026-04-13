-- Add binary_state to wiki_versions for Yjs snapshots
ALTER TABLE wiki_versions ADD COLUMN IF NOT EXISTS binary_state BYTEA;
