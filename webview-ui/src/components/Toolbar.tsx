import type { CSSProperties } from "react";
import type { LayoutSlotRecord } from "../App";

interface ToolbarProps {
  editMode: boolean;
  canUndo: boolean;
  canRedo: boolean;
  activeSlot: string | null;
  slotRecords: Record<string, LayoutSlotRecord>;
  onToggleEditMode: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onResetLayout: () => void;
  onImportLayout: () => void;
  onExportLayout: () => void;
  onSaveSlot: (slotId: string) => void;
  onLoadSlot: (slotId: string) => void;
}

const layoutSlots = [
  { id: "slot-a", label: "Slot A" },
  { id: "slot-b", label: "Slot B" },
  { id: "slot-c", label: "Slot C" }
];

export function Toolbar({
  editMode,
  canUndo,
  canRedo,
  activeSlot,
  slotRecords,
  onToggleEditMode,
  onUndo,
  onRedo,
  onResetLayout,
  onImportLayout,
  onExportLayout,
  onSaveSlot,
  onLoadSlot
}: ToolbarProps) {
  return (
    <div style={styles.stack}>
      <div style={styles.row}>
        <button type="button" style={styles.primaryButton} onClick={onToggleEditMode}>
          {editMode ? "Close Editor" : "Edit Layout"}
        </button>
        <button
          type="button"
          style={{ ...styles.button, ...(!canUndo ? styles.disabledButton : null) }}
          onClick={onUndo}
          disabled={!canUndo}
        >
          Undo
        </button>
        <button
          type="button"
          style={{ ...styles.button, ...(!canRedo ? styles.disabledButton : null) }}
          onClick={onRedo}
          disabled={!canRedo}
        >
          Redo
        </button>
        <button type="button" style={styles.button} onClick={onResetLayout}>
          Reset Layout
        </button>
        <button type="button" style={styles.button} onClick={onImportLayout}>
          Import JSON
        </button>
        <button type="button" style={styles.button} onClick={onExportLayout}>
          Export JSON
        </button>
      </div>
      <div style={styles.row}>
        {layoutSlots.map((slot) => (
          <div key={slot.id} style={styles.slotGroup}>
            <div style={styles.thumbFrame}>
              <img
                src={buildSlotThumbnail(slotRecords[slot.id])}
                alt={`${slot.label} preview`}
                style={styles.thumbImage}
              />
            </div>
            <div style={styles.slotMeta}>
              <span style={{ ...styles.slotLabel, ...(activeSlot === slot.id ? styles.slotLabelActive : null) }}>
                {slot.label}
              </span>
              <span style={styles.slotStamp}>{formatSlotStamp(slotRecords[slot.id]?.savedAt)}</span>
              <span style={styles.slotSummary}>{formatSlotSummary(slotRecords[slot.id])}</span>
            </div>
            <button type="button" style={styles.button} onClick={() => onSaveSlot(slot.id)}>
              Save
            </button>
            <button type="button" style={styles.button} onClick={() => onLoadSlot(slot.id)}>
              Load
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const baseButton: CSSProperties = {
  appearance: "none",
  borderRadius: "999px",
  padding: "10px 14px",
  border: "1px solid rgba(255,255,255,0.12)",
  cursor: "pointer",
  fontSize: "13px"
};

const styles: Record<string, CSSProperties> = {
  stack: {
    display: "grid",
    gap: "10px"
  },
  row: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap"
  },
  slotGroup: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    padding: "6px 8px",
    borderRadius: "999px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)"
  },
  thumbFrame: {
    width: "44px",
    height: "44px",
    borderRadius: "10px",
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "#171311",
    flex: "0 0 auto"
  },
  thumbImage: {
    width: "100%",
    height: "100%",
    display: "block",
    imageRendering: "pixelated"
  },
  slotMeta: {
    display: "grid",
    gap: "2px"
  },
  slotLabel: {
    fontSize: "12px",
    color: "#d8c3a3",
    minWidth: "42px"
  },
  slotStamp: {
    fontSize: "10px",
    color: "#9d8b71",
    minWidth: "72px"
  },
  slotSummary: {
    fontSize: "10px",
    color: "#b9a589",
    minWidth: "110px"
  },
  slotLabelActive: {
    color: "#f0b56a",
    fontWeight: 700
  },
  button: {
    ...baseButton,
    background: "rgba(255,255,255,0.06)",
    color: "#f0dfc4"
  },
  disabledButton: {
    opacity: 0.45,
    cursor: "not-allowed"
  },
  primaryButton: {
    ...baseButton,
    background: "#f0b56a",
    color: "#241a12",
    fontWeight: 700
  }
};

function formatSlotStamp(value: string | undefined) {
  if (!value) {
    return "Empty";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Saved";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatSlotSummary(record: LayoutSlotRecord | undefined) {
  if (!record) {
    return "No saved layout";
  }

  const { layout } = record;
  return `${layout.cols}x${layout.rows}, ${layout.tiles.length} tiles, ${layout.agents.length} seats`;
}

function buildSlotThumbnail(record: LayoutSlotRecord | undefined) {
  if (!record) {
    return emptySlotThumbnail();
  }

  const { layout } = record;
  const cellSize = 4;
  const width = Math.max(1, layout.cols * cellSize);
  const height = Math.max(1, layout.rows * cellSize);
  const cells: string[] = [];

  for (let y = 0; y < layout.rows; y += 1) {
    for (let x = 0; x < layout.cols; x += 1) {
      const isBorder = x === 0 || y === 0 || x === layout.cols - 1 || y === layout.rows - 1;
      cells.push(
        `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" fill="${
          isBorder ? "#5b4837" : "#2a211c"
        }" />`
      );
    }
  }

  for (const tile of layout.tiles) {
    cells.push(
      `<rect x="${tile.x * cellSize}" y="${tile.y * cellSize}" width="${cellSize}" height="${cellSize}" fill="${thumbnailColor(tile.type)}" />`
    );
  }

  for (const seat of layout.agents) {
    cells.push(
      `<rect x="${seat.deskX * cellSize + 1}" y="${seat.deskY * cellSize + 1}" width="${Math.max(1, cellSize - 2)}" height="${Math.max(
        1,
        cellSize - 2
      )}" fill="#f0b56a" />`
    );
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${cells.join(
    ""
  )}</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function emptySlotThumbnail() {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" shape-rendering="crispEdges"><rect width="44" height="44" fill="#171311"/><rect x="6" y="6" width="32" height="32" rx="6" fill="#231c17" stroke="#3b3028"/><path d="M22 13v18M13 22h18" stroke="#7f6a55" stroke-width="2"/></svg>';
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function thumbnailColor(type: LayoutSlotRecord["layout"]["tiles"][number]["type"]) {
  switch (type) {
    case "wall":
      return "#7b6550";
    case "desk":
      return "#8e6d4f";
    case "coffee":
      return "#7aa38c";
    case "couch":
      return "#58707c";
    case "floor":
    default:
      return "#2a211c";
  }
}
