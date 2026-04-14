import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { ResolvedPos } from "@tiptap/pm/model";

function findTableDepth($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.spec.tableRole === "table") return depth;
  }
  return null;
}

function selectionTouchesTables(editor: Editor): Array<{ from: number; to: number }> {
  const { doc, selection } = editor.state;
  const ranges: Array<{ from: number; to: number }> = [];

  doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (node.type.spec.tableRole === "table") {
      ranges.push({ from: pos, to: pos + node.nodeSize });
      return false;
    }
    return undefined;
  });

  return ranges;
}

function isSelectionInsideTable(editor: Editor): boolean {
  const { selection } = editor.state;
  return findTableDepth(selection.$from) !== null || findTableDepth(selection.$to) !== null;
}

function isAtStartOfTableSelection(editor: Editor, tableDepth: number): boolean {
  const { selection } = editor.state;
  const $from = selection.$from;
  if ($from.parentOffset !== 0) return false;
  for (let depth = tableDepth + 1; depth <= $from.depth; depth++) {
    if ($from.index(depth - 1) !== 0) return false;
  }
  return true;
}

function isAtEndOfTableSelection(editor: Editor, tableDepth: number): boolean {
  const { selection } = editor.state;
  const $to = selection.$to;
  if ($to.parentOffset !== $to.parent.content.size) return false;
  for (let depth = tableDepth + 1; depth <= $to.depth; depth++) {
    const parent = $to.node(depth - 1);
    if ($to.index(depth - 1) !== parent.childCount - 1) return false;
  }
  return true;
}

function hasMeaningfulContentBefore(editor: Editor, pos: number): boolean {
  const { doc } = editor.state;
  let found = false;

  doc.nodesBetween(0, pos, (node, nodePos) => {
    if (found) return false;
    if (nodePos >= pos) return false;
    if (node.type.name === "doc") return undefined;

    if (node.isText) {
      if ((node.text ?? "").trim().length > 0) {
        found = true;
        return false;
      }
      return undefined;
    }

    if (node.isBlock && node.type.name === "paragraph") return undefined;

    found = true;
    return false;
  });

  return found;
}

function hasMeaningfulContentAfter(editor: Editor, pos: number): boolean {
  const { doc } = editor.state;
  let found = false;

  doc.nodesBetween(pos, doc.content.size, (node, nodePos) => {
    if (found) return false;
    if (nodePos < pos) return undefined;
    if (node.type.name === "doc") return undefined;

    if (node.isText) {
      if ((node.text ?? "").trim().length > 0) {
        found = true;
        return false;
      }
      return undefined;
    }

    if (node.isBlock && node.type.name === "paragraph") return undefined;

    found = true;
    return false;
  });

  return found;
}

function deleteBoundaryTableFromInside(
  editor: Editor,
  direction: "backward" | "forward",
): boolean {
  const { selection } = editor.state;
  const tableDepth = findTableDepth(selection.$from);
  if (tableDepth === null) return false;

  const tablePos = selection.$from.before(tableDepth);
  const tableNode = selection.$from.node(tableDepth);
  const tableEnd = tablePos + tableNode.nodeSize;

  if (direction === "backward") {
    if (hasMeaningfulContentBefore(editor, tablePos)) return false;
    if (!isAtStartOfTableSelection(editor, tableDepth)) return false;
    editor.chain().focus().deleteRange({ from: tablePos, to: tableEnd }).run();
    return true;
  }

  if (hasMeaningfulContentAfter(editor, tableEnd)) return false;
  if (!isAtEndOfTableSelection(editor, tableDepth)) return false;
  editor.chain().focus().deleteRange({ from: tablePos, to: tableEnd }).run();
  return true;
}

function deleteWholeTablesInSelection(editor: Editor): boolean {
  const ranges = selectionTouchesTables(editor);
  if (ranges.length === 0) return false;

  const { tr } = editor.state;
  const sorted = [...ranges].sort((a, b) => b.from - a.from);
  for (const range of sorted) {
    tr.delete(range.from, range.to);
  }
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

function deleteTableIfAllCellsSelected(editor: Editor): boolean {
  const selection = editor.state.selection as {
    $anchorCell?: ResolvedPos;
    forEachCell?: (f: (node: unknown, pos: number) => void) => void;
  };

  if (!selection.$anchorCell || typeof selection.forEachCell !== "function") return false;

  const tableDepth = findTableDepth(selection.$anchorCell);
  if (tableDepth === null) return false;

  const tableNode = selection.$anchorCell.node(tableDepth);
  const tablePos = selection.$anchorCell.before(tableDepth);

  let selectedCellCount = 0;
  selection.forEachCell(() => {
    selectedCellCount += 1;
  });

  let totalCellCount = 0;
  tableNode.forEach((row) => {
    totalCellCount += row.childCount;
  });

  if (selectedCellCount === 0 || selectedCellCount !== totalCellCount) return false;

  editor.chain().focus().deleteRange({ from: tablePos, to: tablePos + tableNode.nodeSize }).run();
  return true;
}

function deleteTableIfSelectionSpansWholeTable(editor: Editor): boolean {
  const { selection } = editor.state;
  if (selection.empty) return false;

  const fromTableDepth = findTableDepth(selection.$from);
  const toTableDepth = findTableDepth(selection.$to);
  if (fromTableDepth === null || toTableDepth === null) return false;

  const fromTablePos = selection.$from.before(fromTableDepth);
  const toTablePos = selection.$to.before(toTableDepth);
  if (fromTablePos !== toTablePos) return false;

  if (!isAtStartOfTableSelection(editor, fromTableDepth)) return false;
  if (!isAtEndOfTableSelection(editor, toTableDepth)) return false;

  const tableNode = selection.$from.node(fromTableDepth);
  editor
    .chain()
    .focus()
    .deleteRange({ from: fromTablePos, to: fromTablePos + tableNode.nodeSize })
    .run();
  return true;
}

function findAdjacentTableAtCursor(
  editor: Editor,
  direction: "backward" | "forward",
): { from: number; to: number } | null {
  const { doc, selection } = editor.state;
  const cursorPos = selection.from;
  let found: { from: number; to: number } | null = null;

  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.spec.tableRole !== "table") return undefined;

    const range = { from: pos, to: pos + node.nodeSize };
    if (direction === "backward" && range.to === cursorPos) {
      found = range;
      return false;
    }
    if (direction === "forward" && range.from === cursorPos) {
      found = range;
      return false;
    }
    return undefined;
  });

  return found;
}

function deleteAdjacentTableAtCursor(editor: Editor, direction: "backward" | "forward"): boolean {
  const range = findAdjacentTableAtCursor(editor, direction);
  if (!range) return false;
  editor.chain().focus().deleteRange(range).run();
  return true;
}

function handleDeleteLikeKey(editor: Editor, direction: "backward" | "forward"): boolean {
  const { selection } = editor.state;
  const insideTable = isSelectionInsideTable(editor);

  if (insideTable) {
    // If all cells are selected, delete the whole table block.
    if (!selection.empty && deleteTableIfAllCellsSelected(editor)) return true;
    // If a text selection spans from the first to the last table cell, delete the whole table block.
    if (!selection.empty && deleteTableIfSelectionSpansWholeTable(editor)) return true;
    // Inside a table, deleting should clear only the current selected content.
    if (!selection.empty) return editor.commands.deleteSelection();
    // If cursor is at the hard boundary of a top/bottom table, allow removing the whole table.
    if (deleteBoundaryTableFromInside(editor, direction)) return true;
    return false;
  }

  // Outside table: if selection crosses/selects table nodes, remove entire table blocks.
  if (!selection.empty) return deleteWholeTablesInSelection(editor);
  // Outside table with collapsed cursor: allow deleting an adjacent table block.
  return deleteAdjacentTableAtCursor(editor, direction);
}

export const TableDeleteShortcutExtension = Extension.create({
  name: "tableDeleteShortcut",
  addKeyboardShortcuts() {
    return {
      Backspace: () => handleDeleteLikeKey(this.editor, "backward"),
      Delete: () => handleDeleteLikeKey(this.editor, "forward"),
    };
  },
});
