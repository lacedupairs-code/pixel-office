import type { CSSProperties } from "react";
import type { LayoutAgentSeat, LayoutTool, OfficeLayout } from "../office/types";

interface LayoutEditorProps {
  layout: OfficeLayout;
  selectedTool: LayoutTool;
  agentIds: string[];
  onSelectTool: (tool: LayoutTool) => void;
  onAssignSeat: (agentId: string, value: string) => void;
}

const tools: LayoutTool[] = ["floor", "wall", "desk", "coffee", "couch", "erase"];

export function LayoutEditor({ layout, selectedTool, agentIds, onSelectTool, onAssignSeat }: LayoutEditorProps) {
  const desks = layout.tiles
    .filter((tile) => tile.type === "desk")
    .sort((left, right) => left.y - right.y || left.x - right.x);
  const seatMap = new Map(layout.agents.map((seat) => [seat.agentId, seat]));

  return (
    <aside style={styles.panel}>
      <h2 style={styles.title}>Layout Editor</h2>
      <p style={styles.copy}>Click the office grid to paint tiles, then assign agents to desks from the current layout.</p>
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
      <section style={styles.assignmentSection}>
        <div style={styles.assignmentHeading}>Seat Assignments</div>
        {agentIds.length === 0 ? <p style={styles.note}>No live agents yet. Once the socket feed is active, desk assignment options will appear here.</p> : null}
        {agentIds.map((agentId) => (
          <label key={agentId} style={styles.assignmentRow}>
            <span style={styles.agentLabel}>{agentId}</span>
            <select
              value={serializeSeat(seatMap.get(agentId))}
              onChange={(event) => onAssignSeat(agentId, event.target.value)}
              style={styles.select}
            >
              <option value="">Unassigned</option>
              {desks.map((desk) => (
                <option key={`${desk.x}-${desk.y}`} value={`${desk.x},${desk.y}`}>
                  Desk {desk.x}, {desk.y}
                </option>
              ))}
            </select>
          </label>
        ))}
      </section>
      <p style={styles.note}>Undo and redo are now available from the toolbar. Auto-tiling and drag editing can build on this next.</p>
    </aside>
  );
}

function serializeSeat(seat: LayoutAgentSeat | undefined) {
  if (!seat) {
    return "";
  }

  return `${seat.deskX},${seat.deskY}`;
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
  assignmentSection: {
    display: "grid",
    gap: "10px",
    padding: "14px",
    borderRadius: "12px",
    background: "rgba(255,255,255,0.04)"
  },
  assignmentHeading: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#f0dfc4"
  },
  assignmentRow: {
    display: "grid",
    gap: "6px"
  },
  agentLabel: {
    fontSize: "12px",
    color: "#d8c3a3"
  },
  select: {
    borderRadius: "10px",
    padding: "10px 12px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(22,18,15,0.85)",
    color: "#f0dfc4"
  },
  note: {
    margin: 0,
    fontSize: "12px",
    color: "#bda988",
    lineHeight: 1.5
  }
};
