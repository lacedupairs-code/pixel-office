import type { CSSProperties } from "react";

interface ToolbarProps {
  editMode: boolean;
  onToggleEditMode: () => void;
  onResetLayout: () => void;
  onExportLayout: () => void;
}

export function Toolbar({ editMode, onToggleEditMode, onResetLayout, onExportLayout }: ToolbarProps) {
  return (
    <div style={styles.row}>
      <button type="button" style={styles.primaryButton} onClick={onToggleEditMode}>
        {editMode ? "Close Editor" : "Edit Layout"}
      </button>
      <button type="button" style={styles.button} onClick={onResetLayout}>
        Reset Layout
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
  primaryButton: {
    ...baseButton,
    background: "#f0b56a",
    color: "#241a12",
    fontWeight: 700
  }
};

