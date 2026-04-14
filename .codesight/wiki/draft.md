# Draft

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The Draft subsystem handles **6 routes** and touches: auth, db, payment.

## Routes

- `GET` `/{id}/draft` params(id) [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `PUT` `/{id}/draft` params(id) [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `DELETE` `/{id}/draft` params(id) [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `GET` `/draft` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `PUT` `/draft` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `DELETE` `/draft` [auth, db, payment, upload]
  `server/cmd/server/router.go`

## Source Files

Read these before implementing or modifying this subsystem:
- `server/cmd/server/router.go`

---
_Back to [overview.md](./overview.md)_