package handler

import (
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type WikiResponse struct {
	ID          string   `json:"id"`
	WorkspaceID string   `json:"workspace_id"`
	ParentID    *string  `json:"parent_id"`
	Title       string   `json:"title"`
	Content     string   `json:"content"`
	Version     int      `json:"version"`
	SortOrder   int      `json:"sort_order"`
	Tags        []string `json:"tags,omitempty"`
	CreatedBy   string   `json:"created_by"`
	UpdatedBy   string   `json:"updated_by"`
	CreatedAt   string   `json:"created_at"`
	UpdatedAt   string   `json:"updated_at"`
}

type WikiVersionResponse struct {
	ID            string `json:"id"`
	WikiID        string `json:"wiki_id"`
	VersionNumber int    `json:"version_number"`
	Title         string `json:"title"`
	Content       string `json:"content"`
	BinaryState   string `json:"binary_state,omitempty"` // Base64
	CreatedBy     string `json:"created_by"`
	CreatedAt     string `json:"created_at"`
}

type CreateWikiRequest struct {
	ParentID *string `json:"parent_id"`
	Title    string  `json:"title"`
	Content  string  `json:"content"`
}

type SaveWikiDraftRequest struct {
	Title       string `json:"title"`
	Content     string `json:"content"`
	BinaryState string `json:"binary_state"`
	BaseVersion int    `json:"base_version"`
}

type WikiDraftResponse struct {
	Title       string `json:"title"`
	Content     string `json:"content"`
	BinaryState string `json:"binary_state,omitempty"`
	BaseVersion int    `json:"base_version"`
	UpdatedAt   string `json:"updated_at"`
}

func (h *Handler) ListWikis(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	wsID := resolveWorkspaceID(r)
	wsUUID := parseUUID(wsID)

	rows, err := h.DB.Query(ctx,
		"SELECT id, workspace_id, parent_id, title, content, version, sort_order, created_by, updated_by, created_at, updated_at FROM wikis WHERE workspace_id = $1 ORDER BY sort_order ASC, created_at ASC",
		wsUUID,
	)
	if err != nil {
		slog.Error("ListWikis failed", "error", err, "workspace_id", wsID)
		writeError(w, http.StatusInternalServerError, "failed to list wikis")
		return
	}
	defer rows.Close()

	wikis := []WikiResponse{}
	for rows.Next() {
		var (
			id, workspaceID, createdBy pgtype.UUID
			updatedBy                  pgtype.UUID
			parentID                   pgtype.UUID
			title, content             string
			version, sortOrder         int
			createdAt, updatedAt       time.Time
		)
		if err := rows.Scan(&id, &workspaceID, &parentID, &title, &content, &version, &sortOrder, &createdBy, &updatedBy, &createdAt, &updatedAt); err != nil {
			continue
		}
		wikis = append(wikis, WikiResponse{
			ID:          uuidToString(id),
			WorkspaceID: uuidToString(workspaceID),
			ParentID:    uuidToPtr(parentID),
			Title:       title,
			Content:     content,
			Version:     version,
			SortOrder:   sortOrder,
			CreatedBy:   uuidToString(createdBy),
			UpdatedBy:   uuidToString(updatedBy),
			CreatedAt:   createdAt.Format(time.RFC3339),
			UpdatedAt:   updatedAt.Format(time.RFC3339),
		})
	}

	writeJSON(w, http.StatusOK, wikis)
}

func (h *Handler) CreateWiki(w http.ResponseWriter, r *http.Request) {
	var req CreateWikiRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}

	ctx := r.Context()
	wsID := resolveWorkspaceID(r)
	userID, _ := requireUserID(w, r)

	var (
		id, workspaceID, createdBy pgtype.UUID
		parentID                   pgtype.UUID
		title, content             string
		createdAt, updatedAt       time.Time
	)

	pID := pgtype.UUID{Valid: false}
	if req.ParentID != nil && *req.ParentID != "" && *req.ParentID != "new" {
		pID = parseUUID(*req.ParentID)
	}

	err := h.DB.QueryRow(ctx,
		`INSERT INTO wikis (workspace_id, parent_id, title, content, created_by, sort_order)
		 VALUES ($1, $2, $3, $4, $5, COALESCE((SELECT MAX(sort_order) FROM wikis WHERE workspace_id = $1 AND parent_id IS NOT DISTINCT FROM $2), 0) + 1000)
		 RETURNING id, workspace_id, parent_id, title, content, created_by, created_at, updated_at`,
		parseUUID(wsID), pID, req.Title, req.Content, parseUUID(userID),
	).Scan(&id, &workspaceID, &parentID, &title, &content, &createdBy, &createdAt, &updatedAt)

	if err != nil {
		slog.Error("CreateWiki failed", "error", err, "workspace_id", wsID)
		writeError(w, http.StatusInternalServerError, "failed to create wiki")
		return
	}

	writeJSON(w, http.StatusCreated, WikiResponse{
		ID:          uuidToString(id),
		WorkspaceID: uuidToString(workspaceID),
		ParentID:    uuidToPtr(parentID),
		Title:       title,
		Content:     content,
		CreatedBy:   uuidToString(createdBy),
		CreatedAt:   createdAt.Format(time.RFC3339),
		UpdatedAt:   updatedAt.Format(time.RFC3339),
	})
}

func (h *Handler) UpdateWiki(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	type UpdateWikiRequest struct {
		ParentID    *string `json:"parent_id"`
		Title       string  `json:"title"`
		Content     string  `json:"content"`
		BinaryState string  `json:"binary_state"` // Base64 encoded Yjs state
		BaseVersion *int    `json:"base_version"` // optimistic lock: nil = skip version check (force save)
	}
	var req UpdateWikiRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}

	ctx := r.Context()
	wsID := resolveWorkspaceID(r)
	userID, _ := requireUserID(w, r)

	pID := pgtype.UUID{Valid: false}
	if req.ParentID != nil && *req.ParentID != "" && *req.ParentID != "new" {
		pID = parseUUID(*req.ParentID)
	}

	var binaryData []byte
	if req.BinaryState != "" {
		binaryData, _ = base64.StdEncoding.DecodeString(req.BinaryState)
	}

	// Transaction: atomically update content and insert version snapshot
	tx, err := h.TxStarter.Begin(ctx)
	if err != nil {
		slog.Error("UpdateWiki begin tx failed", "error", err, "wiki_id", id)
		writeError(w, http.StatusInternalServerError, "failed to update wiki")
		return
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// 1. Update wiki content and bump version counter.
	// When base_version is provided, include it in WHERE to detect conflicts.
	var tag interface{ RowsAffected() int64 }
	if req.BaseVersion != nil {
		tag, err = tx.Exec(ctx,
			`UPDATE wikis
			    SET title = $3, content = $4, parent_id = $5, updated_at = NOW(), updated_by = $7, version = version + 1
			  WHERE id = $1 AND workspace_id = $2 AND version = $6`,
			parseUUID(id), parseUUID(wsID), req.Title, req.Content, pID, *req.BaseVersion, parseUUID(userID),
		)
	} else {
		tag, err = tx.Exec(ctx,
			`UPDATE wikis
			    SET title = $3, content = $4, parent_id = $5, updated_at = NOW(), updated_by = $6, version = version + 1
			  WHERE id = $1 AND workspace_id = $2`,
			parseUUID(id), parseUUID(wsID), req.Title, req.Content, pID, parseUUID(userID),
		)
	}
	if err != nil {
		slog.Error("UpdateWiki failed", "error", err, "wiki_id", id)
		writeError(w, http.StatusInternalServerError, "failed to update wiki")
		return
	}

	// If base_version was provided but no rows were updated, it is a conflict
	if req.BaseVersion != nil && tag.RowsAffected() == 0 {
		tx.Rollback(ctx) //nolint:errcheck
		var currentVersion int
		h.DB.QueryRow(ctx, "SELECT version FROM wikis WHERE id = $1 AND workspace_id = $2",
			parseUUID(id), parseUUID(wsID)).Scan(&currentVersion)
		writeJSON(w, http.StatusConflict, map[string]any{
			"error":           "conflict",
			"current_version": currentVersion,
		})
		return
	}

	// 2. Fetch updated version number (value after UPDATE)
	var newWikiVersion int
	tx.QueryRow(ctx, "SELECT version FROM wikis WHERE id = $1", parseUUID(id)).Scan(&newWikiVersion)

	// 3. Insert history snapshot (wiki_versions.version_number is a sequential history counter, separate from wikis.version)
	var nextSnapshotNum int
	tx.QueryRow(ctx,
		"SELECT COALESCE(MAX(version_number), 0) + 1 FROM wiki_versions WHERE wiki_id = $1",
		parseUUID(id),
	).Scan(&nextSnapshotNum)

	_, ierr := tx.Exec(ctx,
		"INSERT INTO wiki_versions (wiki_id, version_number, title, content, binary_state, created_by) VALUES ($1, $2, $3, $4, $5, $6)",
		parseUUID(id), nextSnapshotNum, req.Title, req.Content, binaryData, parseUUID(userID),
	)
	if ierr != nil {
		slog.Error("Failed to create wiki snapshot", "error", ierr, "wiki_id", id)
		writeError(w, http.StatusInternalServerError, "failed to create wiki snapshot")
		return
	}
	_, _ = compactWikiHistory(ctx, tx, id)

	// 4. Extract and sync hashtags
	tx.Exec(ctx, "DELETE FROM wiki_tags WHERE wiki_id = $1", parseUUID(id)) //nolint:errcheck
	re := regexp.MustCompile(`#([^\s#]+)`)
	matches := re.FindAllStringSubmatch(req.Title+" "+req.Content, -1)
	for _, match := range matches {
		if len(match) > 1 {
			tx.Exec(ctx, //nolint:errcheck
				"INSERT INTO wiki_tags (workspace_id, wiki_id, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
				parseUUID(wsID), parseUUID(id), match[1],
			)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		slog.Error("UpdateWiki commit failed", "error", err, "wiki_id", id)
		writeError(w, http.StatusInternalServerError, "failed to update wiki")
		return
	}

	slog.Info("Wiki saved", "wiki_id", id, "wiki_version", newWikiVersion, "snapshot", nextSnapshotNum)

	// 5. Broadcast real-time update (after commit)
	if wsPayload, err := json.Marshal(map[string]any{
		"type": "wiki.updated",
		"payload": map[string]any{
			"id":         id,
			"title":      req.Title,
			"updated_by": userID,
		},
	}); err == nil {
		h.Hub.BroadcastToWorkspace(wsID, wsPayload)
	}

	// 6. Return new version to client for use as base_version on next save
	_, _ = h.DB.Exec(ctx,
		"DELETE FROM wiki_drafts WHERE wiki_id = $1 AND workspace_id = $2 AND user_id = $3",
		parseUUID(id), parseUUID(wsID), parseUUID(userID),
	)

	// 7. Return new version to client for use as base_version on next save
	writeJSON(w, http.StatusOK, map[string]any{"version": newWikiVersion})
}

func (h *Handler) SaveWikiDraft(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ctx := r.Context()
	wsID := resolveWorkspaceID(r)
	userID, _ := requireUserID(w, r)

	var exists bool
	if err := h.DB.QueryRow(ctx,
		"SELECT EXISTS(SELECT 1 FROM wikis WHERE id = $1 AND workspace_id = $2)",
		parseUUID(id), parseUUID(wsID),
	).Scan(&exists); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save wiki draft")
		return
	}
	if !exists {
		writeError(w, http.StatusNotFound, "wiki not found")
		return
	}

	var req SaveWikiDraftRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}

	var binaryData []byte
	if req.BinaryState != "" {
		decoded, err := base64.StdEncoding.DecodeString(req.BinaryState)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid binary_state")
			return
		}
		binaryData = decoded
	}

	_, err := h.DB.Exec(ctx,
		`INSERT INTO wiki_drafts (workspace_id, wiki_id, user_id, title, content, binary_state, base_version, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
		 ON CONFLICT (workspace_id, wiki_id, user_id)
		 DO UPDATE SET
		   title = EXCLUDED.title,
		   content = EXCLUDED.content,
		   binary_state = EXCLUDED.binary_state,
		   base_version = EXCLUDED.base_version,
		   updated_at = NOW()`,
		parseUUID(wsID), parseUUID(id), parseUUID(userID), req.Title, req.Content, binaryData, req.BaseVersion,
	)
	if err != nil {
		slog.Error("SaveWikiDraft failed", "error", err, "wiki_id", id, "workspace_id", wsID, "user_id", userID)
		writeError(w, http.StatusInternalServerError, "failed to save wiki draft")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) GetWikiDraft(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ctx := r.Context()
	wsID := resolveWorkspaceID(r)
	userID, _ := requireUserID(w, r)

	var (
		title, content string
		binaryData     []byte
		baseVersion    int
		updatedAt      time.Time
	)

	err := h.DB.QueryRow(ctx,
		`SELECT title, content, binary_state, base_version, updated_at
		   FROM wiki_drafts
		  WHERE wiki_id = $1 AND workspace_id = $2 AND user_id = $3`,
		parseUUID(id), parseUUID(wsID), parseUUID(userID),
	).Scan(&title, &content, &binaryData, &baseVersion, &updatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			writeError(w, http.StatusNotFound, "draft not found")
			return
		}
		slog.Error("GetWikiDraft failed", "error", err, "wiki_id", id, "workspace_id", wsID, "user_id", userID)
		writeError(w, http.StatusInternalServerError, "failed to get wiki draft")
		return
	}

	b64State := ""
	if binaryData != nil {
		b64State = base64.StdEncoding.EncodeToString(binaryData)
	}

	writeJSON(w, http.StatusOK, WikiDraftResponse{
		Title:       title,
		Content:     content,
		BinaryState: b64State,
		BaseVersion: baseVersion,
		UpdatedAt:   updatedAt.Format(time.RFC3339),
	})
}

func (h *Handler) DeleteWikiDraft(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ctx := r.Context()
	wsID := resolveWorkspaceID(r)
	userID, _ := requireUserID(w, r)

	_, err := h.DB.Exec(ctx,
		"DELETE FROM wiki_drafts WHERE wiki_id = $1 AND workspace_id = $2 AND user_id = $3",
		parseUUID(id), parseUUID(wsID), parseUUID(userID),
	)
	if err != nil {
		slog.Error("DeleteWikiDraft failed", "error", err, "wiki_id", id, "workspace_id", wsID, "user_id", userID)
		writeError(w, http.StatusInternalServerError, "failed to delete wiki draft")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// searchWikiHTMLTagRe strips HTML tags when extracting a content snippet.
var searchWikiHTMLTagRe = regexp.MustCompile(`<[^>]+>`)
var searchWikiSpaceRe = regexp.MustCompile(`\s+`)

// wikiContentSnippet strips HTML tags from content and returns a short excerpt
// centred around the first occurrence of query (radius runes on each side).
func wikiContentSnippet(html, query string, radius int) string {
	plain := searchWikiHTMLTagRe.ReplaceAllString(html, " ")
	plain = searchWikiSpaceRe.ReplaceAllString(plain, " ")
	plain = strings.TrimSpace(plain)

	lPlain := strings.ToLower(plain)
	lQuery := strings.ToLower(query)
	idx := strings.Index(lPlain, lQuery)

	runes := []rune(plain)
	qLen := len([]rune(query))

	var start, end int
	prefix, suffix := "", ""
	if idx < 0 {
		start = 0
		end = min(len(runes), radius*2)
		if end < len(runes) {
			suffix = "…"
		}
	} else {
		idxR := len([]rune(plain[:idx]))
		start = idxR - radius
		end = idxR + qLen + radius
		if start < 0 {
			start = 0
		} else {
			prefix = "…"
		}
		if end > len(runes) {
			end = len(runes)
		} else {
			suffix = "…"
		}
	}
	return prefix + string(runes[start:end]) + suffix
}

type SearchWikiResult struct {
	ID             string  `json:"id"`
	ParentID       *string `json:"parent_id"`
	Title          string  `json:"title"`
	MatchSource    string  `json:"match_source"` // "title" or "content"
	MatchedSnippet string  `json:"matched_snippet,omitempty"`
}

type SearchWikisResponse struct {
	Wikis []SearchWikiResult `json:"wikis"`
	Total int                `json:"total"`
}

func (h *Handler) SearchWikis(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	ctx := r.Context()
	wsID := resolveWorkspaceID(r)

	limit := 10
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 && l <= 50 {
			limit = l
		}
	}

	rows, err := h.DB.Query(ctx,
		`SELECT id, parent_id, title, content
		   FROM wikis
		  WHERE workspace_id = $1
		    AND (title ILIKE '%' || $2 || '%' OR content ILIKE '%' || $2 || '%')
		  ORDER BY
		    CASE WHEN title ILIKE '%' || $2 || '%' THEN 0 ELSE 1 END,
		    updated_at DESC
		  LIMIT $3`,
		parseUUID(wsID), query, limit,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to search wikis")
		return
	}
	defer rows.Close()

	lQuery := strings.ToLower(query)
	var wikis []SearchWikiResult
	for rows.Next() {
		var (
			id             pgtype.UUID
			parentID       pgtype.UUID
			title, content string
		)
		if err := rows.Scan(&id, &parentID, &title, &content); err != nil {
			continue
		}
		matchSource := "content"
		snippet := ""
		if strings.Contains(strings.ToLower(title), lQuery) {
			matchSource = "title"
			// Show a content snippet even for title matches when content also matches
			if strings.Contains(strings.ToLower(content), lQuery) {
				snippet = wikiContentSnippet(content, query, 80)
			}
		} else {
			snippet = wikiContentSnippet(content, query, 80)
		}
		wikis = append(wikis, SearchWikiResult{
			ID:             uuidToString(id),
			ParentID:       uuidToPtr(parentID),
			Title:          title,
			MatchSource:    matchSource,
			MatchedSnippet: snippet,
		})
	}

	if wikis == nil {
		wikis = []SearchWikiResult{}
	}
	writeJSON(w, http.StatusOK, SearchWikisResponse{Wikis: wikis, Total: len(wikis)})
}

func (h *Handler) GetWikiHistory(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ctx := r.Context()

	rows, err := h.DB.Query(ctx, "SELECT id, wiki_id, version_number, title, content, binary_state, created_by, created_at FROM wiki_versions WHERE wiki_id = $1 ORDER BY version_number DESC", parseUUID(id))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list history")
		return
	}
	defer rows.Close()

	var history []WikiVersionResponse
	for rows.Next() {
		var (
			vID, wID, cBy  pgtype.UUID
			vNum           int
			title, content string
			binaryData     []byte
			createdAt      time.Time
		)
		rows.Scan(&vID, &wID, &vNum, &title, &content, &binaryData, &cBy, &createdAt)

		b64State := ""
		if binaryData != nil {
			b64State = base64.StdEncoding.EncodeToString(binaryData)
		}

		history = append(history, WikiVersionResponse{
			ID:            uuidToString(vID),
			WikiID:        uuidToString(wID),
			VersionNumber: vNum,
			Title:         title,
			Content:       content,
			BinaryState:   b64State,
			CreatedBy:     uuidToString(cBy),
			CreatedAt:     createdAt.Format(time.RFC3339),
		})
	}
	writeJSON(w, http.StatusOK, history)
}

func (h *Handler) CompactWikiHistory(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ctx := r.Context()
	wsID := resolveWorkspaceID(r)

	var exists bool
	if err := h.DB.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM wikis WHERE id = $1 AND workspace_id = $2)", parseUUID(id), parseUUID(wsID)).Scan(&exists); err != nil {
		slog.Error("CompactWikiHistory lookup failed", "error", err, "wiki_id", id)
		writeError(w, http.StatusInternalServerError, "failed to compact wiki history")
		return
	}
	if !exists {
		writeError(w, http.StatusNotFound, "wiki not found")
		return
	}

	tx, err := h.TxStarter.Begin(ctx)
	if err != nil {
		slog.Error("CompactWikiHistory begin tx failed", "error", err, "wiki_id", id)
		writeError(w, http.StatusInternalServerError, "failed to compact wiki history")
		return
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	result, err := compactWikiHistory(ctx, tx, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to compact wiki history")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		slog.Error("CompactWikiHistory commit failed", "error", err, "wiki_id", id)
		writeError(w, http.StatusInternalServerError, "failed to compact wiki history")
		return
	}

	writeJSON(w, http.StatusOK, result)
}

// MoveWiki updates parent_id and sort_order without touching content or bumping version.
// Used exclusively by drag-and-drop reordering in the sidebar.
func (h *Handler) MoveWiki(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	type MoveWikiRequest struct {
		ParentID  *string `json:"parent_id"`
		SortOrder int     `json:"sort_order"`
	}
	var req MoveWikiRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}

	ctx := r.Context()
	wsID := resolveWorkspaceID(r)

	pID := pgtype.UUID{Valid: false}
	if req.ParentID != nil && *req.ParentID != "" {
		pID = parseUUID(*req.ParentID)
	}

	_, err := h.DB.Exec(ctx,
		"UPDATE wikis SET parent_id = $3, sort_order = $4, updated_at = NOW() WHERE id = $1 AND workspace_id = $2",
		parseUUID(id), parseUUID(wsID), pID, req.SortOrder,
	)
	if err != nil {
		slog.Error("MoveWiki failed", "error", err, "wiki_id", id)
		writeError(w, http.StatusInternalServerError, "failed to move wiki")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) DeleteWiki(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ctx := r.Context()
	wsID := resolveWorkspaceID(r)

	_, err := h.DB.Exec(ctx, "DELETE FROM wikis WHERE id = $1 AND workspace_id = $2", parseUUID(id), parseUUID(wsID))
	if err != nil {
		slog.Error("DeleteWiki failed", "error", err, "wiki_id", id)
		writeError(w, http.StatusInternalServerError, "failed to delete wiki")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

type CollaborationWebhookRequest struct {
	DocumentName string `json:"documentName"`
	Content      string `json:"content"`
	UserID       string `json:"userId"`
}

func (h *Handler) CollaborationWebhook(w http.ResponseWriter, r *http.Request) {
	// Validate shared secret when COLLABORATION_WEBHOOK_SECRET is configured
	if secret := os.Getenv("COLLABORATION_WEBHOOK_SECRET"); secret != "" {
		if r.Header.Get("X-Webhook-Secret") != secret {
			slog.Warn("CollaborationWebhook: invalid secret", "remote_addr", r.RemoteAddr)
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
	}

	var req CollaborationWebhookRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}

	// DocumentName format: "wiki-UUID"
	if !regexp.MustCompile(`^wiki-`).MatchString(req.DocumentName) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ignored"})
		return
	}
	wikiID := req.DocumentName[5:] // strip "wiki-" prefix

	ctx := r.Context()
	slog.Info("Collaboration update received", "wiki_id", wikiID, "user_id", req.UserID)

	// Only sync and snapshot when content is non-empty.
	// The collab server transformer currently cannot extract markdown from the Yjs
	// document, so it sends an empty content field. Skipping the UPDATE here prevents
	// overwriting real wiki content with an empty string on every keystroke.
	// Content persistence is handled by the client-side autosave (10s debounce) instead.
	if req.Content != "" {
		// 1. Sync wikis.content in real-time (version unchanged — optimistic lock only applies on explicit saves)
		_, err := h.DB.Exec(ctx,
			"UPDATE wikis SET content = $2, updated_at = NOW() WHERE id = $1",
			parseUUID(wikiID), req.Content,
		)
		if err != nil {
			slog.Error("CollaborationWebhook update failed", "error", err, "wiki_id", wikiID)
			writeError(w, http.StatusInternalServerError, "failed to update wiki via webhook")
			return
		}

		// 2. Schedule a 30s debounced snapshot — once the collaboration session quiets down,
		// write a version into wiki_versions so history is created even without explicit saves
		if h.WikiSnapshots != nil {
			h.WikiSnapshots.Schedule(wikiID, req.Content, req.UserID)
		}
	}

	w.WriteHeader(http.StatusNoContent)
}
