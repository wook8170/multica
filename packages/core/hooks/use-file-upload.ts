"use client";

import { useState, useCallback, useRef } from "react";
import type { ApiClient } from "../api/client";
import type { Attachment } from "../types";
import { MAX_FILE_SIZE } from "../constants/upload";

export interface UploadResult {
  id: string;
  filename: string;
  link: string;
}

export interface UploadContext {
  issueId?: string;
  commentId?: string;
  wikiId?: string;
  uploadSessionId?: string;
}

export function useFileUpload(
  api: ApiClient,
  onError?: (error: Error) => void,
) {
  const [uploading, setUploading] = useState(false);
  const inFlightRef = useRef<Map<string, Promise<UploadResult | null>>>(new Map());

  const getFileKey = useCallback((file: File, ctx?: UploadContext) => {
    return [
      file.name,
      file.size,
      file.lastModified,
      file.type,
      ctx?.issueId ?? "",
      ctx?.commentId ?? "",
      ctx?.wikiId ?? "",
      ctx?.uploadSessionId ?? "",
    ].join("::");
  }, []);

  const upload = useCallback(
    async (file: File, ctx?: UploadContext): Promise<UploadResult | null> => {
      if (file.size > MAX_FILE_SIZE) {
        throw new Error("File exceeds 100 MB limit");
      }

      const fileKey = getFileKey(file, ctx);
      const existing = inFlightRef.current.get(fileKey);
      if (existing) {
        return existing;
      }

      setUploading(true);
      const request = (async () => {
        const att: Attachment = await api.uploadFile(file, {
          issueId: ctx?.issueId,
          commentId: ctx?.commentId,
          wikiId: ctx?.wikiId,
          uploadSessionId: ctx?.uploadSessionId,
        });
        return { id: att.id, filename: att.filename, link: att.url };
      })();

      inFlightRef.current.set(fileKey, request);

      try {
        return await request;
      } finally {
        inFlightRef.current.delete(fileKey);
        setUploading(inFlightRef.current.size > 0);
      }
    },
    [api, getFileKey],
  );

  const uploadWithToast = useCallback(
    async (file: File, ctx?: UploadContext): Promise<UploadResult | null> => {
      try {
        return await upload(file, ctx);
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error("Upload failed"));
        return null;
      }
    },
    [upload, onError],
  );

  return { upload, uploadWithToast, uploading };
}
