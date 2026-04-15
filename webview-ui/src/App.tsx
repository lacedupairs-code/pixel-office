import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import defaultLayoutJson from "./assets/default-layout.json";
import { Toolbar } from "./components/Toolbar";
import { LayoutEditor } from "./editor/LayoutEditor";
import { useAgentSocket } from "./hooks/useAgentSocket";
import { OfficeCanvas } from "./office/OfficeCanvas";
import type { LayoutPaintMode, LayoutTile, LayoutTool, OfficeLayout, TileSelectionBounds } from "./office/types";
import { useOfficeStore } from "./store/officeStore";

const LOCAL_LAYOUT_KEY = "pixel-office.layout";
const LOCAL_LAYOUT_SLOTS_KEY = "pixel-office.layout-slots";
const PROJECT_SAVE_DEBOUNCE_MS = 500;
const PROJECT_SYNC_POLL_MS = 10000;

export interface LayoutSlotRecord {
  layout: OfficeLayout;
  savedAt: string;
  updatedAt: string;
  name?: string;
  description?: string;
  tags?: string[];
}

export interface LayoutSlotDetailsDraft {
  name?: string;
  description?: string;
  tags?: string[];
}

type ProjectSaveState = "loading" | "idle" | "saving" | "saved" | "error" | "conflict";

interface ProjectLayoutEnvelope {
  layout: OfficeLayout;
  updatedAt: string;
}

interface LayoutSlotMeta {
  activeSlotId?: string;
}

type LayoutSlotMap = Record<string, LayoutSlotRecord>;
interface SlotConflictError extends Error {
  code?: string;
  slotId?: string;
  slots?: LayoutSlotMap;
}

export default function App() {
  useAgentSocket();

  const agents = useOfficeStore((state) => state.agents);
  const connectionState = useOfficeStore((state) => state.connectionState);
  const defaultLayout = sanitizeLayout(defaultLayoutJson as OfficeLayout);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [layout, setLayout] = useState<OfficeLayout>(() => loadStoredLayout(defaultLayout));
  const [layoutHistory, setLayoutHistory] = useState<OfficeLayout[]>([]);
  const [futureLayouts, setFutureLayouts] = useState<OfficeLayout[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [selectedTool, setSelectedTool] = useState<LayoutTool>("floor");
  const [selectedPaintMode, setSelectedPaintMode] = useState<LayoutPaintMode>("brush");
  const [selectedSeatAgentId, setSelectedSeatAgentId] = useState<string | null>(null);
  const [selectionBounds, setSelectionBounds] = useState<TileSelectionBounds | null>(null);
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [slotRecords, setSlotRecords] = useState<LayoutSlotMap>(() => loadStoredSlots());
  const [conflictedSlotIds, setConflictedSlotIds] = useState<string[]>([]);
  const [projectActiveSlotId, setProjectActiveSlotId] = useState<string | null>(null);
  const [serverLayoutReady, setServerLayoutReady] = useState(false);
  const [projectSaveState, setProjectSaveState] = useState<ProjectSaveState>("loading");
  const [projectSavedAt, setProjectSavedAt] = useState<string | null>(null);
  const [projectRevision, setProjectRevision] = useState<string | null>(null);
  const skipNextProjectSyncRef = useRef(true);
  const layoutRef = useRef(layout);
  const projectRevisionRef = useRef<string | null>(null);
  const knownAgentIds = Array.from(new Set([...layout.agents.map((seat) => seat.agentId), ...agents.map((agent) => agent.id)])).sort();

  useEffect(() => {
    document.title = "Pixel Office";
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LOCAL_LAYOUT_KEY, JSON.stringify(layout));
  }, [layout]);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    projectRevisionRef.current = projectRevision;
  }, [projectRevision]);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([fetchProjectSlots(), fetchProjectSlotMeta()])
      .then(([projectSlots, activeSlotId]) => {
        if (cancelled) {
          return;
        }

        if (Object.keys(projectSlots).length > 0) {
          setSlotRecords(projectSlots);
          setConflictedSlotIds([]);
          window.localStorage.setItem(LOCAL_LAYOUT_SLOTS_KEY, JSON.stringify(projectSlots));
        }

        setProjectActiveSlotId(activeSlotId);
      })
      .catch((error) => {
        console.error("Failed to load project room state", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function replaceLayout(nextLayout: OfficeLayout, nextActiveSlot: string | null = null) {
    skipNextProjectSyncRef.current = true;
    setLayout(sanitizeLayout(nextLayout));
    setLayoutHistory([]);
    setFutureLayouts([]);
    setSelectedSeatAgentId(null);
    setSelectionBounds(null);
    setActiveSlot(nextActiveSlot);
  }

  async function fetchProjectLayout() {
    const response = await fetch("/api/layout");
    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch layout: ${response.status}`);
    }

    const payload = (await response.json()) as ProjectLayoutEnvelope;
    return {
      layout: sanitizeLayout(payload.layout),
      updatedAt: payload.updatedAt
    };
  }

  async function saveProjectLayout(nextLayout: OfficeLayout, options?: { force?: boolean }) {
    setProjectSaveState("saving");

    const response = await fetch("/api/layout", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        layout: nextLayout,
        expectedUpdatedAt: projectRevisionRef.current,
        force: options?.force ?? false
      })
    });

    if (response.status === 409) {
      const payload = (await response.json()) as ProjectLayoutEnvelope & { error: string };
      const error = new Error(payload.error || "Project layout conflict");
      (error as Error & { code?: string; remote?: ProjectLayoutEnvelope }).code = "PROJECT_CONFLICT";
      (error as Error & { code?: string; remote?: ProjectLayoutEnvelope }).remote = {
        layout: sanitizeLayout(payload.layout),
        updatedAt: payload.updatedAt
      };
      throw error;
    }

    if (!response.ok) {
      throw new Error(`Failed to save layout: ${response.status}`);
    }

    const saved = (await response.json()) as ProjectLayoutEnvelope;
    setProjectRevision(saved.updatedAt);
    setProjectSavedAt(saved.updatedAt);
    setProjectSaveState("saved");
    return saved.updatedAt;
  }

  async function fetchProjectSlots() {
    const response = await fetch("/api/layout-slots");
    if (!response.ok) {
      throw new Error(`Failed to fetch layout slots: ${response.status}`);
    }

    const payload = (await response.json()) as LayoutSlotMap;
    return sanitizeSlotRecords(payload);
  }

  async function fetchProjectSlotMeta() {
    const response = await fetch("/api/layout-slots/meta");
    if (!response.ok) {
      throw new Error(`Failed to fetch layout slot metadata: ${response.status}`);
    }

    const payload = (await response.json()) as LayoutSlotMeta;
    return payload.activeSlotId ?? null;
  }

  async function saveProjectSlotMeta(activeSlotId: string | null) {
    const response = await fetch("/api/layout-slots/meta", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        activeSlotId: activeSlotId ?? null
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to save layout slot metadata: ${response.status}`);
    }

    const payload = (await response.json()) as LayoutSlotMeta;
    return payload.activeSlotId ?? null;
  }

  async function saveProjectSlot(slotId: string, record: LayoutSlotRecord) {
    const response = await fetch(`/api/layout-slots/${slotId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        record,
        expectedUpdatedAt: slotRecords[slotId]?.updatedAt ?? null,
        force: conflictedSlotIds.includes(slotId)
      })
    });

    if (response.status === 409) {
      const payload = (await response.json()) as { error: string; slotId: string; slots: LayoutSlotMap };
      const error = new Error(payload.error) as SlotConflictError;
      error.code = "SLOT_CONFLICT";
      error.slotId = payload.slotId;
      error.slots = sanitizeSlotRecords(payload.slots);
      throw error;
    }

    if (!response.ok) {
      throw new Error(`Failed to save slot: ${response.status}`);
    }

    return sanitizeSlotRecords((await response.json()) as LayoutSlotMap);
  }

  async function deleteProjectSlot(slotId: string) {
    const response = await fetch(`/api/layout-slots/${slotId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        expectedUpdatedAt: slotRecords[slotId]?.updatedAt ?? null
      })
    });

    if (response.status === 409) {
      const payload = (await response.json()) as { error: string; slotId: string; slots: LayoutSlotMap };
      const error = new Error(payload.error) as SlotConflictError;
      error.code = "SLOT_CONFLICT";
      error.slotId = payload.slotId;
      error.slots = sanitizeSlotRecords(payload.slots);
      throw error;
    }

    if (!response.ok) {
      throw new Error(`Failed to delete slot: ${response.status}`);
    }

    return sanitizeSlotRecords((await response.json()) as LayoutSlotMap);
  }

  useEffect(() => {
    let cancelled = false;

    void fetchProjectLayout()
      .then((nextProjectLayout) => {
        if (cancelled) {
          return;
        }

        if (!nextProjectLayout) {
          setProjectRevision(null);
          setProjectSavedAt(null);
          setProjectSaveState("idle");
          return;
        }

        replaceLayout(nextProjectLayout.layout);
        setProjectRevision(nextProjectLayout.updatedAt);
        setProjectSavedAt(nextProjectLayout.updatedAt);
        setProjectSaveState("saved");
      })
      .catch((error) => {
        console.error("Failed to load server layout", error);
        setProjectSaveState("error");
      })
      .finally(() => {
        if (!cancelled) {
          setServerLayoutReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!serverLayoutReady) {
      return;
    }

    if (projectSaveState === "conflict") {
      return;
    }

    if (skipNextProjectSyncRef.current) {
      skipNextProjectSyncRef.current = false;
      return;
    }

    setProjectSaveState("saving");
    const timer = window.setTimeout(() => {
      void saveProjectLayout(layout)
        .catch((error) => {
          if ((error as Error).name !== "AbortError") {
            if ((error as Error & { code?: string }).code === "PROJECT_CONFLICT") {
              setProjectSaveState("conflict");
              const remote = (error as Error & { remote?: ProjectLayoutEnvelope }).remote;
              if (remote) {
                setProjectRevision(remote.updatedAt);
                setProjectSavedAt(remote.updatedAt);
              }
            } else {
              console.error("Failed to save server layout", error);
              setProjectSaveState("error");
            }
          }
        });
    }, PROJECT_SAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [layout, projectSaveState, serverLayoutReady]);

  useEffect(() => {
    if (!serverLayoutReady) {
      return;
    }

    const timer = window.setInterval(() => {
      void fetchProjectLayout()
        .then((nextProjectLayout) => {
          if (!nextProjectLayout || !projectRevisionRef.current) {
            return;
          }

          if (nextProjectLayout.updatedAt === projectRevisionRef.current) {
            return;
          }

          if (areLayoutsEqual(layoutRef.current, nextProjectLayout.layout)) {
            setProjectRevision(nextProjectLayout.updatedAt);
            setProjectSavedAt(nextProjectLayout.updatedAt);
            setProjectSaveState("saved");
            return;
          }

          setProjectRevision(nextProjectLayout.updatedAt);
          setProjectSavedAt(nextProjectLayout.updatedAt);
          setProjectSaveState("conflict");
        })
        .catch((error) => {
          console.error("Failed to poll project layout", error);
        });
    }, PROJECT_SYNC_POLL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [serverLayoutReady]);

  function handlePaintTile(tileX: number, tileY: number) {
    handlePaintTiles([{ x: tileX, y: tileY }]);
  }

  function handlePaintTiles(points: Array<{ x: number; y: number }>) {
    commitLayout((current) => {
      const nextTiles = [...current.tiles];
      const uniquePoints = new Map(points.map((point) => [`${point.x},${point.y}`, point]));

      for (const point of uniquePoints.values()) {
        const existingIndex = nextTiles.findIndex((tile) => tile.x === point.x && tile.y === point.y);

        if (selectedTool === "erase") {
          if (existingIndex >= 0) {
            nextTiles.splice(existingIndex, 1);
          }
        } else {
          const nextTile: LayoutTile = {
            x: point.x,
            y: point.y,
            type: selectedTool
          };

          if (existingIndex >= 0) {
            nextTiles[existingIndex] = nextTile;
          } else {
            nextTiles.push(nextTile);
          }
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
    setSelectedSeatAgentId(null);
    setSelectionBounds(null);
    setActiveSlot(null);
  }

  function handleImportLayout() {
    fileInputRef.current?.click();
  }

  async function handleSaveProjectLayout() {
    try {
      await saveProjectLayout(layout, { force: projectSaveState === "conflict" });
    } catch (error) {
      if ((error as Error & { code?: string }).code === "PROJECT_CONFLICT") {
        const remote = (error as Error & { remote?: ProjectLayoutEnvelope }).remote;
        if (remote) {
          setProjectRevision(remote.updatedAt);
          setProjectSavedAt(remote.updatedAt);
        }
        setProjectSaveState("conflict");
      } else {
        console.error("Failed to save project layout", error);
        setProjectSaveState("error");
      }
    }
  }

  async function handleRevertProjectLayout() {
    setProjectSaveState("loading");

    try {
      const nextProjectLayout = await fetchProjectLayout();
      if (!nextProjectLayout) {
        setProjectRevision(null);
        setProjectSavedAt(null);
        setProjectSaveState("idle");
        return;
      }

      replaceLayout(nextProjectLayout.layout);
      setProjectRevision(nextProjectLayout.updatedAt);
      setProjectSavedAt(nextProjectLayout.updatedAt);
      setProjectSaveState("saved");
    } catch (error) {
      console.error("Failed to reload project layout", error);
      setProjectSaveState("error");
    }
  }

  function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    void file.text().then((text) => {
      try {
        const parsed = JSON.parse(text) as OfficeLayout;
        replaceLayout(parsed);
      } catch (error) {
        console.error("Failed to import layout", error);
      } finally {
        event.target.value = "";
      }
    });
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

  function handleAssignSeatToTile(tileX: number, tileY: number) {
    if (!selectedSeatAgentId) {
      return;
    }

    const deskExists = layout.tiles.some((tile) => tile.type === "desk" && tile.x === tileX && tile.y === tileY);
    if (!deskExists) {
      return;
    }

    handleAssignSeat(selectedSeatAgentId, `${tileX},${tileY}`);
    setSelectedSeatAgentId(null);
  }

  function handleDeleteSelection() {
    if (!selectionBounds) {
      return;
    }

    commitLayout((current) => ({
      ...current,
      tiles: current.tiles.filter(
        (tile) =>
          tile.x < selectionBounds.minX ||
          tile.x > selectionBounds.maxX ||
          tile.y < selectionBounds.minY ||
          tile.y > selectionBounds.maxY
      ),
      agents: current.agents.filter(
        (seat) =>
          seat.deskX < selectionBounds.minX ||
          seat.deskX > selectionBounds.maxX ||
          seat.deskY < selectionBounds.minY ||
          seat.deskY > selectionBounds.maxY
      )
    }));
    setSelectionBounds(null);
  }

  function handleMoveSelection(deltaX: number, deltaY: number) {
    if (!selectionBounds || (deltaX === 0 && deltaY === 0)) {
      return;
    }

    const nextBounds = {
      minX: selectionBounds.minX + deltaX,
      minY: selectionBounds.minY + deltaY,
      maxX: selectionBounds.maxX + deltaX,
      maxY: selectionBounds.maxY + deltaY
    };

    if (nextBounds.minX < 0 || nextBounds.minY < 0 || nextBounds.maxX >= layout.cols || nextBounds.maxY >= layout.rows) {
      return;
    }

    commitLayout((current) => {
      const selectedTiles = current.tiles.filter(
        (tile) =>
          tile.x >= selectionBounds.minX &&
          tile.x <= selectionBounds.maxX &&
          tile.y >= selectionBounds.minY &&
          tile.y <= selectionBounds.maxY
      );
      const selectedSeats = current.agents.filter(
        (seat) =>
          seat.deskX >= selectionBounds.minX &&
          seat.deskX <= selectionBounds.maxX &&
          seat.deskY >= selectionBounds.minY &&
          seat.deskY <= selectionBounds.maxY
      );

      if (selectedTiles.length === 0 && selectedSeats.length === 0) {
        return current;
      }

      const movedTiles = selectedTiles.map((tile) => ({
        ...tile,
        x: tile.x + deltaX,
        y: tile.y + deltaY
      }));
      const movedSeats = selectedSeats.map((seat) => ({
        ...seat,
        deskX: seat.deskX + deltaX,
        deskY: seat.deskY + deltaY
      }));

      return {
        ...current,
        tiles: [
          ...current.tiles.filter(
            (tile) =>
              (tile.x < selectionBounds.minX ||
                tile.x > selectionBounds.maxX ||
                tile.y < selectionBounds.minY ||
                tile.y > selectionBounds.maxY) &&
              (tile.x < nextBounds.minX || tile.x > nextBounds.maxX || tile.y < nextBounds.minY || tile.y > nextBounds.maxY)
          ),
          ...movedTiles
        ],
        agents: [
          ...current.agents.filter(
            (seat) =>
              (seat.deskX < selectionBounds.minX ||
                seat.deskX > selectionBounds.maxX ||
                seat.deskY < selectionBounds.minY ||
                seat.deskY > selectionBounds.maxY) &&
              (seat.deskX < nextBounds.minX ||
                seat.deskX > nextBounds.maxX ||
                seat.deskY < nextBounds.minY ||
                seat.deskY > nextBounds.maxY)
          ),
          ...movedSeats
        ]
      };
    });

    setSelectionBounds(nextBounds);
  }

  function handleDuplicateSelection(deltaX: number, deltaY: number) {
    if (!selectionBounds || (deltaX === 0 && deltaY === 0)) {
      return;
    }

    const nextBounds = {
      minX: selectionBounds.minX + deltaX,
      minY: selectionBounds.minY + deltaY,
      maxX: selectionBounds.maxX + deltaX,
      maxY: selectionBounds.maxY + deltaY
    };

    if (nextBounds.minX < 0 || nextBounds.minY < 0 || nextBounds.maxX >= layout.cols || nextBounds.maxY >= layout.rows) {
      return;
    }

    commitLayout((current) => {
      const selectedTiles = current.tiles.filter(
        (tile) =>
          tile.x >= selectionBounds.minX &&
          tile.x <= selectionBounds.maxX &&
          tile.y >= selectionBounds.minY &&
          tile.y <= selectionBounds.maxY
      );
      const selectedSeats = current.agents.filter(
        (seat) =>
          seat.deskX >= selectionBounds.minX &&
          seat.deskX <= selectionBounds.maxX &&
          seat.deskY >= selectionBounds.minY &&
          seat.deskY <= selectionBounds.maxY
      );

      if (selectedTiles.length === 0 && selectedSeats.length === 0) {
        return current;
      }

      const duplicatedTiles = selectedTiles.map((tile) => ({
        ...tile,
        x: tile.x + deltaX,
        y: tile.y + deltaY
      }));
      const duplicatedSeatIds = new Set(selectedSeats.map((seat) => seat.agentId));
      const duplicatedSeats = selectedSeats.map((seat) => ({
        ...seat,
        deskX: seat.deskX + deltaX,
        deskY: seat.deskY + deltaY
      }));

      return {
        ...current,
        tiles: [
          ...current.tiles.filter(
            (tile) =>
              tile.x < nextBounds.minX || tile.x > nextBounds.maxX || tile.y < nextBounds.minY || tile.y > nextBounds.maxY
          ),
          ...duplicatedTiles
        ],
        agents: [
          ...current.agents.filter(
            (seat) =>
              !duplicatedSeatIds.has(seat.agentId) &&
              (seat.deskX < nextBounds.minX ||
                seat.deskX > nextBounds.maxX ||
                seat.deskY < nextBounds.minY ||
                seat.deskY > nextBounds.maxY)
          ),
          ...duplicatedSeats
        ]
      };
    });

    setSelectionBounds(nextBounds);
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

  function handleSaveSlot(slotId: string) {
    const now = new Date().toISOString();
    const nextRecord: LayoutSlotRecord = {
      layout,
      savedAt: now,
      updatedAt: slotRecords[slotId]?.updatedAt ?? now,
      name: slotRecords[slotId]?.name,
      description: slotRecords[slotId]?.description,
      tags: slotRecords[slotId]?.tags
    };

    void saveProjectSlot(slotId, nextRecord)
      .then((slots) => {
        window.localStorage.setItem(LOCAL_LAYOUT_SLOTS_KEY, JSON.stringify(slots));
        setSlotRecords(slots);
        setConflictedSlotIds((current) => current.filter((id) => id !== slotId));
        if (projectActiveSlotId && !slots[projectActiveSlotId]) {
          setProjectActiveSlotId(null);
        }
        setActiveSlot(slotId);
      })
      .catch((error) => {
        if ((error as SlotConflictError).code === "SLOT_CONFLICT") {
          const conflict = error as SlotConflictError;
          if (conflict.slots) {
            setSlotRecords(conflict.slots);
            window.localStorage.setItem(LOCAL_LAYOUT_SLOTS_KEY, JSON.stringify(conflict.slots));
          }
          if (conflict.slotId) {
            setConflictedSlotIds((current) => Array.from(new Set([...current, conflict.slotId!])));
          }
          return;
        }

        console.error("Failed to save project layout slot", error);

        try {
          const slots = loadStoredSlots();
          slots[slotId] = nextRecord;
          window.localStorage.setItem(LOCAL_LAYOUT_SLOTS_KEY, JSON.stringify(slots));
          setSlotRecords(slots);
          setActiveSlot(slotId);
        } catch (localError) {
          console.error("Failed to save local layout slot", localError);
        }
      });
  }

  function handleLoadSlot(slotId: string) {
    try {
      const slotRecord = slotRecords[slotId];
      if (!slotRecord) {
        return;
      }

      replaceLayout(slotRecord.layout, slotId);
    } catch (error) {
      console.error("Failed to load layout slot", error);
    }
  }

  function handleUpdateSlotDetails(slotId: string, updates: LayoutSlotDetailsDraft) {
    const current = slotRecords[slotId];
    if (!current) {
      return;
    }

    const nextRecord: LayoutSlotRecord = {
      ...current,
      name: updates.name?.trim() ? updates.name.trim() : undefined,
      description: updates.description?.trim() ? updates.description.trim() : undefined,
      tags: sanitizeSlotTags(updates.tags)
    };

    void saveProjectSlot(slotId, nextRecord)
      .then((slots) => {
        window.localStorage.setItem(LOCAL_LAYOUT_SLOTS_KEY, JSON.stringify(slots));
        setSlotRecords(slots);
        setConflictedSlotIds((currentIds) => currentIds.filter((id) => id !== slotId));
      })
      .catch((error) => {
        if ((error as SlotConflictError).code === "SLOT_CONFLICT") {
          const conflict = error as SlotConflictError;
          if (conflict.slots) {
            setSlotRecords(conflict.slots);
            window.localStorage.setItem(LOCAL_LAYOUT_SLOTS_KEY, JSON.stringify(conflict.slots));
          }
          if (conflict.slotId) {
            setConflictedSlotIds((currentIds) => Array.from(new Set([...currentIds, conflict.slotId!])));
          }
          return;
        }

        console.error("Failed to update project layout slot details", error);

        try {
          const slots = loadStoredSlots();
          slots[slotId] = nextRecord;
          window.localStorage.setItem(LOCAL_LAYOUT_SLOTS_KEY, JSON.stringify(slots));
          setSlotRecords(slots);
        } catch (localError) {
          console.error("Failed to update local layout slot details", localError);
        }
      });
  }

  function handleSetActiveSlot(slotId: string) {
    const slotRecord = slotRecords[slotId];
    if (!slotRecord) {
      return;
    }

    void saveProjectSlotMeta(slotId)
      .then((nextActiveSlotId) => {
        setProjectActiveSlotId(nextActiveSlotId);
        replaceLayout(slotRecord.layout, slotId);
        return saveProjectLayout(slotRecord.layout, { force: true });
      })
      .catch((error) => {
        console.error("Failed to set active project room", error);
      });
  }

  function handleDeleteSlot(slotId: string) {
    if (!slotRecords[slotId]) {
      return;
    }

    const confirmed = window.confirm("Delete this saved layout slot?");
    if (!confirmed) {
      return;
    }

    void deleteProjectSlot(slotId)
      .then((slots) => {
        window.localStorage.setItem(LOCAL_LAYOUT_SLOTS_KEY, JSON.stringify(slots));
        setSlotRecords(slots);
        setConflictedSlotIds((current) => current.filter((id) => id !== slotId));
        if (projectActiveSlotId === slotId) {
          setProjectActiveSlotId(null);
          void saveProjectSlotMeta(null).catch((error) => {
            console.error("Failed to clear active project room", error);
          });
        }
        if (activeSlot === slotId) {
          setActiveSlot(null);
        }
      })
      .catch((error) => {
        if ((error as SlotConflictError).code === "SLOT_CONFLICT") {
          const conflict = error as SlotConflictError;
          if (conflict.slots) {
            setSlotRecords(conflict.slots);
            window.localStorage.setItem(LOCAL_LAYOUT_SLOTS_KEY, JSON.stringify(conflict.slots));
          }
          if (conflict.slotId) {
            setConflictedSlotIds((current) => Array.from(new Set([...current, conflict.slotId!])));
          }
          return;
        }

        console.error("Failed to delete project layout slot", error);

        try {
          const slots = loadStoredSlots();
          delete slots[slotId];
          window.localStorage.setItem(LOCAL_LAYOUT_SLOTS_KEY, JSON.stringify(slots));
          setSlotRecords(slots);
          if (activeSlot === slotId) {
            setActiveSlot(null);
          }
        } catch (localError) {
          console.error("Failed to delete local layout slot", localError);
        }
      });
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
        activeSlot={activeSlot}
        slotRecords={slotRecords}
        conflictedSlotIds={conflictedSlotIds}
        projectActiveSlotId={projectActiveSlotId}
        projectSaveState={projectSaveState}
        projectSavedAt={projectSavedAt}
        onToggleEditMode={() => setEditMode((value) => !value)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onResetLayout={handleResetLayout}
        onImportLayout={handleImportLayout}
        onExportLayout={handleExportLayout}
        onSaveProject={handleSaveProjectLayout}
        onRevertProject={handleRevertProjectLayout}
        onSaveSlot={handleSaveSlot}
        onLoadSlot={handleLoadSlot}
        onSaveSlotDetails={handleUpdateSlotDetails}
        onSetActiveSlot={handleSetActiveSlot}
        onDeleteSlot={handleDeleteSlot}
      />
      <input ref={fileInputRef} type="file" accept="application/json" onChange={handleImportFile} style={styles.fileInput} />
      <section style={styles.stage}>
        <OfficeCanvas
          agents={agents}
          layout={layout}
          editMode={editMode}
          selectedTool={selectedTool}
          paintMode={selectedPaintMode}
          onPaintTile={handlePaintTile}
          onPaintTiles={handlePaintTiles}
          selectedSeatAgentId={selectedSeatAgentId}
          onAssignSeatToTile={handleAssignSeatToTile}
          selectionBounds={selectionBounds}
          onSelectionChange={setSelectionBounds}
          onMoveSelection={handleMoveSelection}
          onDuplicateSelection={handleDuplicateSelection}
        />
      </section>
      {editMode ? (
        <LayoutEditor
          layout={layout}
          selectedTool={selectedTool}
          selectedPaintMode={selectedPaintMode}
          agentIds={knownAgentIds}
          selectedSeatAgentId={selectedSeatAgentId}
          selectionBounds={selectionBounds}
          onSelectTool={setSelectedTool}
          onSelectPaintMode={setSelectedPaintMode}
          onAssignSeat={handleAssignSeat}
          onSelectSeatAgent={setSelectedSeatAgentId}
          onClearSelection={() => setSelectionBounds(null)}
          onDeleteSelection={handleDeleteSelection}
          onMoveSelection={handleMoveSelection}
          onDuplicateSelection={handleDuplicateSelection}
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
  fileInput: {
    display: "none"
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

function loadStoredLayout(fallback: OfficeLayout) {
  try {
    const raw = window.localStorage.getItem(LOCAL_LAYOUT_KEY);
    if (!raw) {
      return fallback;
    }

    return sanitizeLayout(JSON.parse(raw) as OfficeLayout);
  } catch (error) {
    console.error("Failed to load stored layout", error);
    return fallback;
  }
}

function loadStoredSlots(): LayoutSlotMap {
  try {
    const raw = window.localStorage.getItem(LOCAL_LAYOUT_SLOTS_KEY);
    if (!raw) {
      return {};
    }

    return sanitizeSlotRecords(JSON.parse(raw) as LayoutSlotMap);
  } catch (error) {
    console.error("Failed to load layout slots", error);
    return {};
  }
}

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

function areLayoutsEqual(left: OfficeLayout, right: OfficeLayout) {
  return JSON.stringify(sanitizeLayout(left)) === JSON.stringify(sanitizeLayout(right));
}

function sanitizeSlotRecords(records: LayoutSlotMap): LayoutSlotMap {
  return Object.fromEntries(
    Object.entries(records).map(([key, value]) => [
      key,
      {
        ...value,
        updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : value.savedAt,
        description: typeof value.description === "string" ? value.description : undefined,
        tags: Array.isArray(value.tags) ? value.tags.filter((tag) => typeof tag === "string") : undefined,
        layout: sanitizeLayout(value.layout)
      }
    ])
  );
}

function sanitizeSlotTags(tags: string[] | undefined) {
  if (!tags?.length) {
    return undefined;
  }

  const normalized = tags
    .map((tag) => tag.trim())
    .filter(Boolean);

  return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined;
}
