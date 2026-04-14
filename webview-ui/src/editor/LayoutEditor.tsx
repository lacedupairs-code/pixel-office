import type { CSSProperties } from "react";
import type { LayoutTool, OfficeLayout } from "../office/types";

interface LayoutEditorProps {
  layout: OfficeLayout;
  selectedTool: LayoutTool;
  onSelectTool: (tool: LayoutTool) => void;
}

const tools: LayoutTool[] = ["floor", "wall", "desk", "coffee", "couch", "erase"];

export function LayoutEditor({ layout, selectedTool, onSelectTool }: LayoutEditorProps) {
  return (
    <aside style={styles.panel}>
      <h2 style={styles.title}>Layout Editor</h2>
      <p style={styles.copy}>Click the office grid to paint tiles. This is the first foundation layer for the editor workflow.</p>
      <div style={styles.metaBox}>
        <div>Grid: {layout.cols} x {layout.rows}</div>
        <div>Tiles: {layout.tiles.length}</div>
        <div>Seats: {layout.agents.length}</div>
      </div>
      <div style={styles.toolGrid}>
        {tools.map((tool) => (
          <button
            key={tool}
            type="button"
            onClick={() => onSelectTool(tool)}
            style={{
              ...styles.toolButton,
              ...(selectedTool === tool ? styles.toolButtonActive : null)
            }}
          >
            {tool}
          </button>
        ))}
      </div>
      <p style={styles.note}>This first editor pass supports tile painting and erasing. Seat assignment, undo, and auto-tiling can build on it next.</p>
    </aside>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: {
    padding: "20px",
    border: "1px solid rgba(255, 231, 198, 0.15)",
    borderRadius: "16px",
    background: "rgba(30, 24, 19, 0.9)",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.35)",
    display: "grid",
    gap: "14px"
  },
  title: {
    margin: 0,
    fontSize: "18px"
  },
  copy: {
    margin: 0,
    fontSize: "13px",
    lineHeight: 1.5,
    color: "#d8c3a3"
  },
  metaBox: {
    display: "grid",
    gap: "6px",
    padding: "12px",
    borderRadius: "12px",
    background: "rgba(255,255,255,0.05)",
    fontSize: "13px"
  },
  toolGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "10px"
  },
  toolButton: {
    appearance: "none",
    borderRadius: "12px",
    padding: "10px 12px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#f0dfc4",
    cursor: "pointer",
    textTransform: "capitalize"
  },
  toolButtonActive: {
    background: "#f0b56a",
    color: "#241a12",
    fontWeight: 700
  },
  note: {
    margin: 0,
    fontSize: "12px",
    color: "#bda988",
    lineHeight: 1.5
  }
};

