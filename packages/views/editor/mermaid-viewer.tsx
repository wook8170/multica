"use client";

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { cn } from "@multica/ui/lib/utils";

// Initialize mermaid with basic theme
mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "loose",
  fontFamily: "inherit",
});

interface MermaidViewerProps {
  content: string;
}

export function MermaidViewer({ content }: MermaidViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const renderMermaid = async () => {
      if (!content) return;
      setIsRendering(true);

      try {
        // Clear previous state
        if (isMounted) {
          setError(null);
        }

        // Generate unique ID
        const id = `mermaid-${Math.random().toString(36).substring(2, 11)}`;
        
        // Render
        const { svg: svgOutput } = await mermaid.render(id, content);
        
        if (isMounted) {
          setSvg(svgOutput);
          setIsRendering(false);
        }
      } catch (err) {
        console.error("Mermaid render error:", err);
        if (isMounted) {
          setError("Failed to render diagram. Please check the syntax.");
          setIsRendering(false);
        }
      }
    };

    renderMermaid();

    return () => {
      isMounted = false;
    };
  }, [content]);

  if (error) {
    return (
      <div className="my-4 rounded-md border border-destructive/20 bg-destructive/5 p-4 text-xs text-destructive">
        <p className="font-semibold">Mermaid Error:</p>
        <p className="mt-1">{error}</p>
        <pre className="mt-2 overflow-x-auto rounded bg-background/50 p-2 text-[10px] opacity-70">
          {content}
        </pre>
      </div>
    );
  }

  return (
    <div className="mermaid-wrapper my-6 flex flex-col items-center">
      {isRendering && !svg && (
        <div className="flex h-32 w-full items-center justify-center rounded-md border border-border bg-muted/20 text-xs text-muted-foreground animate-pulse">
          Rendering diagram...
        </div>
      )}
      <div 
        ref={containerRef}
        className={cn(
          "mermaid-container w-full max-w-full overflow-x-auto flex justify-center",
          isRendering && "opacity-50"
        )}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
