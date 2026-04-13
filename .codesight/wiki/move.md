# Move

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The Move subsystem handles **2 routes** and touches: auth, db, payment.

## Routes

- `PATCH` `/{id}/move` params(id) [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `PATCH` `/move` [auth, db, payment, upload]
  `server/cmd/server/router.go`

## Source Files

Read these before implementing or modifying this subsystem:
- `server/cmd/server/router.go`

---
_Back to [overview.md](./overview.md)_