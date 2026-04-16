import { Fragment, useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode } from "react";
import defaultLayoutJson from "./assets/default-layout.json";
import { Toolbar } from "./components/Toolbar";
import { LayoutEditor } from "./editor/LayoutEditor";
import { useAgentSocket } from "./hooks/useAgentSocket";
import { OfficeCanvas } from "./office/OfficeCanvas";
import type { LayoutPaintMode, LayoutTile, LayoutTool, OfficeLayout, TileSelectionBounds } from "./office/types";
import { useOfficeStore, type OfficeAgent } from "./store/officeStore";

const LOCAL_LAYOUT_KEY = "pixel-office.layout";
const LOCAL_LAYOUT_SLOTS_KEY = "pixel-office.layout-slots";
const LOCAL_FEED_PREFS_KEY = "pixel-office.feed-preferences";
const PROJECT_SAVE_DEBOUNCE_MS = 500;
const PROJECT_SYNC_POLL_MS = 10000;
const RUNTIME_STATUS_POLL_MS = 15000;

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

interface FeedPreferences {
  filter: OfficeAgent["state"] | "all";
  assignmentFilter: "all" | "seated" | "unassigned";
  taskFilter: "all" | "with-task" | "without-task";
  searchQuery: string;
  sortMode: "priority" | "name" | "boss-first";
}

const DEFAULT_FEED_PREFERENCES: FeedPreferences = {
  filter: "all",
  assignmentFilter: "all",
  taskFilter: "all",
  searchQuery: "",
  sortMode: "priority"
};

type ProjectSaveState = "loading" | "idle" | "saving" | "saved" | "error" | "conflict";

interface ProjectLayoutEnvelope {
  layout: OfficeLayout;
  updatedAt: string;
}

interface LayoutSlotMeta {
  activeSlotId?: string;
}

interface RuntimeStatusEnvelope {
  port: number;
  openClawDir: string;
  configPath: string;
  distReady: boolean;
  warnings: string[];
  agentCount: number;
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
  const [feedPreferences, setFeedPreferences] = useState<FeedPreferences>(() => loadFeedPreferences());
  const [slotRecords, setSlotRecords] = useState<LayoutSlotMap>(() => loadStoredSlots());
  const [conflictedSlotIds, setConflictedSlotIds] = useState<string[]>([]);
  const [projectActiveSlotId, setProjectActiveSlotId] = useState<string | null>(null);
  const [serverLayoutReady, setServerLayoutReady] = useState(false);
  const [projectSaveState, setProjectSaveState] = useState<ProjectSaveState>("loading");
  const [projectSavedAt, setProjectSavedAt] = useState<string | null>(null);
  const [projectRevision, setProjectRevision] = useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatusEnvelope | null>(null);
  const [runtimeStatusError, setRuntimeStatusError] = useState<string | null>(null);
  const skipNextProjectSyncRef = useRef(true);
  const activeRoomFallbackAppliedRef = useRef(false);
  const layoutRef = useRef(layout);
  const projectRevisionRef = useRef<string | null>(null);
  const knownAgentIds = Array.from(new Set([...layout.agents.map((seat) => seat.agentId), ...agents.map((agent) => agent.id)])).sort();
  const matchingSlotIds = Object.entries(slotRecords)
    .filter(([, record]) => areLayoutsEqual(layout, record.layout))
    .map(([slotId]) => slotId);
  const stateCounts = {
    working: agents.filter((agent) => agent.state === "working").length,
    reading: agents.filter((agent) => agent.state === "reading").length,
    idle: agents.filter((agent) => agent.state === "idle").length,
    waiting: agents.filter((agent) => agent.state === "waiting").length,
    sleeping: agents.filter((agent) => agent.state === "sleeping").length,
    offline: agents.filter((agent) => agent.state === "offline").length
  };
  const currentRoomLabel = activeSlot ? slotRecords[activeSlot]?.name ?? activeSlotLabel(activeSlot) : "Unsaved room";
  const activeRoomLabel = projectActiveSlotId
    ? slotRecords[projectActiveSlotId]?.name ?? activeSlotLabel(projectActiveSlotId)
    : "No active room";
  const runtimeWarnings = runtimeStatus?.warnings ?? [];
  const hotspotSummary = {
    desks: layout.tiles.filter((tile) => tile.type === "desk").length,
    coffee: layout.tiles.filter((tile) => tile.type === "coffee").length,
    lounge: layout.tiles.filter((tile) => tile.type === "couch").length
  };
  const seatAssignments = new Map(layout.agents.map((seat) => [seat.agentId, seat] as const));
  const totalSeats = layout.agents.length;
  const assignedSeatIds = new Set(layout.agents.map((seat) => seat.agentId));
  const unassignedAgents = knownAgentIds.filter((agentId) => !assignedSeatIds.has(agentId));
  const sortedAgents = [...agents].sort((left, right) => compareAgents(left, right, feedPreferences.sortMode));
  const focusAgents = sortedAgents.filter((agent) => agent.state === "working" || agent.state === "reading").slice(0, 3);
  const blockedAgents = sortedAgents.filter((agent) => agent.state === "waiting").slice(0, 3);
  const quietAgents = sortedAgents.filter((agent) => agent.state === "sleeping" || agent.state === "offline").slice(0, 3);
  const normalizedAgentSearch = feedPreferences.searchQuery.trim().toLowerCase();
  const visibleAgents = sortedAgents.filter((agent) => {
    const matchesState = feedPreferences.filter === "all" || agent.state === feedPreferences.filter;
    if (!matchesState) {
      return false;
    }

    const hasSeat = seatAssignments.has(agent.id);
    const matchesAssignment =
      feedPreferences.assignmentFilter === "all" ||
      (feedPreferences.assignmentFilter === "seated" && hasSeat) ||
      (feedPreferences.assignmentFilter === "unassigned" && !hasSeat);
    if (!matchesAssignment) {
      return false;
    }

    const hasTaskHint = Boolean(agent.taskHint?.trim());
    const matchesTaskFilter =
      feedPreferences.taskFilter === "all" ||
      (feedPreferences.taskFilter === "with-task" && hasTaskHint) ||
      (feedPreferences.taskFilter === "without-task" && !hasTaskHint);
    if (!matchesTaskFilter) {
      return false;
    }

    if (normalizedAgentSearch.length === 0) {
      return true;
    }

    return (
      agent.id.toLowerCase().includes(normalizedAgentSearch) ||
      (agent.taskHint ?? "").toLowerCase().includes(normalizedAgentSearch)
    );
  });
  const visibleFeedSummary = {
    total: visibleAgents.length,
    seated: visibleAgents.filter((agent) => seatAssignments.has(agent.id)).length,
    unassigned: visibleAgents.filter((agent) => !seatAssignments.has(agent.id)).length,
    focused: visibleAgents.filter((agent) => agent.state === "working" || agent.state === "reading").length,
    waiting: visibleAgents.filter((agent) => agent.state === "waiting").length
  };
  const feedPrefsChanged =
    feedPreferences.filter !== DEFAULT_FEED_PREFERENCES.filter ||
    feedPreferences.searchQuery !== DEFAULT_FEED_PREFERENCES.searchQuery ||
    feedPreferences.sortMode !== DEFAULT_FEED_PREFERENCES.sortMode;
  const feedFilters: Array<{ key: OfficeAgent["state"] | "all"; label: string; count: number }> = [
    { key: "all", label: "All", count: sortedAgents.length },
    { key: "working", label: "Working", count: stateCounts.working },
    { key: "reading", label: "Reading", count: stateCounts.reading },
    { key: "waiting", label: "Waiting", count: stateCounts.waiting },
    { key: "idle", label: "Idle", count: stateCounts.idle },
    { key: "sleeping", label: "Sleeping", count: stateCounts.sleeping },
    { key: "offline", label: "Offline", count: stateCounts.offline }
  ];
  const assignmentFilters: Array<{ key: FeedPreferences["assignmentFilter"]; label: string; count: number }> = [
    { key: "all", label: "All Seats", count: sortedAgents.length },
    { key: "seated", label: "Seated", count: sortedAgents.filter((agent) => seatAssignments.has(agent.id)).length },
    {
      key: "unassigned",
      label: "Unassigned",
      count: sortedAgents.filter((agent) => !seatAssignments.has(agent.id)).length
    }
  ];
  const taskFilters: Array<{ key: FeedPreferences["taskFilter"]; label: string; count: number }> = [
    { key: "all", label: "All Tasks", count: sortedAgents.length },
    { key: "with-task", label: "With Hint", count: sortedAgents.filter((agent) => Boolean(agent.taskHint?.trim())).length },
    {
      key: "without-task",
      label: "No Hint",
      count: sortedAgents.filter((agent) => !agent.taskHint?.trim()).length
    }
  ];
  const roomReadiness = buildRoomReadiness({
    layout,
    knownAgentIds,
    unassignedAgents,
    activeSlot,
    projectActiveSlotId
  });
  const recommendedActions = buildRecommendedActions({
    unassignedAgents,
    hotspotSummary,
    activeSlot,
    projectActiveSlotId,
    stateCounts,
    connectionState
  });
  const officeNarrative = buildOfficeNarrative({
    stateCounts,
    connectionState,
    focusAgents,
    blockedAgents,
    quietAgents,
    hotspotSummary,
    currentRoomLabel
  });
  const attentionItems = buildAttentionItems({
    blockedAgents,
    quietAgents,
    unassignedAgents,
    projectSaveState,
    connectionState,
    hotspotSummary
  });
  const roomStatusPills = [
    {
      label: "Connection",
      value: connectionState === "open" ? "Live" : connectionState === "connecting" ? "Connecting" : "Offline",
      tone: connectionState === "open" ? "good" : connectionState === "connecting" ? "warm" : "muted"
    },
    {
      label: "Project Sync",
      value:
        projectSaveState === "saved"
          ? "Saved"
          : projectSaveState === "saving"
            ? "Saving"
            : projectSaveState === "conflict"
              ? "Conflict"
              : projectSaveState === "error"
                ? "Attention"
                : "Local",
      tone:
        projectSaveState === "saved"
          ? "good"
          : projectSaveState === "saving" || projectSaveState === "loading"
            ? "warm"
            : projectSaveState === "conflict" || projectSaveState === "error"
              ? "alert"
              : "muted"
    },
    {
      label: "Seats",
      value: `${totalSeats}/${knownAgentIds.length || totalSeats} assigned`,
      tone: unassignedAgents.length === 0 ? "good" : "warm"
    },
    {
      label: "Activity",
      value:
        stateCounts.waiting > 0
          ? `${stateCounts.waiting} blocked`
          : stateCounts.working + stateCounts.reading > 0
            ? `${stateCounts.working + stateCounts.reading} focused`
            : "Calm",
      tone:
        stateCounts.waiting > 0
          ? "alert"
          : stateCounts.working + stateCounts.reading > 0
            ? "good"
            : "muted"
    }
  ] as const;

  useEffect(() => {
    document.title = "Pixel Office";
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LOCAL_LAYOUT_KEY, JSON.stringify(layout));
  }, [layout]);

  useEffect(() => {
    window.localStorage.setItem(LOCAL_FEED_PREFS_KEY, JSON.stringify(feedPreferences));
  }, [feedPreferences]);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    projectRevisionRef.current = projectRevision;
  }, [projectRevision]);

  useEffect(() => {
    if (projectRevision) {
      activeRoomFallbackAppliedRef.current = false;
    }
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

  async function fetchRuntimeStatus() {
    const response = await fetch("/api/runtime-status");
    if (!response.ok) {
      throw new Error(`Failed to fetch runtime status: ${response.status}`);
    }

    return (await response.json()) as RuntimeStatusEnvelope;
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
    let cancelled = false;

    const refreshRuntimeStatus = () => {
      void fetchRuntimeStatus()
        .then((status) => {
          if (cancelled) {
            return;
          }

          setRuntimeStatus(status);
          setRuntimeStatusError(null);
        })
        .catch((error) => {
          console.error("Failed to load runtime status", error);
          if (!cancelled) {
            setRuntimeStatusError("Runtime diagnostics unavailable");
          }
        });
    };

    refreshRuntimeStatus();
    const timer = window.setInterval(refreshRuntimeStatus, RUNTIME_STATUS_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
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

  useEffect(() => {
    if (!serverLayoutReady || projectSaveState !== "idle" || projectRevision || activeRoomFallbackAppliedRef.current) {
      return;
    }

    if (!projectActiveSlotId) {
      return;
    }

    const activeRoom = slotRecords[projectActiveSlotId];
    if (!activeRoom) {
      return;
    }

    activeRoomFallbackAppliedRef.current = true;
    replaceLayout(activeRoom.layout, projectActiveSlotId);
  }, [projectActiveSlotId, projectRevision, projectSaveState, serverLayoutReady, slotRecords]);

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
    const activeRoom = projectActiveSlotId ? slotRecords[projectActiveSlotId] : undefined;
    commitLayout(() => (activeRoom ? activeRoom.layout : defaultLayout));
    setSelectedSeatAgentId(null);
    setSelectionBounds(null);
    setActiveSlot(activeRoom ? projectActiveSlotId : null);
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
        const activeRoom = projectActiveSlotId ? slotRecords[projectActiveSlotId] : undefined;
        if (activeRoom) {
          replaceLayout(activeRoom.layout, projectActiveSlotId);
        }
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

  function handleLoadActiveRoom() {
    if (!projectActiveSlotId) {
      return;
    }

    const activeRoom = slotRecords[projectActiveSlotId];
    if (!activeRoom) {
      return;
    }

    replaceLayout(activeRoom.layout, projectActiveSlotId);
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
        <div style={styles.heroIntro}>
          <div style={styles.copyBlock}>
            <p style={styles.kicker}>OpenClaw Live View</p>
            <h1 style={styles.title}>Pixel Office</h1>
            <p style={styles.copy}>
              A living operations room for OpenClaw agents, with shared spaces, room editing, and a live office layer
              that makes work, blockers, and downtime visible at a glance.
            </p>
          </div>
          <div style={styles.badgeRow}>
            <span style={styles.badge}>Socket: {connectionState}</span>
            <span style={styles.badge}>Agents: {agents.length}</span>
            <span style={styles.badge}>Mood: {officeNarrative.mood}</span>
          </div>
        </div>
        <div style={styles.heroSignalCard}>
          <span style={styles.heroSignalLabel}>Current Room</span>
          <strong style={styles.heroSignalValue}>{currentRoomLabel}</strong>
          <div style={styles.heroSignalMeter}>
            <div style={{ ...styles.heroSignalFill, width: `${Math.max(18, Math.min(100, ((stateCounts.working + stateCounts.reading) / Math.max(1, agents.length)) * 100))}%` }} />
          </div>
          <div style={styles.heroSignalGrid}>
            <div style={styles.heroSignalStat}>
              <span style={styles.heroSignalStatLabel}>Focused</span>
              <strong style={styles.heroSignalStatValue}>{stateCounts.working + stateCounts.reading}</strong>
            </div>
            <div style={styles.heroSignalStat}>
              <span style={styles.heroSignalStatLabel}>Waiting</span>
              <strong style={styles.heroSignalStatValue}>{stateCounts.waiting}</strong>
            </div>
            <div style={styles.heroSignalStat}>
              <span style={styles.heroSignalStatLabel}>Seats</span>
              <strong style={styles.heroSignalStatValue}>{totalSeats}</strong>
            </div>
            <div style={styles.heroSignalStat}>
              <span style={styles.heroSignalStatLabel}>Landmarks</span>
              <strong style={styles.heroSignalStatValue}>{hotspotSummary.coffee + hotspotSummary.lounge}</strong>
            </div>
          </div>
        </div>
      </section>
      <section style={styles.statusStrip}>
        {roomStatusPills.map((pill) => (
          <div key={pill.label} style={{ ...styles.statusPill, ...statusToneStyle(pill.tone) }}>
            <span style={styles.statusPillLabel}>{pill.label}</span>
            <strong style={styles.statusPillValue}>{pill.value}</strong>
          </div>
        ))}
        {unassignedAgents.length > 0 ? (
          <div style={{ ...styles.statusPill, ...styles.statusPillWide, ...statusToneStyle("warm") }}>
            <span style={styles.statusPillLabel}>Unassigned Agents</span>
            <strong style={styles.statusPillValue}>{unassignedAgents.join(", ")}</strong>
          </div>
        ) : null}
      </section>
      <Toolbar
        editMode={editMode}
        canUndo={layoutHistory.length > 0}
        canRedo={futureLayouts.length > 0}
        activeSlot={activeSlot}
        slotRecords={slotRecords}
        matchingSlotIds={matchingSlotIds}
        conflictedSlotIds={conflictedSlotIds}
        projectActiveSlotId={projectActiveSlotId}
        projectSaveState={projectSaveState}
        projectSavedAt={projectSavedAt}
        onToggleEditMode={() => setEditMode((value) => !value)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onResetLayout={handleResetLayout}
        onLoadActiveRoom={handleLoadActiveRoom}
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
      <section style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>Current Room</span>
          <strong style={styles.summaryValue}>{currentRoomLabel}</strong>
          <span style={styles.summaryMeta}>
            {matchingSlotIds.length > 0 ? `Matches ${matchingSlotIds.length} saved room${matchingSlotIds.length === 1 ? "" : "s"}` : "Local edits in progress"}
          </span>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>Project Default</span>
          <strong style={styles.summaryValue}>{activeRoomLabel}</strong>
          <span style={styles.summaryMeta}>{projectSaveState === "saved" ? "Project sync healthy" : formatProjectSaveState(projectSaveState, projectSavedAt)}</span>
        </div>
        <div style={styles.summaryCardWide}>
          <span style={styles.summaryLabel}>Office Activity</span>
          <div style={styles.summaryStatRow}>
            <span style={styles.summaryPill}>Working {stateCounts.working}</span>
            <span style={styles.summaryPill}>Reading {stateCounts.reading}</span>
            <span style={styles.summaryPill}>Idle {stateCounts.idle}</span>
            <span style={styles.summaryPill}>Waiting {stateCounts.waiting}</span>
            <span style={styles.summaryPill}>Sleeping {stateCounts.sleeping}</span>
            <span style={styles.summaryPill}>Offline {stateCounts.offline}</span>
          </div>
          <span style={styles.summaryMeta}>
            {hotspotSummary.desks} desks, {hotspotSummary.coffee} coffee spot{hotspotSummary.coffee === 1 ? "" : "s"}, {hotspotSummary.lounge} lounge zone{hotspotSummary.lounge === 1 ? "" : "s"}
          </span>
        </div>
      </section>
      <section style={styles.panel}>
        <h2 style={styles.sectionTitle}>Runtime Diagnostics</h2>
        <div style={styles.diagnosticsGrid}>
          <div style={styles.diagnosticsCard}>
            <span style={styles.diagnosticsLabel}>OpenClaw Discovery</span>
            <strong style={styles.diagnosticsValue}>
              {runtimeStatus ? `${runtimeStatus.agentCount} agent${runtimeStatus.agentCount === 1 ? "" : "s"} found` : "Checking..."}
            </strong>
            <span style={styles.diagnosticsMeta}>
              {runtimeStatus ? `Watching ${runtimeStatus.openClawDir}` : runtimeStatusError ?? "Waiting for server diagnostics"}
            </span>
          </div>
          <div style={styles.diagnosticsCard}>
            <span style={styles.diagnosticsLabel}>Frontend Bundle</span>
            <strong style={styles.diagnosticsValue}>
              {runtimeStatus ? (runtimeStatus.distReady ? "Ready" : "Missing build") : "Checking..."}
            </strong>
            <span style={styles.diagnosticsMeta}>
              {runtimeStatus ? `Config: ${runtimeStatus.configPath}` : "The app will report config and build readiness here."}
            </span>
          </div>
          <div style={styles.diagnosticsCard}>
            <span style={styles.diagnosticsLabel}>Server Runtime</span>
            <strong style={styles.diagnosticsValue}>{runtimeStatus ? `Port ${runtimeStatus.port}` : "Waiting..."}</strong>
            <span style={styles.diagnosticsMeta}>
              {runtimeWarnings.length > 0
                ? `${runtimeWarnings.length} warning${runtimeWarnings.length === 1 ? "" : "s"} need attention`
                : runtimeStatus
                  ? "No startup warnings reported"
                  : runtimeStatusError ?? "Runtime checks will update automatically"}
            </span>
          </div>
        </div>
        {runtimeWarnings.length > 0 ? (
          <div style={styles.diagnosticsWarningList}>
            {runtimeWarnings.map((warning) => (
              <div key={warning} style={styles.diagnosticsWarningItem}>
                {warning}
              </div>
            ))}
          </div>
        ) : null}
      </section>
      <section style={styles.panel}>
        <h2 style={styles.sectionTitle}>Room Readiness</h2>
        <div style={styles.readinessGrid}>
          {roomReadiness.map((item) => (
            <div key={item.label} style={{ ...styles.readinessCard, ...readinessToneStyle(item.tone) }}>
              <span style={styles.readinessLabel}>{item.label}</span>
              <strong style={styles.readinessValue}>{item.value}</strong>
              <span style={styles.readinessMeta}>{item.detail}</span>
            </div>
          ))}
        </div>
      </section>
      <section style={styles.panel}>
        <h2 style={styles.sectionTitle}>Recommended Next Steps</h2>
        <div style={styles.actionsList}>
          {recommendedActions.map((action, index) => (
            <div key={action.title} style={{ ...styles.actionCard, ...actionToneStyle(action.tone) }}>
              <span style={styles.actionStep}>{index + 1}</span>
              <div style={styles.actionBody}>
                <strong style={styles.actionTitle}>{action.title}</strong>
                <span style={styles.actionMeta}>{action.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section style={styles.panel}>
        <h2 style={styles.sectionTitle}>Office Narrative</h2>
        <div style={styles.narrativeCard}>
          <div style={styles.narrativeHeader}>
            <span style={styles.narrativeLabel}>Current Mood</span>
            <span style={{ ...styles.narrativeBadge, ...narrativeToneStyle(officeNarrative.tone) }}>{officeNarrative.mood}</span>
          </div>
          <p style={styles.narrativeText}>{officeNarrative.summary}</p>
          <div style={styles.narrativeBullets}>
            {officeNarrative.bullets.map((bullet) => (
              <span key={bullet} style={styles.narrativeBullet}>
                {bullet}
              </span>
            ))}
          </div>
        </div>
      </section>
      <section style={styles.panel}>
        <h2 style={styles.sectionTitle}>Attention Board</h2>
        <div style={styles.attentionList}>
          {attentionItems.map((item) => (
            <div key={item.title} style={{ ...styles.attentionCard, ...attentionToneStyle(item.tone) }}>
              <div style={styles.attentionHeader}>
                <strong style={styles.attentionTitle}>{item.title}</strong>
                <span style={styles.attentionTag}>{item.tag}</span>
              </div>
              <span style={styles.attentionMeta}>{item.detail}</span>
            </div>
          ))}
        </div>
      </section>
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
        <h2 style={styles.sectionTitle}>Office Highlights</h2>
        <div style={styles.highlightGrid}>
          <div style={styles.highlightCard}>
            <span style={styles.highlightLabel}>Focus Work</span>
            {focusAgents.length === 0 ? <span style={styles.highlightEmpty}>No focused agents yet.</span> : null}
            {focusAgents.map((agent) => (
              <div key={agent.id} style={styles.highlightRow}>
                <strong>{agent.id}</strong>
                <span style={styles.highlightMeta}>{agent.taskHint ?? humanizeAgentState(agent.state)}</span>
              </div>
            ))}
          </div>
          <div style={styles.highlightCard}>
            <span style={styles.highlightLabel}>Waiting On</span>
            {blockedAgents.length === 0 ? <span style={styles.highlightEmpty}>No blockers right now.</span> : null}
            {blockedAgents.map((agent) => (
              <div key={agent.id} style={styles.highlightRow}>
                <strong>{agent.id}</strong>
                <span style={styles.highlightMeta}>{agent.taskHint ?? "Standing by"}</span>
              </div>
            ))}
          </div>
          <div style={styles.highlightCard}>
            <span style={styles.highlightLabel}>Quiet Corners</span>
            {quietAgents.length === 0 ? <span style={styles.highlightEmpty}>Everyone is active.</span> : null}
            {quietAgents.map((agent) => (
              <div key={agent.id} style={styles.highlightRow}>
                <strong>{agent.id}</strong>
                <span style={styles.highlightMeta}>{humanizeAgentState(agent.state)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section style={styles.panel}>
        <h2 style={styles.sectionTitle}>Live Agent Feed</h2>
        <div style={styles.feedSearchRow}>
          <input
            type="search"
            value={feedPreferences.searchQuery}
            onChange={(event) =>
              setFeedPreferences((current) => ({
                ...current,
                searchQuery: event.target.value
              }))
            }
            placeholder="Search agents or task hints"
            style={styles.feedSearchInput}
          />
          <span style={styles.feedSearchMeta}>
            {visibleAgents.length} result{visibleAgents.length === 1 ? "" : "s"}
          </span>
          <select
            value={feedPreferences.sortMode}
            onChange={(event) =>
              setFeedPreferences((current) => ({
                ...current,
                sortMode: event.target.value as "priority" | "name" | "boss-first"
              }))
            }
            style={styles.feedSortSelect}
          >
            <option value="priority">Sort: Priority</option>
            <option value="name">Sort: Name</option>
            <option value="boss-first">Sort: Boss First</option>
          </select>
          <button
            type="button"
            style={{ ...styles.feedResetButton, ...(feedPrefsChanged ? null : styles.disabledButton) }}
            onClick={() => setFeedPreferences(DEFAULT_FEED_PREFERENCES)}
            disabled={!feedPrefsChanged}
          >
            Reset Feed
          </button>
        </div>
        <div style={styles.feedFilterRow}>
          {feedFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              style={{
                ...styles.feedFilterChip,
                ...(feedPreferences.filter === filter.key ? styles.feedFilterChipActive : null)
              }}
              onClick={() =>
                setFeedPreferences((current) => ({
                  ...current,
                  filter: filter.key
                }))
              }
            >
              {filter.label} {filter.count}
            </button>
          ))}
        </div>
        <div style={styles.feedAssignmentRow}>
          {assignmentFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              style={{
                ...styles.feedAssignmentChip,
                ...(feedPreferences.assignmentFilter === filter.key ? styles.feedAssignmentChipActive : null)
              }}
              onClick={() =>
                setFeedPreferences((current) => ({
                  ...current,
                  assignmentFilter: filter.key
                }))
              }
            >
              {filter.label} {filter.count}
            </button>
          ))}
        </div>
        <div style={styles.feedTaskRow}>
          {taskFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              style={{
                ...styles.feedTaskChip,
                ...(feedPreferences.taskFilter === filter.key ? styles.feedTaskChipActive : null)
              }}
              onClick={() =>
                setFeedPreferences((current) => ({
                  ...current,
                  taskFilter: filter.key
                }))
              }
            >
              {filter.label} {filter.count}
            </button>
          ))}
        </div>
        <div style={styles.feedSummaryRow}>
          <span style={styles.feedSummaryPill}>Visible {visibleFeedSummary.total}</span>
          <span style={styles.feedSummaryPill}>Seated {visibleFeedSummary.seated}</span>
          <span style={styles.feedSummaryPill}>Unassigned {visibleFeedSummary.unassigned}</span>
          <span style={styles.feedSummaryPill}>Focused {visibleFeedSummary.focused}</span>
          <span style={styles.feedSummaryPill}>Waiting {visibleFeedSummary.waiting}</span>
        </div>
        <ul style={styles.list}>
          {visibleAgents.length === 0 ? <li style={styles.item}>No agents match this filter yet.</li> : null}
          {visibleAgents.map((agent) => (
            <li key={agent.id} style={styles.item}>
              <div>
                <strong>{highlightFeedText(agent.id, normalizedAgentSearch)}</strong>
                <div style={styles.meta}>{agent.isDefault ? "Boss desk" : "Employee desk"}</div>
                <div style={styles.meta}>
                  {seatAssignments.has(agent.id)
                    ? `Seat ${formatSeatLabel(seatAssignments.get(agent.id)!.deskX, seatAssignments.get(agent.id)!.deskY)}`
                    : "No desk assigned"}
                </div>
                {agent.taskHint ? <div style={styles.meta}>{highlightFeedText(agent.taskHint, normalizedAgentSearch)}</div> : null}
              </div>
              <div style={styles.feedStatusStack}>
                <span style={styles.status}>{agent.state}</span>
                <span style={{ ...styles.assignmentBadge, ...(seatAssignments.has(agent.id) ? styles.assignmentBadgeReady : styles.assignmentBadgeMissing) }}>
                  {seatAssignments.has(agent.id) ? "Seated" : "Unassigned"}
                </span>
              </div>
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
    padding: "28px",
    background:
      "radial-gradient(circle at top left, rgba(255, 207, 136, 0.2), transparent 32%), radial-gradient(circle at top right, rgba(132, 181, 164, 0.14), transparent 28%), linear-gradient(180deg, #241d17 0%, #14110f 52%, #0d0b0a 100%)",
    color: "#f3e7d2",
    fontFamily: '"Aptos", "Trebuchet MS", "Segoe UI", sans-serif',
    display: "grid",
    gap: "18px"
  },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "stretch",
    gap: "20px",
    flexWrap: "wrap",
    padding: "24px",
    borderRadius: "28px",
    border: "1px solid rgba(255, 236, 206, 0.14)",
    background:
      "linear-gradient(135deg, rgba(54, 41, 31, 0.94) 0%, rgba(34, 27, 22, 0.9) 54%, rgba(22, 18, 15, 0.9) 100%)",
    boxShadow: "0 28px 90px rgba(0, 0, 0, 0.36), inset 0 1px 0 rgba(255,255,255,0.04)",
    position: "relative",
    overflow: "hidden"
  },
  heroIntro: {
    flex: "1 1 520px",
    display: "grid",
    gap: "18px",
    alignContent: "space-between",
    minWidth: "280px"
  },
  copyBlock: {
    maxWidth: "700px",
    display: "grid",
    gap: "10px"
  },
  kicker: {
    margin: 0,
    textTransform: "uppercase",
    letterSpacing: "0.16em",
    fontSize: "11px",
    color: "#d9bd95"
  },
  panel: {
    padding: "20px",
    border: "1px solid rgba(255, 231, 198, 0.15)",
    borderRadius: "18px",
    background: "linear-gradient(180deg, rgba(33, 26, 21, 0.94) 0%, rgba(24, 19, 16, 0.92) 100%)",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255,255,255,0.03)",
    backdropFilter: "blur(10px)"
  },
  title: {
    margin: 0,
    fontSize: "clamp(38px, 7vw, 64px)",
    lineHeight: 0.94,
    letterSpacing: "-0.04em",
    color: "#fff2df",
    fontFamily: '"Georgia", "Times New Roman", serif',
    textShadow: "0 12px 30px rgba(0, 0, 0, 0.32)"
  },
  copy: {
    margin: 0,
    maxWidth: "680px",
    lineHeight: 1.65,
    fontSize: "15px",
    color: "#dbc8ab"
  },
  badgeRow: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap"
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: "34px",
    padding: "8px 12px",
    borderRadius: "999px",
    border: "1px solid rgba(255, 240, 220, 0.14)",
    background: "rgba(255, 248, 240, 0.06)",
    color: "#f5e2c3",
    fontSize: "12px",
    letterSpacing: "0.02em",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)"
  },
  heroSignalCard: {
    flex: "0 1 320px",
    minWidth: "260px",
    display: "grid",
    gap: "14px",
    alignContent: "start",
    padding: "18px 18px 16px",
    borderRadius: "22px",
    border: "1px solid rgba(255, 232, 204, 0.14)",
    background:
      "linear-gradient(180deg, rgba(255, 246, 230, 0.08) 0%, rgba(122, 164, 147, 0.08) 100%), rgba(19, 16, 14, 0.58)",
    boxShadow: "0 20px 50px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.05)",
    backdropFilter: "blur(12px)"
  },
  heroSignalLabel: {
    fontSize: "11px",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#bfa280"
  },
  heroSignalValue: {
    fontSize: "24px",
    lineHeight: 1.1,
    color: "#fff2df",
    letterSpacing: "-0.03em"
  },
  heroSignalMeter: {
    height: "12px",
    borderRadius: "999px",
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.06)",
    boxShadow: "inset 0 1px 6px rgba(0,0,0,0.28)"
  },
  heroSignalFill: {
    height: "100%",
    borderRadius: "999px",
    background: "linear-gradient(90deg, #e2b16c 0%, #8fc8a6 100%)",
    boxShadow: "0 0 18px rgba(143, 200, 166, 0.35)"
  },
  heroSignalGrid: {
    display: "grid",
    gap: "10px",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))"
  },
  heroSignalStat: {
    display: "grid",
    gap: "4px",
    padding: "12px 12px 10px",
    borderRadius: "14px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)"
  },
  heroSignalStatLabel: {
    fontSize: "11px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#bda27e"
  },
  heroSignalStatValue: {
    fontSize: "18px",
    color: "#f5ead8"
  },
  statusStrip: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap"
  },
  statusPill: {
    minWidth: "150px",
    display: "grid",
    gap: "4px",
    padding: "12px 14px",
    borderRadius: "14px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)"
  },
  statusPillWide: {
    minWidth: "280px",
    flex: "1 1 280px"
  },
  statusPillLabel: {
    fontSize: "11px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#b89f83"
  },
  statusPillValue: {
    fontSize: "14px",
    color: "#f3e7d2"
  },
  summaryGrid: {
    display: "grid",
    gap: "14px",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
  },
  summaryCard: {
    display: "grid",
    gap: "6px",
    padding: "16px 18px",
    borderRadius: "16px",
    border: "1px solid rgba(255, 231, 198, 0.12)",
    background: "rgba(32, 25, 20, 0.82)",
    boxShadow: "0 14px 36px rgba(0, 0, 0, 0.22)"
  },
  summaryCardWide: {
    display: "grid",
    gap: "10px",
    padding: "16px 18px",
    borderRadius: "16px",
    border: "1px solid rgba(255, 231, 198, 0.12)",
    background: "rgba(32, 25, 20, 0.82)",
    boxShadow: "0 14px 36px rgba(0, 0, 0, 0.22)",
    gridColumn: "span 2"
  },
  summaryLabel: {
    fontSize: "11px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#c7a97d"
  },
  summaryValue: {
    fontSize: "20px",
    color: "#f3e7d2"
  },
  summaryMeta: {
    fontSize: "12px",
    color: "#bda988"
  },
  summaryStatRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap"
  },
  summaryPill: {
    padding: "6px 10px",
    borderRadius: "999px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#f0dfc4",
    fontSize: "12px"
  },
  diagnosticsGrid: {
    display: "grid",
    gap: "14px",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
  },
  diagnosticsCard: {
    display: "grid",
    gap: "8px",
    padding: "16px 18px",
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)"
  },
  diagnosticsLabel: {
    fontSize: "11px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#c7a97d"
  },
  diagnosticsValue: {
    fontSize: "20px",
    color: "#f3e7d2"
  },
  diagnosticsMeta: {
    fontSize: "12px",
    color: "#cdb89b",
    lineHeight: 1.5
  },
  diagnosticsWarningList: {
    display: "grid",
    gap: "10px",
    marginTop: "14px"
  },
  diagnosticsWarningItem: {
    padding: "12px 14px",
    borderRadius: "14px",
    border: "1px solid rgba(240, 181, 106, 0.2)",
    background: "rgba(181, 136, 82, 0.12)",
    color: "#f0dfc4",
    lineHeight: 1.5,
    fontSize: "13px"
  },
  highlightGrid: {
    display: "grid",
    gap: "12px",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
  },
  highlightCard: {
    display: "grid",
    gap: "8px",
    padding: "14px 16px",
    borderRadius: "14px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)"
  },
  highlightLabel: {
    fontSize: "11px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#c7a97d"
  },
  highlightRow: {
    display: "grid",
    gap: "2px"
  },
  highlightMeta: {
    fontSize: "12px",
    color: "#cdb89b"
  },
  highlightEmpty: {
    fontSize: "12px",
    color: "#9f8d77"
  },
  readinessGrid: {
    display: "grid",
    gap: "12px",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
  },
  readinessCard: {
    display: "grid",
    gap: "6px",
    padding: "14px 16px",
    borderRadius: "14px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)"
  },
  readinessLabel: {
    fontSize: "11px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#c7a97d"
  },
  readinessValue: {
    fontSize: "18px",
    color: "#f3e7d2"
  },
  readinessMeta: {
    fontSize: "12px",
    color: "#cdb89b"
  },
  actionsList: {
    display: "grid",
    gap: "10px"
  },
  actionCard: {
    display: "flex",
    gap: "12px",
    alignItems: "start",
    padding: "14px 16px",
    borderRadius: "14px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)"
  },
  actionStep: {
    width: "24px",
    height: "24px",
    borderRadius: "999px",
    background: "rgba(0,0,0,0.22)",
    color: "#f3e7d2",
    fontSize: "12px",
    fontWeight: 700,
    display: "grid",
    placeItems: "center",
    flex: "0 0 auto"
  },
  actionBody: {
    display: "grid",
    gap: "4px"
  },
  actionTitle: {
    color: "#f3e7d2",
    fontSize: "14px"
  },
  actionMeta: {
    fontSize: "12px",
    color: "#cdb89b"
  },
  narrativeCard: {
    display: "grid",
    gap: "12px",
    padding: "16px 18px",
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)"
  },
  narrativeHeader: {
    display: "flex",
    gap: "10px",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap"
  },
  narrativeLabel: {
    fontSize: "11px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#c7a97d"
  },
  narrativeBadge: {
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 700,
    border: "1px solid rgba(255,255,255,0.08)"
  },
  narrativeText: {
    margin: 0,
    lineHeight: 1.6,
    color: "#f0dfc4",
    fontSize: "14px"
  },
  narrativeBullets: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap"
  },
  narrativeBullet: {
    padding: "6px 10px",
    borderRadius: "999px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#d8c3a3",
    fontSize: "12px"
  },
  attentionList: {
    display: "grid",
    gap: "10px"
  },
  attentionCard: {
    display: "grid",
    gap: "6px",
    padding: "14px 16px",
    borderRadius: "14px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)"
  },
  attentionHeader: {
    display: "flex",
    gap: "8px",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap"
  },
  attentionTitle: {
    color: "#f3e7d2",
    fontSize: "14px"
  },
  attentionTag: {
    padding: "4px 8px",
    borderRadius: "999px",
    background: "rgba(0,0,0,0.18)",
    color: "#f3e7d2",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase"
  },
  attentionMeta: {
    fontSize: "12px",
    color: "#cdb89b",
    lineHeight: 1.5
  },
  stage: {
    overflowX: "auto",
    padding: "18px",
    borderRadius: "28px",
    border: "1px solid rgba(255, 225, 179, 0.1)",
    background:
      "radial-gradient(circle at top left, rgba(255, 195, 120, 0.12), transparent 30%), linear-gradient(180deg, rgba(33, 25, 22, 0.96), rgba(24, 19, 18, 0.94))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 24px 60px rgba(0, 0, 0, 0.28)",
    display: "flex",
    justifyContent: "center"
  },
  fileInput: {
    display: "none"
  },
  sectionTitle: {
    margin: "0 0 14px",
    fontSize: "18px"
  },
  feedSearchRow: {
    display: "flex",
    gap: "10px",
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: "12px"
  },
  feedSearchInput: {
    minWidth: "260px",
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.05)",
    color: "#f3e7d2",
    fontSize: "13px",
    outline: "none"
  },
  feedSearchMeta: {
    fontSize: "12px",
    color: "#bca78b"
  },
  feedSortSelect: {
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "#2a221c",
    color: "#f3e7d2",
    fontSize: "13px",
    outline: "none"
  },
  feedResetButton: {
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.05)",
    color: "#f3e7d2",
    fontSize: "13px",
    cursor: "pointer"
  },
  feedFilterRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    marginBottom: "14px"
  },
  feedAssignmentRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    marginBottom: "14px"
  },
  feedTaskRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    marginBottom: "14px"
  },
  feedSummaryRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    marginBottom: "14px"
  },
  feedFilterChip: {
    padding: "7px 10px",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.05)",
    color: "#d9c5a6",
    fontSize: "12px",
    cursor: "pointer"
  },
  feedFilterChipActive: {
    background: "rgba(240, 181, 106, 0.18)",
    color: "#f7ead3",
    border: "1px solid rgba(240, 181, 106, 0.28)"
  },
  feedAssignmentChip: {
    padding: "7px 10px",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    color: "#cdb89b",
    fontSize: "12px",
    cursor: "pointer"
  },
  feedAssignmentChipActive: {
    background: "rgba(143, 208, 167, 0.16)",
    color: "#ecf8ef",
    border: "1px solid rgba(143, 208, 167, 0.24)"
  },
  feedTaskChip: {
    padding: "7px 10px",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    color: "#d7c4ac",
    fontSize: "12px",
    cursor: "pointer"
  },
  feedTaskChipActive: {
    background: "rgba(120, 176, 226, 0.18)",
    color: "#eef7ff",
    border: "1px solid rgba(150, 210, 255, 0.24)"
  },
  feedSummaryPill: {
    padding: "6px 10px",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "#d8c3a3",
    fontSize: "12px"
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
  feedStatusStack: {
    display: "grid",
    gap: "6px",
    justifyItems: "end"
  },
  status: {
    textTransform: "capitalize",
    color: "#f6b26b"
  },
  assignmentBadge: {
    padding: "5px 8px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    border: "1px solid rgba(255,255,255,0.08)"
  },
  assignmentBadgeReady: {
    background: "rgba(98, 151, 111, 0.16)",
    color: "#dff5e3",
    border: "1px solid rgba(143, 208, 167, 0.22)"
  },
  assignmentBadgeMissing: {
    background: "rgba(181, 136, 82, 0.16)",
    color: "#fff0db",
    border: "1px solid rgba(240, 181, 106, 0.22)"
  },
  feedHighlight: {
    background: "rgba(240, 181, 106, 0.26)",
    color: "#fff3dd",
    borderRadius: "4px",
    padding: "0 2px"
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

function loadFeedPreferences(): FeedPreferences {
  try {
    const raw = window.localStorage.getItem(LOCAL_FEED_PREFS_KEY);
    if (!raw) {
      return {
        filter: "all",
        searchQuery: "",
        sortMode: "priority"
      };
    }

    const parsed = JSON.parse(raw) as Partial<FeedPreferences>;
    return {
      filter: isFeedFilter(parsed.filter) ? parsed.filter : "all",
      assignmentFilter: isFeedAssignmentFilter(parsed.assignmentFilter) ? parsed.assignmentFilter : "all",
      taskFilter: isFeedTaskFilter(parsed.taskFilter) ? parsed.taskFilter : "all",
      searchQuery: typeof parsed.searchQuery === "string" ? parsed.searchQuery : "",
      sortMode: isFeedSortMode(parsed.sortMode) ? parsed.sortMode : "priority"
    };
  } catch (error) {
    console.error("Failed to load feed preferences", error);
    return {
      filter: "all",
      assignmentFilter: "all",
      taskFilter: "all",
      searchQuery: "",
      sortMode: "priority"
    };
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

function activeSlotLabel(slotId: string) {
  if (slotId === "slot-a") {
    return "Slot A";
  }

  if (slotId === "slot-b") {
    return "Slot B";
  }

  if (slotId === "slot-c") {
    return "Slot C";
  }

  return slotId;
}

function formatSeatLabel(deskX: number, deskY: number) {
  return `${deskX},${deskY}`;
}

function highlightFeedText(text: string, query: string): ReactNode {
  if (!query) {
    return text;
  }

  const escapedQuery = escapeRegExp(query);
  const parts = text.split(new RegExp(`(${escapedQuery})`, "gi"));
  if (parts.length === 1) {
    return text;
  }

  return parts.map((part, index) => (
    <Fragment key={`${part}-${index}`}>
      {part.toLowerCase() === query.toLowerCase() ? <mark style={styles.feedHighlight}>{part}</mark> : part}
    </Fragment>
  ));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isFeedFilter(value: unknown): value is FeedPreferences["filter"] {
  return value === "all" || value === "working" || value === "reading" || value === "waiting" || value === "idle" || value === "sleeping" || value === "offline";
}

function isFeedAssignmentFilter(value: unknown): value is FeedPreferences["assignmentFilter"] {
  return value === "all" || value === "seated" || value === "unassigned";
}

function isFeedTaskFilter(value: unknown): value is FeedPreferences["taskFilter"] {
  return value === "all" || value === "with-task" || value === "without-task";
}

function isFeedSortMode(value: unknown): value is FeedPreferences["sortMode"] {
  return value === "priority" || value === "name" || value === "boss-first";
}

function compareAgents(left: OfficeAgent, right: OfficeAgent, mode: "priority" | "name" | "boss-first") {
  if (mode === "name") {
    return left.id.localeCompare(right.id);
  }

  if (mode === "boss-first") {
    if (left.isDefault !== right.isDefault) {
      return left.isDefault ? -1 : 1;
    }

    const stateDelta = compareAgentPriority(left, right);
    return stateDelta !== 0 ? stateDelta : left.id.localeCompare(right.id);
  }

  return compareAgentPriority(left, right);
}

function compareAgentPriority(left: OfficeAgent, right: OfficeAgent) {
  const stateOrder: Record<string, number> = {
    working: 0,
    reading: 1,
    waiting: 2,
    idle: 3,
    sleeping: 4,
    offline: 5
  };

  const stateDelta = (stateOrder[left.state] ?? 99) - (stateOrder[right.state] ?? 99);
  if (stateDelta !== 0) {
    return stateDelta;
  }

  if (left.isDefault !== right.isDefault) {
    return left.isDefault ? -1 : 1;
  }

  return left.id.localeCompare(right.id);
}

function humanizeAgentState(state: OfficeAgent["state"]) {
  switch (state) {
    case "working":
      return "Heads-down work";
    case "reading":
      return "Reading and review";
    case "waiting":
      return "Waiting for input";
    case "idle":
      return "Roaming the office";
    case "sleeping":
      return "Resting";
    case "offline":
      return "Offline";
    default:
      return state;
  }
}

function formatProjectSaveState(state: ProjectSaveState, savedAt: string | null) {
  switch (state) {
    case "saved":
      return savedAt ? `Saved ${formatTimestamp(savedAt)}` : "Saved to project";
    case "saving":
      return "Saving project layout...";
    case "loading":
      return "Loading project layout...";
    case "conflict":
      return "Project layout changed elsewhere";
    case "error":
      return "Project sync needs attention";
    case "idle":
    default:
      return "Local layout only";
  }
}

function formatTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function statusToneStyle(tone: "good" | "warm" | "alert" | "muted"): CSSProperties {
  switch (tone) {
    case "good":
      return {
        background: "rgba(98, 151, 111, 0.16)",
        border: "1px solid rgba(143, 208, 167, 0.22)"
      };
    case "warm":
      return {
        background: "rgba(181, 136, 82, 0.14)",
        border: "1px solid rgba(240, 181, 106, 0.2)"
      };
    case "alert":
      return {
        background: "rgba(164, 88, 88, 0.16)",
        border: "1px solid rgba(241, 139, 125, 0.24)"
      };
    case "muted":
    default:
      return {
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)"
      };
  }
}

function readinessToneStyle(tone: "good" | "warm" | "alert"): CSSProperties {
  switch (tone) {
    case "good":
      return {
        background: "rgba(98, 151, 111, 0.14)",
        border: "1px solid rgba(143, 208, 167, 0.2)"
      };
    case "alert":
      return {
        background: "rgba(164, 88, 88, 0.16)",
        border: "1px solid rgba(241, 139, 125, 0.24)"
      };
    case "warm":
    default:
      return {
        background: "rgba(181, 136, 82, 0.14)",
        border: "1px solid rgba(240, 181, 106, 0.2)"
      };
  }
}

function actionToneStyle(tone: "good" | "warm" | "alert" | "muted"): CSSProperties {
  switch (tone) {
    case "good":
      return {
        background: "rgba(98, 151, 111, 0.12)",
        border: "1px solid rgba(143, 208, 167, 0.18)"
      };
    case "alert":
      return {
        background: "rgba(164, 88, 88, 0.14)",
        border: "1px solid rgba(241, 139, 125, 0.22)"
      };
    case "warm":
      return {
        background: "rgba(181, 136, 82, 0.12)",
        border: "1px solid rgba(240, 181, 106, 0.18)"
      };
    case "muted":
    default:
      return {
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)"
      };
  }
}

function narrativeToneStyle(tone: "focused" | "blocked" | "quiet" | "offline"): CSSProperties {
  switch (tone) {
    case "focused":
      return {
        background: "rgba(98, 151, 111, 0.16)",
        color: "#e8f5eb",
        border: "1px solid rgba(143, 208, 167, 0.24)"
      };
    case "blocked":
      return {
        background: "rgba(164, 88, 88, 0.18)",
        color: "#ffe4df",
        border: "1px solid rgba(241, 139, 125, 0.24)"
      };
    case "quiet":
      return {
        background: "rgba(181, 136, 82, 0.16)",
        color: "#fff0db",
        border: "1px solid rgba(240, 181, 106, 0.22)"
      };
    case "offline":
    default:
      return {
        background: "rgba(255,255,255,0.06)",
        color: "#f0dfc4",
        border: "1px solid rgba(255,255,255,0.1)"
      };
  }
}

function attentionToneStyle(tone: "good" | "warm" | "alert" | "muted"): CSSProperties {
  switch (tone) {
    case "good":
      return {
        background: "rgba(98, 151, 111, 0.12)",
        border: "1px solid rgba(143, 208, 167, 0.2)"
      };
    case "alert":
      return {
        background: "rgba(164, 88, 88, 0.16)",
        border: "1px solid rgba(241, 139, 125, 0.24)"
      };
    case "warm":
      return {
        background: "rgba(181, 136, 82, 0.12)",
        border: "1px solid rgba(240, 181, 106, 0.18)"
      };
    case "muted":
    default:
      return {
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)"
      };
  }
}

function buildRoomReadiness({
  layout,
  knownAgentIds,
  unassignedAgents,
  activeSlot,
  projectActiveSlotId
}: {
  layout: OfficeLayout;
  knownAgentIds: string[];
  unassignedAgents: string[];
  activeSlot: string | null;
  projectActiveSlotId: string | null;
}) {
  const deskCount = layout.tiles.filter((tile) => tile.type === "desk").length;
  const coffeeCount = layout.tiles.filter((tile) => tile.type === "coffee").length;
  const couchCount = layout.tiles.filter((tile) => tile.type === "couch").length;
  const expectedSeats = Math.max(knownAgentIds.length, layout.agents.length);

  return [
    {
      label: "Seat Coverage",
      value: unassignedAgents.length === 0 ? "Ready" : `${unassignedAgents.length} open`,
      detail:
        unassignedAgents.length === 0
          ? `${layout.agents.length} assigned seat${layout.agents.length === 1 ? "" : "s"}`
          : `Still missing desks for ${unassignedAgents.slice(0, 3).join(", ")}${unassignedAgents.length > 3 ? "..." : ""}`,
      tone: unassignedAgents.length === 0 ? ("good" as const) : ("warm" as const)
    },
    {
      label: "Shared Spaces",
      value: coffeeCount > 0 && couchCount > 0 ? "Balanced" : "Needs props",
      detail:
        coffeeCount > 0 && couchCount > 0
          ? `${coffeeCount} coffee spot${coffeeCount === 1 ? "" : "s"} and ${couchCount} lounge zone${couchCount === 1 ? "" : "s"}`
          : "Add at least one coffee tile and one couch tile for richer routines",
      tone: coffeeCount > 0 && couchCount > 0 ? ("good" as const) : ("alert" as const)
    },
    {
      label: "Desk Capacity",
      value: deskCount >= expectedSeats ? "Healthy" : "Tight",
      detail:
        deskCount >= expectedSeats
          ? `${deskCount} desks for ${expectedSeats} active seats`
          : `${deskCount} desks may be too few for ${expectedSeats} known agents`,
      tone: deskCount >= expectedSeats ? ("good" as const) : ("warm" as const)
    },
    {
      label: "Saved Context",
      value: activeSlot || projectActiveSlotId ? "Anchored" : "Unsaved",
      detail:
        activeSlot || projectActiveSlotId
          ? `Current room ${activeSlot ? "is linked to a saved slot" : "inherits the project default"}`
          : "Save this layout or mark an active room so the project has a stable default",
      tone: activeSlot || projectActiveSlotId ? ("good" as const) : ("warm" as const)
    }
  ];
}

function buildRecommendedActions({
  unassignedAgents,
  hotspotSummary,
  activeSlot,
  projectActiveSlotId,
  stateCounts,
  connectionState
}: {
  unassignedAgents: string[];
  hotspotSummary: { desks: number; coffee: number; lounge: number };
  activeSlot: string | null;
  projectActiveSlotId: string | null;
  stateCounts: Record<OfficeAgent["state"], number>;
  connectionState: "connecting" | "open" | "closed";
}) {
  const actions: Array<{ title: string; detail: string; tone: "good" | "warm" | "alert" | "muted" }> = [];

  if (unassignedAgents.length > 0) {
    actions.push({
      title: "Assign desks to every known agent",
      detail: `Use the layout editor to seat ${unassignedAgents.slice(0, 3).join(", ")}${unassignedAgents.length > 3 ? " and the remaining agents" : ""}.`,
      tone: "warm"
    });
  }

  if (hotspotSummary.coffee === 0 || hotspotSummary.lounge === 0) {
    actions.push({
      title: "Add shared-space landmarks",
      detail: "Place at least one coffee tile and one couch tile so the office routines have stronger destinations.",
      tone: "alert"
    });
  }

  if (!activeSlot && !projectActiveSlotId) {
    actions.push({
      title: "Anchor this room to a saved slot",
      detail: "Save the current layout and set an active room so resets and project startup keep a stable default.",
      tone: "warm"
    });
  }

  if (stateCounts.waiting > 0) {
    actions.push({
      title: "Check waiting agents for blockers",
      detail: `${stateCounts.waiting} agent${stateCounts.waiting === 1 ? " is" : "s are"} waiting, so this is a good moment to inspect pending tasks or prompts.`,
      tone: "alert"
    });
  }

  if (connectionState !== "open") {
    actions.push({
      title: "Stabilize the live connection",
      detail: "The socket is not fully open right now, so live office updates may lag until the watcher reconnects.",
      tone: "alert"
    });
  }

  if (actions.length === 0) {
    actions.push(
      {
        title: "Room setup looks healthy",
        detail: "This office has desks, shared spaces, saved context, and no obvious assignment gaps.",
        tone: "good"
      },
      {
        title: "Next best move is visual polish",
        detail: "Keep going with richer tiles, character art, and scene dressing to make the current systems feel production-ready.",
        tone: "muted"
      },
      {
        title: "Then focus on hardening",
        detail: "A stabilization pass around sync conflicts, watcher behavior, and editor edge cases would be high value after art polish.",
        tone: "muted"
      }
    );
  }

  return actions.slice(0, 3);
}

function buildOfficeNarrative({
  stateCounts,
  connectionState,
  focusAgents,
  blockedAgents,
  quietAgents,
  hotspotSummary,
  currentRoomLabel
}: {
  stateCounts: Record<OfficeAgent["state"], number>;
  connectionState: "connecting" | "open" | "closed";
  focusAgents: OfficeAgent[];
  blockedAgents: OfficeAgent[];
  quietAgents: OfficeAgent[];
  hotspotSummary: { desks: number; coffee: number; lounge: number };
  currentRoomLabel: string;
}) {
  const focusedCount = stateCounts.working + stateCounts.reading;
  const quietCount = stateCounts.sleeping + stateCounts.offline;
  const tone =
    connectionState === "closed"
      ? "offline"
      : stateCounts.waiting > 0
        ? "blocked"
        : focusedCount > 0
          ? "focused"
          : "quiet";
  const mood =
    tone === "offline"
      ? "Disconnected"
      : tone === "blocked"
        ? "Needs Attention"
        : tone === "focused"
          ? "Productive"
          : "Quiet";

  const summary =
    tone === "offline"
      ? `${currentRoomLabel} is mostly waiting on the live connection right now, so the office view may feel stale until OpenClaw reconnects.`
      : tone === "blocked"
        ? `${currentRoomLabel} has active work underway, but ${stateCounts.waiting} agent${stateCounts.waiting === 1 ? " is" : "s are"} waiting on input, so this is a good moment to clear blockers.`
        : tone === "focused"
          ? `${currentRoomLabel} feels productive right now, with ${focusedCount} agent${focusedCount === 1 ? "" : "s"} in focused work or reading routines and the room layout supporting active flow.`
          : `${currentRoomLabel} is in a quieter stretch, with fewer active work loops and more downtime or background presence across the office.`;

  const bullets = [
    focusAgents.length > 0
      ? `Focus: ${focusAgents.map((agent) => agent.id).join(", ")}`
      : "Focus: no active heads-down work yet",
    blockedAgents.length > 0
      ? `Blockers: ${blockedAgents.map((agent) => agent.id).join(", ")}`
      : "Blockers: none right now",
    quietAgents.length > 0
      ? `Quiet: ${quietAgents.map((agent) => agent.id).join(", ")}`
      : `Spaces: ${hotspotSummary.coffee} coffee, ${hotspotSummary.lounge} lounge`
  ];

  if (quietCount > focusedCount && quietAgents.length === 0) {
    bullets[2] = "Quiet: the room is calm overall";
  }

  return {
    tone,
    mood,
    summary,
    bullets
  };
}

function buildAttentionItems({
  blockedAgents,
  quietAgents,
  unassignedAgents,
  projectSaveState,
  connectionState,
  hotspotSummary
}: {
  blockedAgents: OfficeAgent[];
  quietAgents: OfficeAgent[];
  unassignedAgents: string[];
  projectSaveState: ProjectSaveState;
  connectionState: ProjectSaveState | "connecting" | "open" | "closed";
  hotspotSummary: { desks: number; coffee: number; lounge: number };
}) {
  const items: Array<{ title: string; detail: string; tag: string; tone: "good" | "warm" | "alert" | "muted" }> = [];

  if (blockedAgents.length > 0) {
    items.push({
      title: "Agents are waiting on input",
      detail: `${blockedAgents.map((agent) => agent.id).join(", ")} ${blockedAgents.length === 1 ? "is" : "are"} currently blocked and may need prompt follow-up or context.`,
      tag: "Blocker",
      tone: "alert"
    });
  }

  if (unassignedAgents.length > 0) {
    items.push({
      title: "Some agents still have no desk",
      detail: `${unassignedAgents.join(", ")} ${unassignedAgents.length === 1 ? "has" : "have"} no assigned seat yet, so room routines may feel incomplete until they are placed.`,
      tag: "Layout",
      tone: "warm"
    });
  }

  if (projectSaveState === "conflict" || projectSaveState === "error") {
    items.push({
      title: "Project sync needs attention",
      detail:
        projectSaveState === "conflict"
          ? "The project layout changed elsewhere, so decide whether to keep the local copy or reload from project."
          : "Recent project persistence failed, so this layout may only exist locally until sync succeeds again.",
      tag: "Sync",
      tone: "alert"
    });
  }

  if (connectionState !== "open") {
    items.push({
      title: "Live connection is not fully open",
      detail: "OpenClaw updates may lag or stop until the socket reconnects and the office feed becomes live again.",
      tag: "Live Feed",
      tone: "alert"
    });
  }

  if ((hotspotSummary.coffee === 0 || hotspotSummary.lounge === 0) && items.length < 3) {
    items.push({
      title: "Shared spaces are still sparse",
      detail: "Add coffee and couch landmarks so the richer office routines have places to gather, pause, and rest.",
      tag: "Atmosphere",
      tone: "warm"
    });
  }

  if (quietAgents.length > 0 && items.length < 3) {
    items.push({
      title: "Some agents are in low-activity states",
      detail: `${quietAgents.map((agent) => agent.id).join(", ")} ${quietAgents.length === 1 ? "is" : "are"} currently sleeping or offline, which is fine unless you expected more activity.`,
      tag: "Heads Up",
      tone: "muted"
    });
  }

  if (items.length === 0) {
    items.push(
      {
        title: "No urgent issues detected",
        detail: "The room looks healthy right now, with live updates, saved context, and no obvious blockers or setup gaps.",
        tag: "Healthy",
        tone: "good"
      },
      {
        title: "Use this moment for polish work",
        detail: "Visual polish, richer assets, and additional behaviors are the highest-value next moves from here.",
        tag: "Next",
        tone: "muted"
      }
    );
  }

  return items.slice(0, 3);
}
