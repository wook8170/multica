# Wiki

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The Wiki subsystem handles **1 routes** and touches: auth, db, payment.

## Routes

- `GET` `X-Webhook-Secret` [auth, db, payment]
  `server/internal/handler/wiki.go`

## Related Models

- **wiki_versions** (6 fields) → [database.md](./database.md)
- **wiki_tags** (4 fields) → [database.md](./database.md)

## Source Files

Read these before implementing or modifying this subsystem:
- `server/internal/handler/wiki.go`

---
_Back to [overview.md](./overview.md)_