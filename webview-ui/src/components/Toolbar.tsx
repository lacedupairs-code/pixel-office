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
