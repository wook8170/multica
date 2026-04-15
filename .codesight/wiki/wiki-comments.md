# Wiki-comments

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The Wiki-comments subsystem handles **2 routes** and touches: auth, db, payment.

## Routes

- `PUT` `/api/wiki_comments/{commentId}` params(commentId) [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `DELETE` `/api/wiki_comments/{commentId}` params(commentId) [auth, db, payment, upload]
  `server/cmd/server/router.go`

## Related Models

- **wiki_versions** (6 fields) → [database.md](./database.md)
- **wiki_tags** (4 fields) → [database.md](./database.md)
- **wiki_drafts** (8 fields) → [database.md](./database.md)
- **wiki_comment** (6 fields) → [database.md](./database.md)

## Source Files

Read these before implementing or modifying this subsystem:
- `server/cmd/server/router.go`

---
_Back to [overview.md](./overview.md)_