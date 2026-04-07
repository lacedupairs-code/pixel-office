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
    const socket = new WebSocket(`${protocol}://${window.location.host}`);

    socket.addEventListener("open", () => {
      setConnectionState("open");
    });

    socket.addEventListener("close", () => {
      setConnectionState("closed");
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === "init") {
        initAgents(message.agents);
        return;
      }

      if (message.type === "agentUpdate") {
        updateAgent({
          id: message.agentId,
          state: message.state,
          taskHint: message.taskHint,
          isDefault: message.isDefault,
          sessionPath: message.sessionPath
        });
      }
    });

    return () => socket.close();
  }, [initAgents, setConnectionState, updateAgent]);
}
