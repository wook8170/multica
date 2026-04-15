package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/multica-ai/multica/server/internal/logger"
	"github.com/multica-ai/multica/server/internal/sanitize"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

// ---------------------------------------------------------------------------
// Response type
// ---------------------------------------------------------------------------

type WikiCommentResponse struct {
	ID          string               `json:"id"`
	WikiID      string               `json:"wiki_id"`
	ParentID    *string              `json:"parent_id"`
	AuthorType  string               `json:"author_type"`
	AuthorID    string               `json:"author_id"`
	Content     string               `json:"content"`
	CreatedAt   string               `json:"created_at"`
	UpdatedAt   string               `json:"updated_at"`
	Attachments []AttachmentResponse `json:"attachments"`
}

func wikiCommentToResponse(c db.WikiComment, attachments []AttachmentResponse) WikiCommentResponse {
	if attachments == nil {
		attachments = []AttachmentResponse{}
	}
	var parentID *string
	if c.ParentID.Valid {
		s := uuidToString(c.ParentID)
		parentID = &s
	}
	return WikiCommentResponse{
		ID:          uuidToString(c.ID),
		WikiID:      uuidToString(c.WikiID),
		ParentID:    parentID,
		AuthorType:  c.AuthorType,
		AuthorID:    uuidToString(c.AuthorID),
		Content:     c.Content,
		CreatedAt:   timestampToString(c.CreatedAt),
		UpdatedAt:   timestampToString(c.UpdatedAt),
		Attachments: attachments,
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// groupWikiCommentAttachments loads attachments for multiple wiki comments grouped by comment ID.
func (h *Handler) groupWikiCommentAttachments(r *http.Request, commentIDs []pgtype.UUID) map[string][]AttachmentResponse {
	if len(commentIDs) == 0 {
		return nil
	}
	workspaceID := resolveWorkspaceID(r)
	attachments, err := h.Queries.ListAttachmentsByWikiCommentIDs(r.Context(), db.ListAttachmentsByWikiCommentIDsParams{
		Column1:     commentIDs,
		WorkspaceID: parseUUID(workspaceID),
	})
	if err != nil {
		slog.Error("failed to load attachments for wiki comments", "error", err)
		return nil
	}
	grouped := make(map[string][]AttachmentResponse, len(commentIDs))
	for _, a := range attachments {
		cid := uuidToString(a.CommentID)
		grouped[cid] = append(grouped[cid], h.attachmentToResponse(a))
	}
	return grouped
}

// linkWikiCommentAttachmentsByIDs links uploaded attachments to a wiki comment.
func (h *Handler) linkWikiCommentAttachmentsByIDs(ctx context.Context, commentID, wikiID pgtype.UUID, ids []string) {
	uuids := make([]pgtype.UUID, len(ids))
	for i, id := range ids {
		uuids[i] = parseUUID(id)
	}
	if err := h.Queries.LinkAttachmentsToWikiComment(ctx, db.LinkAttachmentsToWikiCommentParams{
		CommentID: commentID,
		WikiID:    wikiID,
		Column3:   uuids,
	}); err != nil {
		slog.Error("failed to link attachments to wiki comment", "error", err)
	}
}

// loadWikiForComments validates that the wiki exists in the current workspace and returns its UUID.
func (h *Handler) loadWikiForComments(w http.ResponseWriter, r *http.Request, wikiID string) (pgtype.UUID, bool) {
	wsID := resolveWorkspaceID(r)
	wikiUUID := parseUUID(wikiID)
	wsUUID := parseUUID(wsID)

	var exists bool
	err := h.DB.QueryRow(r.Context(),
		"SELECT EXISTS(SELECT 1 FROM wikis WHERE id = $1 AND workspace_id = $2)",
		wikiUUID, wsUUID,
	).Scan(&exists)
	if err != nil || !exists {
		writeError(w, http.StatusNotFound, "wiki not found")
		return pgtype.UUID{}, false
	}
	return wikiUUID, true
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// ListWikiComments — GET /api/wikis/{id}/comments
func (h *Handler) ListWikiComments(w http.ResponseWriter, r *http.Request) {
	wikiID := chi.URLParam(r, "id")
	wsID := resolveWorkspaceID(r)

	wikiUUID, ok := h.loadWikiForComments(w, r, wikiID)
	if !ok {
		return
	}

	comments, err := h.Queries.ListWikiComments(r.Context(), db.ListWikiCommentsParams{
		WikiID:      wikiUUID,
		WorkspaceID: parseUUID(wsID),
	})
	if err != nil {
		slog.Error("ListWikiComments failed", "error", err, "wiki_id", wikiID)
		writeError(w, http.StatusInternalServerError, "failed to list wiki comments")
		return
	}

	commentIDs := make([]pgtype.UUID, len(comments))
	for i, c := range comments {
		commentIDs[i] = c.ID
	}
	grouped := h.groupWikiCommentAttachments(r, commentIDs)

	resp := make([]WikiCommentResponse, len(comments))
	for i, c := range comments {
		cid := uuidToString(c.ID)
		resp[i] = wikiCommentToResponse(c, grouped[cid])
	}

	writeJSON(w, http.StatusOK, resp)
}

type CreateWikiCommentRequest struct {
	Content       string   `json:"content"`
	ParentID      *string  `json:"parent_id"`
	AttachmentIDs []string `json:"attachment_ids"`
}

// CreateWikiComment — POST /api/wikis/{id}/comments
func (h *Handler) CreateWikiComment(w http.ResponseWriter, r *http.Request) {
	wikiID := chi.URLParam(r, "id")

	wikiUUID, ok := h.loadWikiForComments(w, r, wikiID)
	if !ok {
		return
	}

	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	var req CreateWikiCommentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Content == "" {
		writeError(w, http.StatusBadRequest, "content is required")
		return
	}

	wsID := resolveWorkspaceID(r)
	req.Content = sanitize.HTML(req.Content)

	var parentID pgtype.UUID
	if req.ParentID != nil {
		parentID = parseUUID(*req.ParentID)
		parent, err := h.Queries.GetWikiCommentInWorkspace(r.Context(), db.GetWikiCommentInWorkspaceParams{
			ID:          parentID,
			WorkspaceID: parseUUID(wsID),
		})
		if err != nil || uuidToString(parent.WikiID) != wikiID {
			writeError(w, http.StatusBadRequest, "invalid parent comment")
			return
		}
	}

	comment, err := h.Queries.CreateWikiComment(r.Context(), db.CreateWikiCommentParams{
		WikiID:      wikiUUID,
		WorkspaceID: parseUUID(wsID),
		AuthorType:  "member",
		AuthorID:    parseUUID(userID),
		Content:     req.Content,
		ParentID:    parentID,
	})
	if err != nil {
		slog.Warn("create wiki comment failed", append(logger.RequestAttrs(r), "error", err, "wiki_id", wikiID)...)
		writeError(w, http.StatusInternalServerError, "failed to create wiki comment")
		return
	}

	if len(req.AttachmentIDs) > 0 {
		h.linkWikiCommentAttachmentsByIDs(r.Context(), comment.ID, wikiUUID, req.AttachmentIDs)
	}

	groupedAtt := h.groupWikiCommentAttachments(r, []pgtype.UUID{comment.ID})
	resp := wikiCommentToResponse(comment, groupedAtt[uuidToString(comment.ID)])

	slog.Info("wiki comment created", append(logger.RequestAttrs(r), "comment_id", uuidToString(comment.ID), "wiki_id", wikiID)...)
	h.publish(protocol.EventWikiCommentCreated, wsID, "member", userID, map[string]any{"comment": resp})
	writeJSON(w, http.StatusCreated, resp)
}

// UpdateWikiComment — PUT /api/wiki_comments/{commentId}
func (h *Handler) UpdateWikiComment(w http.ResponseWriter, r *http.Request) {
	commentId := chi.URLParam(r, "commentId")

	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	workspaceID := resolveWorkspaceID(r)
	existing, err := h.Queries.GetWikiCommentInWorkspace(r.Context(), db.GetWikiCommentInWorkspaceParams{
		ID:          parseUUID(commentId),
		WorkspaceID: parseUUID(workspaceID),
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "wiki comment not found")
		return
	}

	member, ok := h.workspaceMember(w, r, workspaceID)
	if !ok {
		return
	}

	isAuthor := uuidToString(existing.AuthorID) == userID
	isAdmin := roleAllowed(member.Role, "owner", "admin")
	if !isAuthor && !isAdmin {
		writeError(w, http.StatusForbidden, "only comment author or admin can edit")
		return
	}

	var req struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Content == "" {
		writeError(w, http.StatusBadRequest, "content is required")
		return
	}

	req.Content = sanitize.HTML(req.Content)

	comment, err := h.Queries.UpdateWikiComment(r.Context(), db.UpdateWikiCommentParams{
		ID:      parseUUID(commentId),
		Content: req.Content,
	})
	if err != nil {
		slog.Warn("update wiki comment failed", append(logger.RequestAttrs(r), "error", err, "comment_id", commentId)...)
		writeError(w, http.StatusInternalServerError, "failed to update wiki comment")
		return
	}

	groupedAtt := h.groupWikiCommentAttachments(r, []pgtype.UUID{comment.ID})
	resp := wikiCommentToResponse(comment, groupedAtt[uuidToString(comment.ID)])

	slog.Info("wiki comment updated", append(logger.RequestAttrs(r), "comment_id", commentId)...)
	h.publish(protocol.EventWikiCommentUpdated, workspaceID, "member", userID, map[string]any{"comment": resp})
	writeJSON(w, http.StatusOK, resp)
}

// DeleteWikiComment — DELETE /api/wiki_comments/{commentId}
func (h *Handler) DeleteWikiComment(w http.ResponseWriter, r *http.Request) {
	commentId := chi.URLParam(r, "commentId")

	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	workspaceID := resolveWorkspaceID(r)
	comment, err := h.Queries.GetWikiCommentInWorkspace(r.Context(), db.GetWikiCommentInWorkspaceParams{
		ID:          parseUUID(commentId),
		WorkspaceID: parseUUID(workspaceID),
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "wiki comment not found")
		return
	}

	member, ok := h.workspaceMember(w, r, workspaceID)
	if !ok {
		return
	}

	isAuthor := uuidToString(comment.AuthorID) == userID
	isAdmin := roleAllowed(member.Role, "owner", "admin")
	if !isAuthor && !isAdmin {
		writeError(w, http.StatusForbidden, "only comment author or admin can delete")
		return
	}

	attachmentURLs, _ := h.Queries.ListAttachmentURLsByWikiCommentID(r.Context(), parseUUID(commentId))

	if err := h.Queries.DeleteWikiComment(r.Context(), parseUUID(commentId)); err != nil {
		slog.Warn("delete wiki comment failed", append(logger.RequestAttrs(r), "error", err, "comment_id", commentId)...)
		writeError(w, http.StatusInternalServerError, "failed to delete wiki comment")
		return
	}

	h.deleteS3Objects(r.Context(), attachmentURLs)
	slog.Info("wiki comment deleted", append(logger.RequestAttrs(r), "comment_id", commentId, "wiki_id", uuidToString(comment.WikiID))...)
	h.publish(protocol.EventWikiCommentDeleted, workspaceID, "member", userID, map[string]any{
		"comment_id": commentId,
		"wiki_id":    uuidToString(comment.WikiID),
	})
	w.WriteHeader(http.StatusNoContent)
}
