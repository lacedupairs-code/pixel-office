import type { CSSProperties } from "react";
import type { LayoutAgentSeat, LayoutPaintMode, OfficeLayout, TileSelectionBounds } from "../office/types";

interface LayoutEditorProps {
  layout: OfficeLayout;
  selectedTool: OfficeLayout["tiles"][number]["type"] | "erase";
  selectedPaintMode: LayoutPaintMode;
  agentIds: string[];
  selectedSeatAgentId: string | null;
  selectionBounds: TileSelectionBounds | null;
  onSelectTool: (tool: LayoutTool) => void;
  onSelectPaintMode: (mode: LayoutPaintMode) => void;
  onAssignSeat: (agentId: string, value: string) => void;
  onSelectSeatAgent: (agentId: string | null) => void;
  onClearSelection: () => void;
  onDeleteSelection: () => void;
  onMoveSelection: (deltaX: number, deltaY: number) => void;
  onDuplicateSelection: (deltaX: number, deltaY: number) => void;
}

const tools: LayoutTool[] = ["floor", "wall", "desk", "coffee", "couch", "erase"];
const paintModes: LayoutPaintMode[] = ["brush", "line", "rect", "fill", "select"];

export function LayoutEditor({
  layout,
  selectedTool,
  selectedPaintMode,
  agentIds,
  selectedSeatAgentId,
  selectionBounds,
  onSelectTool,
  onSelectPaintMode,
  onAssignSeat,
  onSelectSeatAgent,
  onClearSelection,
  onDeleteSelection,
  onMoveSelection,
  onDuplicateSelection
}: LayoutEditorProps) {
  const desks = layout.tiles
    .filter((tile) => tile.type === "desk")
    .sort((left, right) => left.y - right.y || left.x - right.x);
  const seatMap = new Map(layout.agents.map((seat) => [seat.agentId, seat]));
  const selectionWidth = selectionBounds ? selectionBounds.maxX - selectionBounds.minX + 1 : 0;
  const selectionHeight = selectionBounds ? selectionBounds.maxY - selectionBounds.minY + 1 : 0;

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
        <div style={styles.assignmentHeading}>Paint Mode</div>
        <div style={styles.modeGrid}>
          {paintModes.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onSelectPaintMode(mode)}
              style={{
                ...styles.toolButton,
                ...(selectedPaintMode === mode ? styles.toolButtonActive : null)
              }}
            >
              {mode}
            </button>
          ))}
        </div>
        <p style={styles.note}>`brush` paints continuously, `line` draws between click and release, `rect` fills a dragged box, `fill` floods a connected region, and `select` creates a marquee.</p>
      </section>
      <section style={styles.assignmentSection}>
        <div style={styles.assignmentHeading}>Selection</div>
        <div style={styles.metaBox}>
          <div>
            Bounds:{" "}
            {selectionBounds
              ? `${selectionBounds.minX},${selectionBounds.minY} -> ${selectionBounds.maxX},${selectionBounds.maxY}`
              : "None"}
          </div>
        </div>
        <p style={styles.note}>Drag a selected block to move it on the canvas. Hold `Alt` while dragging to duplicate it.</p>
        <div style={styles.modeGrid}>
          <button type="button" onClick={() => onMoveSelection(0, -1)} style={styles.toolButton} disabled={!selectionBounds}>
            Up
          </button>
          <button type="button" onClick={() => onMoveSelection(0, 1)} style={styles.toolButton} disabled={!selectionBounds}>
            Down
          </button>
          <button type="button" onClick={() => onMoveSelection(-1, 0)} style={styles.toolButton} disabled={!selectionBounds}>
            Left
          </button>
          <button type="button" onClick={() => onMoveSelection(1, 0)} style={styles.toolButton} disabled={!selectionBounds}>
            Right
          </button>
          <button type="button" onClick={onDeleteSelection} style={styles.toolButton} disabled={!selectionBounds}>
            Delete
          </button>
          <button type="button" onClick={onClearSelection} style={styles.toolButton} disabled={!selectionBounds}>
            Clear
          </button>
        </div>
        <div style={styles.assignmentHeading}>Duplicate</div>
        <div style={styles.modeGrid}>
          <button
            type="button"
            onClick={() => onDuplicateSelection(0, -selectionHeight)}
            style={styles.toolButton}
            disabled={!selectionBounds}
          >
            Copy Up
          </button>
          <button
            type="button"
            onClick={() => onDuplicateSelection(0, selectionHeight)}
            style={styles.toolButton}
            disabled={!selectionBounds}
          >
            Copy Down
          </button>
          <button
            type="button"
            onClick={() => onDuplicateSelection(-selectionWidth, 0)}
            style={styles.toolButton}
            disabled={!selectionBounds}
          >
            Copy Left
          </button>
          <button
            type="button"
            onClick={() => onDuplicateSelection(selectionWidth, 0)}
            style={styles.toolButton}
            disabled={!selectionBounds}
          >
            Copy Right
          </button>
        </div>
      </section>
      <section style={styles.assignmentSection}>
        <div style={styles.assignmentHeading}>Seat Assignments</div>
        <p style={styles.note}>
          Choose an agent below, then click a desk on the canvas to assign that seat directly from the map.
        </p>
        {agentIds.length === 0 ? <p style={styles.note}>No live agents yet. Once the socket feed is active, desk assignment options will appear here.</p> : null}
        {agentIds.map((agentId) => (
          <div key={agentId} style={styles.assignmentCard}>
            <label style={styles.assignmentRow}>
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
            <button
              type="button"
              onClick={() => onSelectSeatAgent(selectedSeatAgentId === agentId ? null : agentId)}
              style={{
                ...styles.assignButton,
                ...(selectedSeatAgentId === agentId ? styles.assignButtonActive : null)
              }}
            >
              {selectedSeatAgentId === agentId ? "Cancel Map Assign" : "Assign On Map"}
            </button>
          </div>
        ))}
      </section>
      <p style={styles.note}>Drag painting is now supported on the canvas. Auto-tiling and marquee tools can build on this next.</p>
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
  modeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "8px"
  },
  assignmentRow: {
    display: "grid",
    gap: "6px"
  },
  assignmentCard: {
    display: "grid",
    gap: "8px",
    padding: "10px",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.03)"
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
  assignButton: {
    appearance: "none",
    borderRadius: "10px",
    padding: "9px 12px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#f0dfc4",
    cursor: "pointer",
    fontSize: "12px"
  },
  assignButtonActive: {
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
