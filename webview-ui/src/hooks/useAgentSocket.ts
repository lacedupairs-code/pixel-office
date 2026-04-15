import { useEffect } from "react";
import { useOfficeStore, type OfficeAgent } from "../store/officeStore";

type InitMessage = {
  type: "init";
  agents: OfficeAgent[];
};

type AgentUpdateMessage = {
  type: "agentUpdate";
  agentId: string;
  state: OfficeAgent["state"];
  taskHint?: string;
  isDefault: boolean;
  sessionPath: string | null;
};

type ServerMessage = InitMessage | AgentUpdateMessage;

export function useAgentSocket(): void {
  const initAgents = useOfficeStore((state) => state.initAgents);
  const updateAgent = useOfficeStore((state) => state.updateAgent);
  const setConnectionState = useOfficeStore((state) => state.setConnectionState);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socketUrl = `${protocol}://${window.location.host}`;
    let socket: WebSocket | undefined;
    let reconnectTimer: number | undefined;
    let disposed = false;

    const connect = () => {
      if (disposed) {
        return;
      }

      setConnectionState("connecting");
      socket = new WebSocket(socketUrl);

      socket.addEventListener("open", () => {
        setConnectionState("open");
      });

      socket.addEventListener("close", () => {
        if (disposed) {
          return;
        }

        setConnectionState("closed");
        reconnectTimer = window.setTimeout(connect, 1500);
      });

      socket.addEventListener("message", (event) => {
        const message = typeof event.data === "string" ? parseServerMessage(event.data) : null;
        if (!message) {
          return;
        }

        if (message.type === "init") {
          initAgents(message.agents);
        } else {
          updateAgent({
            id: message.agentId,
            state: message.state,
            taskHint: message.taskHint,
            isDefault: message.isDefault,
            sessionPath: message.sessionPath
          });
        }
      });
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }

      socket?.close();
    };
  }, [initAgents, setConnectionState, updateAgent]);
}

function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const message = JSON.parse(raw) as Partial<InitMessage & AgentUpdateMessage>;
    if (message.type === "init" && Array.isArray(message.agents)) {
      return {
        type: "init",
        agents: message.agents as OfficeAgent[]
      };
    }

    if (
      message.type === "agentUpdate" &&
      typeof message.agentId === "string" &&
      typeof message.state === "string" &&
      typeof message.isDefault === "boolean" &&
      (message.sessionPath === null || typeof message.sessionPath === "string") &&
      (message.taskHint === undefined || typeof message.taskHint === "string")
    ) {
      return {
        type: "agentUpdate",
        agentId: message.agentId,
        state: message.state as OfficeAgent["state"],
        taskHint: message.taskHint,
        isDefault: message.isDefault,
        sessionPath: message.sessionPath
      };
    }
  } catch (error) {
    console.error("Ignoring invalid socket payload", error);
  }

  return null;
}
