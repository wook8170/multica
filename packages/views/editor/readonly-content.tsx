"use client";

/**
 * ReadonlyContent — lightweight markdown renderer for readonly content display.
 */

import { useMemo, useState, type ReactNode } from "react";
import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
} from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { createLowlight, common } from "lowlight";
// @ts-expect-error -- hast-util-to-html has no bundled type declarations
import { toHtml } from "hast-util-to-html";
import { Maximize2, Download, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@multica/ui/lib/utils";
import { useNavigation } from "../navigation";
import { IssueMentionCard } from "../issues/components/issue-mention-card";
import { ImageLightbox } from "./extensions/image-view";
import { AttachmentCard } from "./extensions/file-card";
import { ReadonlyLinkWrapper } from "./link-preview";
import { preprocessMarkdown } from "./utils/preprocess";
import { MermaidViewer } from "./mermaid-viewer";
import "./content-editor.css";

// ---------------------------------------------------------------------------
// Lowlight
// ---------------------------------------------------------------------------

const lowlight = createLowlight(common);

// ---------------------------------------------------------------------------
// Sanitization schema
// ---------------------------------------------------------------------------

const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), "mention"],
  },
  attributes: {
    ...defaultSchema.attributes,
    div: [
      ...(defaultSchema.attributes?.div ?? []),
      "dataType",
      "dataHref",
      "dataFilename",
    ],
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ["className", /^language-/],
      ["className", /^hljs/],
    ],
    img: [
      ...(defaultSchema.attributes?.img ?? []),
      "alt",
    ],
  },
};

// ---------------------------------------------------------------------------
// URL transform
// ---------------------------------------------------------------------------

function urlTransform(url: string): string {
  if (url.startsWith("mention://")) return url;
  return defaultUrlTransform(url);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function textFromChildren(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textFromChildren).join("");
  return "";
}

function IssueMentionLink({ issueId, label }: { issueId: string; label?: string }) {
  const { push, openInNewTab } = useNavigation();
  const path = `/issues/${issueId}`;
  return (
    <span
      className="inline align-middle"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.metaKey || e.ctrlKey || e.shiftKey) {
          if (openInNewTab) {
            openInNewTab(path, label);
          }
          return;
        }
        push(path);
      }}
    >
      <IssueMentionCard issueId={issueId} fallbackLabel={label} />
    </span>
  );
}

const components: Partial<Components> = {
  a: ({ href, children }) => {
    if (href?.startsWith("mention://")) {
      const match = href.match(
        /^mention:\/\/(member|agent|issue|all)\/(.+)$/,
      );
      if (match?.[1] === "issue" && match[2]) {
        const label = textFromChildren(children) || undefined;
        return <IssueMentionLink issueId={match[2]} label={label} />;
      }
      return <span className="mention">{children}</span>;
    }

    if (!href) return <a>{children}</a>;
    return <ReadonlyLinkWrapper href={href}>{children}</ReadonlyLinkWrapper>;
  },

  img: function ReadonlyImage({ src, alt }) {
    const [lightbox, setLightbox] = useState(false);
    const imgSrc = typeof src === "string" ? src : "";
    const imgAlt = alt ?? "";

    const handleView = () => setLightbox(true);
    const handleDownload = () => {
      window.open(imgSrc, "_blank", "noopener,noreferrer");
    };
    const handleCopyLink = async () => {
      try {
        await navigator.clipboard.writeText(imgSrc);
        toast.success("Link copied");
      } catch {
        toast.error("Failed to copy link");
      }
    };

    return (
      <span className="image-node">
        <span className="image-figure" onClick={handleView}>
          <img src={imgSrc} alt={imgAlt} className="image-content" draggable={false} />
          <span
            className="image-toolbar"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={handleView} title="View image">
              <Maximize2 className="size-3.5" />
            </button>
            <button type="button" onClick={handleDownload} title="Download">
              <Download className="size-3.5" />
            </button>
            <button type="button" onClick={handleCopyLink} title="Copy link">
              <LinkIcon className="size-3.5" />
            </button>
          </span>
        </span>
        {lightbox && (
          <ImageLightbox src={imgSrc} alt={imgAlt} onClose={() => setLightbox(false)} />
        )}
      </span>
    );
  },

  div: ({ node, children, ...props }) => {
    const properties = node?.properties ?? {};
    const dataType = (properties.dataType ?? properties["data-type"]) as string | undefined;
    if (dataType === "fileCard") {
      const rawHref = ((properties.dataHref ?? properties["data-href"]) as string) || "";
      const href = /^https?:\/\//i.test(rawHref) ? rawHref : "";
      const filename = ((properties.dataFilename ?? properties["data-filename"]) as string) || "";
      return (
        <AttachmentCard href={href} filename={filename} />
      );
    }
    return <div {...props}>{children}</div>;
  },

  table: ({ children }) => (
    <div className="tableWrapper">
      <table>{children}</table>
    </div>
  ),

  code: ({ className, children, node, ...props }) => {
    const langMatch = /language-(\w+)/.exec(className || "");
    const lang = langMatch ? langMatch[1] : undefined;
    
    if (lang === "mermaid") {
      const code = String(children).replace(/\n$/, "");
      return <MermaidViewer content={code} />;
    }

    const isBlock =
      node?.position &&
      node.position.start.line !== node.position.end.line;

    if (!isBlock && !lang) {
      return <code {...props}>{children}</code>;
    }

    const code = String(children).replace(/\n$/, "");
    try {
      const tree = lang
        ? lowlight.highlight(lang, code)
        : lowlight.highlightAuto(code);
      return (
        <code
          className={cn("hljs", lang && `language-${lang}`)}
          dangerouslySetInnerHTML={{ __html: toHtml(tree) }}
        />
      );
    } catch {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
  },

  pre: ({ children }) => <pre>{children}</pre>,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ReadonlyContentProps {
  content: string;
  className?: string;
}

export function ReadonlyContent({ content, className }: ReadonlyContentProps) {
  const processed = useMemo(() => preprocessMarkdown(content), [content]);

  return (
    <div className={cn("rich-text-editor readonly text-sm", className)}>
      <ReactMarkdown
        remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        urlTransform={urlTransform}
        components={components}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
