-- Assign proper sort_order to wikis that still have the default value of 0.
-- Orders by created_at within each (workspace_id, parent_id) group, spaced by 1000.
UPDATE wikis
SET sort_order = subq.new_order
FROM (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY workspace_id, COALESCE(parent_id::text, '__root__')
      ORDER BY created_at
    ) * 1000 AS new_order
  FROM wikis
  WHERE sort_order = 0
) subq
WHERE wikis.id = subq.id;
