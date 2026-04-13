"use client";

import {
  FileArchive,
  FileCode,
  FileImage,
  FileMusic,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideoCamera,
  Presentation,
} from "lucide-react";
import { cn } from "@multica/ui/lib/utils";

export type AttachmentFileKind =
  | "archive"
  | "audio"
  | "code"
  | "document"
  | "image"
  | "markdown"
  | "pdf"
  | "presentation"
  | "spreadsheet"
  | "text"
  | "video"
  | "file";

const EXTENSION_KIND_MAP: Record<string, AttachmentFileKind> = {
  "7z": "archive",
  aac: "audio",
  avi: "video",
  bmp: "image",
  css: "code",
  csv: "spreadsheet",
  doc: "document",
  docx: "document",
  gif: "image",
  gz: "archive",
  htm: "code",
  html: "code",
  ico: "image",
  jpeg: "image",
  jpg: "image",
  js: "code",
  json: "code",
  jsx: "code",
  m4a: "audio",
  markdown: "markdown",
  md: "markdown",
  mov: "video",
  mp3: "audio",
  mp4: "video",
  ogg: "audio",
  pdf: "pdf",
  png: "image",
  ppt: "presentation",
  pptx: "presentation",
  rar: "archive",
  svg: "image",
  tar: "archive",
  ts: "code",
  tsx: "code",
  txt: "text",
  wav: "audio",
  webm: "video",
  webp: "image",
  xls: "spreadsheet",
  xlsm: "spreadsheet",
  xlsx: "spreadsheet",
  xml: "code",
  yaml: "code",
  yml: "code",
  zip: "archive",
};

function extensionFromValue(value: string): string {
  const path = (() => {
    try {
      return new URL(value).pathname;
    } catch {
      return value.split(/[?#]/)[0] ?? value;
    }
  })();
  const name = path.split("/").pop() ?? path;
  const dotIndex = name.lastIndexOf(".");
  return dotIndex >= 0 ? name.slice(dotIndex + 1).toLowerCase() : "";
}

export function getAttachmentFileKind(href: string, filename: string): AttachmentFileKind {
  const extension = extensionFromValue(filename) || extensionFromValue(href);
  return EXTENSION_KIND_MAP[extension] ?? "file";
}

export function AttachmentFileIcon({
  href,
  filename,
  className,
}: {
  href: string;
  filename: string;
  className?: string;
}) {
  const kind = getAttachmentFileKind(href, filename);
  const iconClassName = cn("shrink-0 text-muted-foreground", className);

  switch (kind) {
    case "archive":
      return <FileArchive className={iconClassName} />;
    case "audio":
      return <FileMusic className={iconClassName} />;
    case "code":
    case "markdown":
      return <FileCode className={iconClassName} />;
    case "image":
      return <FileImage className={iconClassName} />;
    case "pdf":
      return <FileType className={iconClassName} />;
    case "presentation":
      return <Presentation className={iconClassName} />;
    case "spreadsheet":
      return <FileSpreadsheet className={iconClassName} />;
    case "video":
      return <FileVideoCamera className={iconClassName} />;
    case "document":
    case "text":
    case "file":
    default:
      return <FileText className={iconClassName} />;
  }
}
