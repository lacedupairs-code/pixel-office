import { useEffect, useState, type CSSProperties } from "react";
import defaultLayoutJson from "./assets/default-layout.json";
import { Toolbar } from "./components/Toolbar";
import { LayoutEditor } from "./editor/LayoutEditor";
import { useAgentSocket } from "./hooks/useAgentSocket";
import { OfficeCanvas } from "./office/OfficeCanvas";
import type { LayoutTile, LayoutTool, OfficeLayout } from "./office/types";
import { useOfficeStore } from "./store/officeStore";

export default function App() {
  useAgentSocket();

  const agents = useOfficeStore((state) => state.agents);
  const connectionState = useOfficeStore((state) => state.connectionState);
  const defaultLayout = sanitizeLayout(defaultLayoutJson as OfficeLayout);
  const [layout, setLayout] = useState<OfficeLayout>(defaultLayout);
  const [layoutHistory, setLayoutHistory] = useState<OfficeLayout[]>([]);
  const [futureLayouts, setFutureLayouts] = useState<OfficeLayout[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [selectedTool, setSelectedTool] = useState<LayoutTool>("floor");
  const knownAgentIds = Array.from(new Set([...layout.agents.map((seat) => seat.agentId), ...agents.map((agent) => agent.id)])).sort();

  useEffect(() => {
    document.title = "Pixel Office";
  }, []);

  function handlePaintTile(tileX: number, tileY: number) {
    commitLayout((current) => {
      const existingIndex = current.tiles.findIndex((tile) => tile.x === tileX && tile.y === tileY);
      const nextTiles = [...current.tiles];

      if (selectedTool === "erase") {
        if (existingIndex >= 0) {
          nextTiles.splice(existingIndex, 1);
        }
      } else {
        const nextTile: LayoutTile = {
          x: tileX,
          y: tileY,
          type: selectedTool
        };

        if (existingIndex >= 0) {
          nextTiles[existingIndex] = nextTile;
        } else {
          nextTiles.push(nextTile);
        }
      }

      return {
        ...current,
        tiles: nextTiles
      };
    });
  }

  function commitLayout(recipe: (current: OfficeLayout) => OfficeLayout) {
    setLayout((current) => {
      const nextLayout = sanitizeLayout(recipe(current));
      if (JSON.stringify(current) === JSON.stringify(nextLayout)) {
        return current;
      }

      setLayoutHistory((history) => [...history, current]);
      setFutureLayouts([]);
      return nextLayout;
    });
  }

  function handleUndo() {
    setLayoutHistory((history) => {
      const previous = history[history.length - 1];
      if (!previous) {
        return history;
      }

      setFutureLayouts((future) => [layout, ...future]);
      setLayout(previous);
      return history.slice(0, -1);
    });
  }

  function handleRedo() {
    setFutureLayouts((future) => {
      const [next, ...rest] = future;
      if (!next) {
        return future;
      }

      setLayoutHistory((history) => [...history, layout]);
      setLayout(next);
      return rest;
    });
  }

  function handleResetLayout() {
    commitLayout(() => defaultLayout);
  }

  function handleAssignSeat(agentId: string, value: string) {
    commitLayout((current) => {
      const nextAgents = current.agents.filter((seat) => seat.agentId !== agentId);
      if (!value) {
        return {
          ...current,
          agents: nextAgents
        };
      }

      const [deskXText, deskYText] = value.split(",");
      const deskX = Number(deskXText);
      const deskY = Number(deskYText);
      const deskExists = current.tiles.some((tile) => tile.type === "desk" && tile.x === deskX && tile.y === deskY);
      if (!deskExists) {
        return current;
      }

      return {
        ...current,
        agents: [
          ...nextAgents.filter((seat) => !(seat.deskX === deskX && seat.deskY === deskY)),
          { agentId, deskX, deskY }
        ]
      };
    });
  }

  function handleExportLayout() {
    const blob = new Blob([JSON.stringify(layout, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "pixel-office-layout.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div style={styles.copyBlock}>
          <p style={styles.kicker}>OpenClaw Live View</p>
          <h1 style={styles.title}>Pixel Office</h1>
          <p style={styles.copy}>
            The office now supports a first editor foundation, generated sprite-sheet rendering, and richer idle scene
            behavior like coffee breaks.
          </p>
        </div>
        <div style={styles.badgeRow}>
          <span style={styles.badge}>Socket: {connectionState}</span>
          <span style={styles.badge}>Agents: {agents.length}</span>
        </div>
      </section>
      <Toolbar
        editMode={editMode}
        canUndo={layoutHistory.length > 0}
        canRedo={futureLayouts.length > 0}
        onToggleEditMode={() => setEditMode((value) => !value)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onResetLayout={handleResetLayout}
        onExportLayout={handleExportLayout}
      />
      <section style={styles.stage}>
        <OfficeCanvas
          agents={agents}
          layout={layout}
          editMode={editMode}
          selectedTool={selectedTool}
          onPaintTile={handlePaintTile}
        />
      </section>
      {editMode ? (
        <LayoutEditor
          layout={layout}
          selectedTool={selectedTool}
          agentIds={knownAgentIds}
          onSelectTool={setSelectedTool}
          onAssignSeat={handleAssignSeat}
        />
      ) : null}
      <section style={styles.panel}>
        <h2 style={styles.sectionTitle}>Live Agent Feed</h2>
        <ul style={styles.list}>
          {agents.length === 0 ? <li style={styles.item}>No agents discovered yet.</li> : null}
          {agents.map((agent) => (
            <li key={agent.id} style={styles.item}>
              <div>
                <strong>{agent.id}</strong>
                <div style={styles.meta}>{agent.isDefault ? "Boss desk" : "Employee desk"}</div>
                {agent.taskHint ? <div style={styles.meta}>{agent.taskHint}</div> : null}
              </div>
              <span style={styles.status}>{agent.state}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    margin: 0,
    padding: "24px",
    background:
      "radial-gradient(circle at top, rgba(255, 214, 153, 0.22), transparent 45%), linear-gradient(180deg, #241f1a 0%, #12100f 100%)",
    color: "#f3e7d2",
    fontFamily: '"Segoe UI", sans-serif',
    display: "grid",
    gap: "18px"
  },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "end",
    gap: "16px",
    flexWrap: "wrap"
  },
  copyBlock: {
    maxWidth: "680px"
  },
  kicker: {
    margin: "0 0 6px",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontSize: "11px",
    color: "#d7b98d"
  },
  panel: {
    padding: "20px",
    border: "1px solid rgba(255, 231, 198, 0.15)",
    borderRadius: "16px",
    background: "rgba(30, 24, 19, 0.9)",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.35)"
  },
  stage: {
    overflowX: "auto"
  },
  title: {
    margin: "0 0 12px",
    fontSize: "36px"
  },
  sectionTitle: {
    margin: "0 0 14px",
    fontSize: "18px"
  },
  copy: {
    margin: "0 0 8px",
    lineHeight: 1.5
  },
  badgeRow: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap"
  },
  badge: {
    padding: "8px 12px",
    borderRadius: "999px",
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#e7d2ae",
    fontSize: "13px"
  },
  list: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "grid",
    gap: "10px"
  },
  item: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: "10px",
    background: "rgba(255, 255, 255, 0.05)"
  },
  status: {
    textTransform: "capitalize",
    color: "#f6b26b"
  },
  meta: {
    marginTop: "4px",
    fontSize: "12px",
    color: "#bda988"
  }
};

function sanitizeLayout(layout: OfficeLayout): OfficeLayout {
  const seenTiles = new Map<string, LayoutTile>();

  for (const tile of layout.tiles) {
    if (tile.x < 0 || tile.y < 0 || tile.x >= layout.cols || tile.y >= layout.rows) {
      continue;
    }

    seenTiles.set(`${tile.x},${tile.y}`, tile);
  }

  const tiles = Array.from(seenTiles.values());
  const deskKeys = new Set(tiles.filter((tile) => tile.type === "desk").map((tile) => `${tile.x},${tile.y}`));
  const seatByAgent = new Map<string, OfficeLayout["agents"][number]>();
  const claimedDeskKeys = new Set<string>();

  for (const seat of layout.agents) {
    const key = `${seat.deskX},${seat.deskY}`;
    if (!deskKeys.has(key) || claimedDeskKeys.has(key)) {
      continue;
    }

    claimedDeskKeys.add(key);
    seatByAgent.set(seat.agentId, seat);
  }

  return {
    ...layout,
    tiles: tiles.sort((left, right) => left.y - right.y || left.x - right.x),
    agents: Array.from(seatByAgent.values()).sort((left, right) => left.agentId.localeCompare(right.agentId))
  };
}
