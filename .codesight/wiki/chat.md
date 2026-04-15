# Chat

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The Chat subsystem handles **6 routes** and touches: auth, db, payment, queue.

## Routes

- `POST` `/api/chat/sessions` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `GET` `/api/chat/sessions` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `DELETE` `/api/chat/sessions` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `POST` `/api/chat/sessions/messages` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `GET` `/api/chat/sessions/messages` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `GET` `status` [auth, db, queue]
  `server/internal/handler/chat.go`

## Related Models

- **chat_session** (8 fields) → [database.md](./database.md)
- **chat_message** (5 fields) → [database.md](./database.md)

## Source Files

Read these before implementing or modifying this subsystem:
- `server/cmd/server/router.go`
- `server/internal/handler/chat.go`

---
_Back to [overview.md](./overview.md)_