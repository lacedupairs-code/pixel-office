import { useState, type CSSProperties } from "react";
import type { LayoutSlotDetailsDraft, LayoutSlotRecord } from "../App";

type ProjectSaveState = "loading" | "idle" | "saving" | "saved" | "error" | "conflict";

interface ToolbarProps {
  editMode: boolean;
  canUndo: boolean;
  canRedo: boolean;
  activeSlot: string | null;
  slotRecords: Record<string, LayoutSlotRecord>;
  conflictedSlotIds: string[];
  projectActiveSlotId: string | null;
  projectSaveState: ProjectSaveState;
  projectSavedAt: string | null;
  onToggleEditMode: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onResetLayout: () => void;
  onLoadActiveRoom: () => void;
  onImportLayout: () => void;
  onExportLayout: () => void;
  onSaveProject: () => void;
  onRevertProject: () => void;
  onSaveSlot: (slotId: string) => void;
  onLoadSlot: (slotId: string) => void;
  onSaveSlotDetails: (slotId: string, draft: LayoutSlotDetailsDraft) => void;
  onSetActiveSlot: (slotId: string) => void;
  onDeleteSlot: (slotId: string) => void;
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
  conflictedSlotIds,
  projectActiveSlotId,
  projectSaveState,
  projectSavedAt,
  onToggleEditMode,
  onUndo,
  onRedo,
  onResetLayout,
  onLoadActiveRoom,
  onImportLayout,
  onExportLayout,
  onSaveProject,
  onRevertProject,
  onSaveSlot,
  onLoadSlot,
  onSaveSlotDetails,
  onSetActiveSlot,
  onDeleteSlot
}: ToolbarProps) {
  const [slotQuery, setSlotQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [sortMode, setSortMode] = useState<"recent" | "name">("recent");
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [editorDraft, setEditorDraft] = useState<LayoutSlotDetailsDraft>({});
  const availableTags = Array.from(
    new Set(
      Object.values(slotRecords)
        .flatMap((record) => record.tags ?? [])
        .sort((left, right) => left.localeCompare(right))
    )
  );
  const query = slotQuery.trim().toLowerCase();
  const visibleSlots = layoutSlots
    .filter((slot) => {
      const record = slotRecords[slot.id];
      const matchesQuery =
        query.length === 0 ||
        slot.label.toLowerCase().includes(query) ||
        (record?.name ?? "").toLowerCase().includes(query) ||
        (record?.description ?? "").toLowerCase().includes(query) ||
        (record?.tags ?? []).some((tag) => tag.toLowerCase().includes(query));
      const matchesTag = selectedTag === "all" || (record?.tags ?? []).includes(selectedTag);
      return matchesQuery && matchesTag;
    })
    .sort((left, right) => compareSlots(left.id, right.id, slotRecords, projectActiveSlotId, sortMode));
  const hasActiveFilters = slotQuery.trim().length > 0 || selectedTag !== "all";

  function openSlotEditor(slotId: string) {
    const record = slotRecords[slotId];
    if (!record) {
      return;
    }

    setEditingSlotId(slotId);
    setEditorDraft({
      name: record.name ?? "",
      description: record.description ?? "",
      tags: record.tags ?? []
    });
  }

  function closeSlotEditor() {
    setEditingSlotId(null);
    setEditorDraft({});
  }

  function saveSlotEditor(slotId: string) {
    onSaveSlotDetails(slotId, editorDraft);
    closeSlotEditor();
  }

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
        <button type="button" style={styles.button} onClick={onLoadActiveRoom} disabled={!projectActiveSlotId}>
          Load Active Room
        </button>
        <button type="button" style={styles.button} onClick={onImportLayout}>
          Import JSON
        </button>
        <button type="button" style={styles.button} onClick={onExportLayout}>
          Export JSON
        </button>
      </div>
      <div style={styles.projectRow}>
        <div style={styles.projectStatusCard}>
          <span style={styles.projectLabel}>Project Layout</span>
          <span style={{ ...styles.projectValue, ...projectStateStyle(projectSaveState) }}>
            {formatProjectSaveState(projectSaveState, projectSavedAt)}
          </span>
        </div>
        <button
          type="button"
          style={{ ...styles.button, ...((projectSaveState === "saving" || projectSaveState === "loading") ? styles.disabledButton : null) }}
          onClick={onSaveProject}
          disabled={projectSaveState === "saving" || projectSaveState === "loading"}
        >
          {projectSaveState === "conflict" ? "Keep Local Copy" : "Save To Project"}
        </button>
        <button
          type="button"
          style={{ ...styles.button, ...(projectSaveState === "loading" ? styles.disabledButton : null) }}
          onClick={onRevertProject}
          disabled={projectSaveState === "loading"}
        >
          Revert From Project
        </button>
      </div>
      <div style={styles.filterRow}>
        <input
          type="search"
          value={slotQuery}
          onChange={(event) => setSlotQuery(event.target.value)}
          placeholder="Search rooms, notes, or tags"
          style={styles.searchInput}
        />
        <select value={selectedTag} onChange={(event) => setSelectedTag(event.target.value)} style={styles.selectInput}>
          <option value="all">All Tags</option>
          {availableTags.map((tag) => (
            <option key={tag} value={tag}>
              #{tag}
            </option>
          ))}
        </select>
        <select value={sortMode} onChange={(event) => setSortMode(event.target.value as "recent" | "name")} style={styles.selectInput}>
          <option value="recent">Sort: Recent</option>
          <option value="name">Sort: Name</option>
        </select>
        <button
          type="button"
          style={{ ...styles.button, ...(hasActiveFilters ? null : styles.disabledButton) }}
          onClick={() => {
            setSlotQuery("");
            setSelectedTag("all");
          }}
          disabled={!hasActiveFilters}
        >
          Clear Filters
        </button>
      </div>
      {availableTags.length > 0 ? (
        <div style={styles.tagRow}>
          {availableTags.map((tag) => {
            const isSelected = selectedTag === tag;
            return (
              <button
                key={tag}
                type="button"
                style={{
                  ...styles.tagChip,
                  ...(isSelected ? styles.tagChipActive : null)
                }}
                onClick={() => setSelectedTag(isSelected ? "all" : tag)}
              >
                #{tag}
              </button>
            );
          })}
        </div>
      ) : null}
      <div style={styles.row}>
        {visibleSlots.map((slot) => (
          <div
            key={slot.id}
            style={{
              ...styles.slotGroup,
              ...(conflictedSlotIds.includes(slot.id) ? styles.slotGroupConflict : null)
            }}
          >
            <div style={styles.thumbFrame}>
              <img
                src={buildSlotThumbnail(slotRecords[slot.id])}
                alt={`${slot.label} preview`}
                style={styles.thumbImage}
              />
            </div>
            <div style={styles.slotMeta}>
              <span style={{ ...styles.slotLabel, ...(activeSlot === slot.id ? styles.slotLabelActive : null) }}>
                {slotRecords[slot.id]?.name || slot.label}
              </span>
              {projectActiveSlotId === slot.id ? <span style={styles.activeRoomTag}>Active Room</span> : null}
              <span style={{ ...styles.slotStamp, ...(conflictedSlotIds.includes(slot.id) ? styles.slotStampConflict : null) }}>
                {conflictedSlotIds.includes(slot.id) ? "Conflict" : formatSlotStamp(slotRecords[slot.id]?.savedAt)}
              </span>
              <span style={styles.slotSummary}>{formatSlotSummary(slotRecords[slot.id])}</span>
              {slotRecords[slot.id]?.description ? <span style={styles.slotDescription}>{slotRecords[slot.id]?.description}</span> : null}
              {slotRecords[slot.id]?.tags?.length ? (
                <span style={styles.slotTags}>{slotRecords[slot.id]?.tags?.map((tag) => `#${tag}`).join(" ")}</span>
              ) : null}
            </div>
            <button type="button" style={styles.button} onClick={() => onSaveSlot(slot.id)}>
              {conflictedSlotIds.includes(slot.id) ? "Keep" : "Save"}
            </button>
            <button type="button" style={styles.button} onClick={() => onLoadSlot(slot.id)}>
              Load
            </button>
            <button type="button" style={styles.button} onClick={() => onSetActiveSlot(slot.id)} disabled={!slotRecords[slot.id]}>
              {projectActiveSlotId === slot.id ? "Active" : "Make Active"}
            </button>
            <button type="button" style={styles.button} onClick={() => openSlotEditor(slot.id)} disabled={!slotRecords[slot.id]}>
              {editingSlotId === slot.id ? "Editing" : "Edit"}
            </button>
            <button type="button" style={styles.button} onClick={() => onDeleteSlot(slot.id)} disabled={!slotRecords[slot.id]}>
              Clear
            </button>
            {editingSlotId === slot.id ? (
              <div style={styles.slotEditor}>
                <label style={styles.editorField}>
                  <span style={styles.editorLabel}>Room Name</span>
                  <input
                    type="text"
                    value={editorDraft.name ?? ""}
                    onChange={(event) => setEditorDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder={slot.label}
                    style={styles.editorInput}
                  />
                </label>
                <label style={styles.editorField}>
                  <span style={styles.editorLabel}>Description</span>
                  <textarea
                    value={editorDraft.description ?? ""}
                    onChange={(event) => setEditorDraft((current) => ({ ...current, description: event.target.value }))}
                    placeholder="What kind of room is this?"
                    rows={3}
                    style={styles.editorTextarea}
                  />
                </label>
                <label style={styles.editorField}>
                  <span style={styles.editorLabel}>Tags</span>
                  <input
                    type="text"
                    value={(editorDraft.tags ?? []).join(", ")}
                    onChange={(event) =>
                      setEditorDraft((current) => ({
                        ...current,
                        tags: event.target.value
                          .split(",")
                          .map((tag) => tag.trim())
                          .filter(Boolean)
                      }))
                    }
                    placeholder="focus, sprint, demo"
                    style={styles.editorInput}
                  />
                </label>
                <div style={styles.editorActions}>
                  <button type="button" style={styles.button} onClick={() => saveSlotEditor(slot.id)}>
                    Save Details
                  </button>
                  <button type="button" style={styles.button} onClick={closeSlotEditor}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ))}
        {visibleSlots.length === 0 ? <div style={styles.emptyState}>No saved rooms match that filter yet.</div> : null}
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
  filterRow: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    alignItems: "center"
  },
  tagRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap"
  },
  projectRow: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    alignItems: "center"
  },
  projectStatusCard: {
    display: "grid",
    gap: "2px",
    minWidth: "220px",
    padding: "10px 14px",
    borderRadius: "16px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)"
  },
  projectLabel: {
    fontSize: "11px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#a79377"
  },
  projectValue: {
    fontSize: "13px",
    color: "#f0dfc4"
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
  slotGroupConflict: {
    border: "1px solid rgba(243, 211, 111, 0.45)",
    background: "rgba(243, 211, 111, 0.08)"
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
  slotEditor: {
    display: "grid",
    gap: "10px",
    minWidth: "260px",
    padding: "12px",
    borderRadius: "16px",
    background: "rgba(14, 12, 10, 0.72)",
    border: "1px solid rgba(255,255,255,0.08)"
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
  slotStampConflict: {
    color: "#f3d36f",
    fontWeight: 700
  },
  activeRoomTag: {
    fontSize: "10px",
    color: "#8fd0a7",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase"
  },
  slotSummary: {
    fontSize: "10px",
    color: "#b9a589",
    minWidth: "110px"
  },
  slotDescription: {
    fontSize: "10px",
    color: "#cfbea1",
    maxWidth: "180px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
  },
  slotTags: {
    fontSize: "10px",
    color: "#8fd0a7",
    maxWidth: "180px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
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
  tagChip: {
    ...baseButton,
    padding: "8px 12px",
    background: "rgba(255,255,255,0.04)",
    color: "#9fcbaf",
    border: "1px solid rgba(143,208,167,0.18)"
  },
  tagChipActive: {
    background: "rgba(143,208,167,0.18)",
    color: "#f0dfc4",
    border: "1px solid rgba(143,208,167,0.5)"
  },
  editorField: {
    display: "grid",
    gap: "6px"
  },
  editorLabel: {
    fontSize: "11px",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "#bba487"
  },
  editorInput: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    color: "#f0dfc4",
    fontSize: "13px",
    outline: "none"
  },
  editorTextarea: {
    width: "100%",
    resize: "vertical",
    minHeight: "72px",
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    color: "#f0dfc4",
    fontSize: "13px",
    outline: "none",
    fontFamily: "inherit"
  },
  editorActions: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap"
  },
  searchInput: {
    minWidth: "260px",
    padding: "10px 14px",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    color: "#f0dfc4",
    fontSize: "13px",
    outline: "none"
  },
  selectInput: {
    padding: "10px 14px",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#231c17",
    color: "#f0dfc4",
    fontSize: "13px",
    outline: "none"
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
  },
  emptyState: {
    padding: "14px 18px",
    borderRadius: "16px",
    border: "1px dashed rgba(255,255,255,0.14)",
    color: "#c9b79a",
    background: "rgba(255,255,255,0.03)"
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

function formatProjectSaveState(state: ProjectSaveState, savedAt: string | null) {
  switch (state) {
    case "loading":
      return "Loading project layout";
    case "saving":
      return "Saving to project";
    case "saved":
      return savedAt ? `Saved ${formatRelativeTime(savedAt)}` : "Saved to project";
    case "error":
      return "Project sync failed";
    case "conflict":
      return "Project changed elsewhere";
    case "idle":
    default:
      return "Local draft only";
  }
}

function projectStateStyle(state: ProjectSaveState): CSSProperties {
  switch (state) {
    case "saved":
      return { color: "#8fd0a7" };
    case "saving":
    case "loading":
      return { color: "#f0b56a" };
    case "error":
      return { color: "#f18b7d" };
    case "conflict":
      return { color: "#f3d36f" };
    case "idle":
    default:
      return { color: "#d8c3a3" };
  }
}

function formatRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "recently";
  }

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) {
    return "just now";
  }

  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric"
  });
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

function compareSlots(
  leftId: string,
  rightId: string,
  slotRecords: Record<string, LayoutSlotRecord>,
  projectActiveSlotId: string | null,
  sortMode: "recent" | "name"
) {
  if (projectActiveSlotId === leftId && projectActiveSlotId !== rightId) {
    return -1;
  }

  if (projectActiveSlotId === rightId && projectActiveSlotId !== leftId) {
    return 1;
  }

  const left = slotRecords[leftId];
  const right = slotRecords[rightId];

  if (sortMode === "name") {
    return (left?.name ?? leftId).localeCompare(right?.name ?? rightId);
  }

  return compareTimestamps(right?.savedAt, left?.savedAt) || leftId.localeCompare(rightId);
}

function compareTimestamps(left: string | undefined, right: string | undefined) {
  const leftTime = left ? new Date(left).getTime() : 0;
  const rightTime = right ? new Date(right).getTime() : 0;
  return leftTime - rightTime;
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
