type TableCellNode = {
  type: "tableHeader" | "tableCell";
  attrs?: {
    colspan?: number;
    rowspan?: number;
    colwidth?: null;
    backgroundColor?: string | null;
    textColor?: string | null;
    textAlign?: "left" | "center" | "right" | null;
  };
  content: Array<{
    type: "paragraph";
    content?: Array<{ type: "text"; text: string }>;
  }>;
};

type TableRowNode = {
  type: "tableRow";
  content: TableCellNode[];
};

export type TableNode = {
  type: "table";
  content: TableRowNode[];
};

const TRANSPARENT_COLORS = new Set([
  "",
  "transparent",
  "rgba(0, 0, 0, 0)",
  "rgba(0,0,0,0)",
]);

const DEFAULT_TEXT_COLORS = new Set([
  "rgb(0, 0, 0)",
  "rgb(0,0,0)",
  "rgb(17, 24, 39)",
  "rgb(17,24,39)",
]);

const DEFAULT_BG_COLORS = new Set([
  "rgb(255, 255, 255)",
  "rgb(255,255,255)",
]);

const DEFAULT_TEXT_ALIGN = new Set(["", "left", "start"]);

function normalizeText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldKeepBackground(raw: string): boolean {
  if (TRANSPARENT_COLORS.has(raw)) return false;
  if (DEFAULT_BG_COLORS.has(raw)) return false;
  return true;
}

function shouldKeepTextColor(raw: string): boolean {
  if (TRANSPARENT_COLORS.has(raw)) return false;
  if (DEFAULT_TEXT_COLORS.has(raw)) return false;
  return true;
}

function normalizeTextAlign(raw: string): "left" | "center" | "right" | null {
  const v = raw.trim().toLowerCase();
  if (DEFAULT_TEXT_ALIGN.has(v)) return null;
  if (v === "center") return "center";
  if (v === "right" || v === "end") return "right";
  return null;
}

export function buildStyledTableNodeFromHtml(html: string): TableNode | null {
  if (!html || typeof document === "undefined") return null;

  const sandbox = document.createElement("div");
  sandbox.style.position = "fixed";
  sandbox.style.left = "-10000px";
  sandbox.style.top = "-10000px";
  sandbox.style.visibility = "hidden";
  sandbox.style.pointerEvents = "none";
  sandbox.innerHTML = html;

  const table = sandbox.querySelector("table") as HTMLTableElement | null;
  if (!table) return null;

  document.body.appendChild(sandbox);

  try {
    const rows = Array.from(table.rows).filter((row) => row.cells.length > 0);
    if (rows.length === 0) return null;

    const hasHeaderRow = Array.from(rows[0]!.cells).every(
      (cell) => cell.tagName.toLowerCase() === "th",
    );

    const rowNodes: TableRowNode[] = rows
      .map((row, rowIndex) => {
        const isHeaderRow = hasHeaderRow && rowIndex === 0;
        const cells = Array.from(row.cells);

        const cellNodes: TableCellNode[] = cells.map((cell) => {
          const normalized = normalizeText(cell.textContent ?? "");
          const computed = window.getComputedStyle(cell);
          const computedBg = computed.backgroundColor || "";
          const computedTextColor = computed.color || "";
          const computedTextAlign = computed.textAlign || "";
          const hasClassStyle = cell.classList.length > 0;

          const backgroundColor = shouldKeepBackground(computedBg) && (hasClassStyle || !!cell.style.backgroundColor)
            ? computedBg
            : null;

          const textColor = shouldKeepTextColor(computedTextColor) && (hasClassStyle || !!cell.style.color)
            ? computedTextColor
            : null;

          const textAlign = hasClassStyle || !!cell.style.textAlign
            ? normalizeTextAlign(computedTextAlign)
            : null;

          return {
            type: isHeaderRow ? "tableHeader" : "tableCell",
            attrs: {
              colspan: cell.colSpan > 1 ? cell.colSpan : 1,
              rowspan: cell.rowSpan > 1 ? cell.rowSpan : 1,
              colwidth: null,
              backgroundColor,
              textColor,
              textAlign,
            },
            content: [
              normalized
                ? { type: "paragraph", content: [{ type: "text", text: normalized }] }
                : { type: "paragraph" },
            ],
          };
        });

        if (cellNodes.length === 0) return null;
        return { type: "tableRow", content: cellNodes };
      })
      .filter((row): row is TableRowNode => row !== null);

    if (rowNodes.length === 0) return null;
    return { type: "table", content: rowNodes };
  } finally {
    sandbox.remove();
  }
}
