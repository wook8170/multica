-- name: ListWikiComments :many
SELECT * FROM wiki_comment
WHERE wiki_id = $1 AND workspace_id = $2
ORDER BY created_at ASC;

-- name: GetWikiCommentInWorkspace :one
SELECT * FROM wiki_comment
WHERE id = $1 AND workspace_id = $2;

-- name: CreateWikiComment :one
INSERT INTO wiki_comment (wiki_id, workspace_id, author_type, author_id, content, parent_id)
VALUES ($1, $2, $3, $4, $5, sqlc.narg(parent_id))
RETURNING *;

-- name: UpdateWikiComment :one
UPDATE wiki_comment
SET content    = $2,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteWikiComment :exec
DELETE FROM wiki_comment WHERE id = $1;
