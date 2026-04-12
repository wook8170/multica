ALTER TABLE wikis ADD COLUMN IF NOT EXISTS updated_by UUID;
-- Backfill: set updated_by = created_by for existing rows
UPDATE wikis SET updated_by = created_by WHERE updated_by IS NULL;
