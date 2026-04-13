"use client";

import { useState } from "react";
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { Copy, Check } from "lucide-react";
import { cn } from "@multica/ui/lib/utils";
import { MermaidViewer } from "../mermaid-viewer";

function CodeBlockView({ node, editor }: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const language = node.attrs.language || "";

  const handleCopy = async () => {
    const text = node.textContent;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isMermaid = language === "mermaid";

  return (
    <NodeViewWrapper className="code-block-wrapper group/code relative my-2">
      <div
        contentEditable={false}
        className="code-block-header absolute top-0 right-0 z-20 flex items-center gap-1.5 px-2 py-1.5 opacity-0 transition-opacity group-hover/code:opacity-100"
      >
        {language && (
          <span className="text-xs text-muted-foreground select-none">
            {language}
          </span>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Copy code"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {isMermaid && (
        <div contentEditable={false} className="mb-2">
          <MermaidViewer content={node.textContent} />
        </div>
      )}

      <pre 
        spellCheck={false} 
        className={cn(
          isMermaid && !editor.isEditable && "hidden", // Hide text if mermaid and readonly
          isMermaid && editor.isEditable && "mt-2 opacity-50 focus-within:opacity-100 transition-opacity" // Dim text if mermaid and editing
        )}
      >
        {/* @ts-expect-error -- NodeViewContent supports as="code" at runtime */}
        <NodeViewContent as="code" />
      </pre>
    </NodeViewWrapper>
  );
}

export { CodeBlockView };
