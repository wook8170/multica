# Comment

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The Comment subsystem handles **3 routes** and touches: auth, db, queue.

## Routes

- `GET` `limit` [auth, db, queue, upload]
  `server/internal/handler/comment.go`
- `GET` `offset` [auth, db, queue, upload]
  `server/internal/handler/comment.go`
- `GET` `since` [auth, db, queue, upload]
  `server/internal/handler/comment.go`

## Related Models

- **comment** (6 fields) → [database.md](./database.md)
- **comment_reaction** (6 fields) → [database.md](./database.md)

## Source Files

Read these before implementing or modifying this subsystem:
- `server/internal/handler/comment.go`

---
_Back to [overview.md](./overview.md)_