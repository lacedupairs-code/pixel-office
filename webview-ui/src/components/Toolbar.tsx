import type { CSSProperties } from "react";

interface ToolbarProps {
  editMode: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onToggleEditMode: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onResetLayout: () => void;
  onImportLayout: () => void;
  onExportLayout: () => void;
}

export function Toolbar({
  editMode,
  canUndo,
  canRedo,
  onToggleEditMode,
  onUndo,
  onRedo,
  onResetLayout,
  onImportLayout,
  onExportLayout
}: ToolbarProps) {
  return (
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
  row: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap"
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
