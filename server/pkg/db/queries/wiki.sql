-- name: CreateWiki :one
INSERT INTO wikis (
    workspace_id, parent_id, title, content, created_by
) VALUES (
    $1, $2, $3, $4, $5
) RETURNING *;

-- name: GetWiki :one
SELECT * FROM wikis WHERE id = $1 AND workspace_id = $2;

-- name: ListWikis :many
SELECT * FROM wikis 
WHERE workspace_id = $1 
ORDER BY created_at ASC;

-- name: UpdateWiki :one
UPDATE wikis
SET 
    title = $3,
    content = $4,
    parent_id = $5,
    updated_at = NOW()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: DeleteWiki :exec
DELETE FROM wikis WHERE id = $1 AND workspace_id = $2;

-- name: SearchWikis :many
SELECT * FROM wikis
WHERE workspace_id = $1 
  AND (title ILIKE '%' || $2 || '%' OR content ILIKE '%' || $2 || '%')
ORDER BY updated_at DESC;

-- name: CreateWikiVersion :one
INSERT INTO wiki_versions (
    wiki_id, version_number, title, content, created_by
) VALUES (
    $1, $2, $3, $4, $5
) RETURNING *;

-- name: ListWikiHistory :many
SELECT * FROM wiki_versions
WHERE wiki_id = $1
ORDER BY version_number DESC;

-- name: ListWikiTags :many
SELECT name FROM wiki_tags
WHERE workspace_id = $1 AND wiki_id = $2;

-- name: CreateWikiTag :exec
INSERT INTO wiki_tags (workspace_id, wiki_id, name)
VALUES ($1, $2, $3)
ON CONFLICT (wiki_id, name) DO NOTHING;

-- name: DeleteWikiTags :exec
DELETE FROM wiki_tags WHERE wiki_id = $1;
