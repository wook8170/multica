-- name: CreateAttachment :one
INSERT INTO attachment (id, workspace_id, issue_id, comment_id, wiki_id, upload_session_id, uploader_type, uploader_id, filename, url, content_type, size_bytes)
VALUES ($1, $2, sqlc.narg(issue_id), sqlc.narg(comment_id), sqlc.narg(wiki_id), sqlc.narg(upload_session_id), $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: ListAttachmentsByIssue :many
SELECT * FROM attachment
WHERE issue_id = $1 AND workspace_id = $2
ORDER BY created_at ASC;

-- name: ListAttachmentsByComment :many
SELECT * FROM attachment
WHERE comment_id = $1 AND workspace_id = $2
ORDER BY created_at ASC;

-- name: ListAttachmentsByWiki :many
SELECT * FROM attachment
WHERE wiki_id = $1 AND workspace_id = $2
ORDER BY created_at ASC;

-- name: GetAttachment :one
SELECT * FROM attachment
WHERE id = $1 AND workspace_id = $2;

-- name: ListAttachmentsByCommentIDs :many
SELECT * FROM attachment
WHERE comment_id = ANY($1::uuid[]) AND workspace_id = $2
ORDER BY created_at ASC;

-- name: ListAttachmentURLsByIssueOrComments :many
SELECT a.url FROM attachment a
WHERE a.issue_id = $1
   OR a.comment_id IN (SELECT c.id FROM comment c WHERE c.issue_id = $1);

-- name: ListAttachmentURLsByCommentID :many
SELECT url FROM attachment
WHERE comment_id = $1;

-- name: ListAttachmentURLsByWikiID :many
SELECT url FROM attachment
WHERE wiki_id = $1;

-- name: LinkAttachmentsToComment :exec
UPDATE attachment
SET comment_id = $1
WHERE issue_id = $2
  AND comment_id IS NULL
  AND id = ANY($3::uuid[]);

-- name: LinkAttachmentsToIssue :exec
UPDATE attachment
SET issue_id = $1
WHERE workspace_id = $2
  AND issue_id IS NULL
  AND id = ANY($3::uuid[]);

-- name: LinkAttachmentsToWikiBySession :exec
UPDATE attachment
SET wiki_id = $1,
    upload_session_id = NULL
WHERE workspace_id = $2
  AND uploader_id = $3
  AND upload_session_id = $4
  AND wiki_id IS NULL
  AND issue_id IS NULL
  AND comment_id IS NULL;

-- name: DeleteExpiredWikiTempAttachments :many
DELETE FROM attachment
WHERE wiki_id IS NULL
  AND issue_id IS NULL
  AND comment_id IS NULL
  AND upload_session_id IS NOT NULL
  AND created_at < NOW() - sqlc.arg(ttl)::interval
RETURNING id, workspace_id, issue_id, comment_id, wiki_id, upload_session_id, uploader_type, uploader_id, filename, url, content_type, size_bytes, created_at;

-- name: DeleteAttachment :exec
DELETE FROM attachment WHERE id = $1 AND workspace_id = $2;

-- name: ListAttachmentsByWikiCommentIDs :many
SELECT * FROM attachment
WHERE comment_id = ANY($1::uuid[]) AND wiki_id IS NOT NULL AND workspace_id = $2
ORDER BY created_at ASC;

-- name: LinkAttachmentsToWikiComment :exec
UPDATE attachment
SET comment_id = $1
WHERE wiki_id = $2
  AND comment_id IS NULL
  AND id = ANY($3::uuid[]);

-- name: ListAttachmentURLsByWikiCommentID :many
SELECT url FROM attachment
WHERE comment_id = $1 AND wiki_id IS NOT NULL;
