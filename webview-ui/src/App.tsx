import { useEffect, type CSSProperties } from "react";
import { useOfficeStore } from "./store/officeStore";

type InitMessage = {
  type: "init" | "agentUpdate";
  agents: Array<{ id: string; status: string; sessionPath: string | null }>;
  openClawBaseDir?: string;
};

declare global {
  interface Window {
    acquireVsCodeApi?: () => { postMessage: (message: unknown) => void };
  }
}

export default function App() {
  const agents = useOfficeStore((state) => state.agents);
  const openClawBaseDir = useOfficeStore((state) => state.openClawBaseDir);
  const setAgents = useOfficeStore((state) => state.setAgents);
  const setOpenClawBaseDir = useOfficeStore((state) => state.setOpenClawBaseDir);

  useEffect(() => {
    window.acquireVsCodeApi?.().postMessage({ type: "webviewReady" });

    const onMessage = (event: MessageEvent<InitMessage>) => {
      if (event.data.type !== "init" && event.data.type !== "agentUpdate") {
        return;
      }

      setAgents(event.data.agents);
      if (event.data.openClawBaseDir) {
        setOpenClawBaseDir(event.data.openClawBaseDir);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [setAgents, setOpenClawBaseDir]);

  return (
    <main style={styles.page}>
      <section style={styles.panel}>
        <h1 style={styles.title}>Pixel Office</h1>
        <p style={styles.copy}>
          Phase 1 scaffold loaded. The extension can now discover OpenClaw agents and push status updates into the
          webview.
        </p>
        <p style={styles.path}>OpenClaw path: {openClawBaseDir || "Not detected"}</p>
        <ul style={styles.list}>
          {agents.length === 0 ? <li style={styles.item}>No agents discovered yet.</li> : null}
          {agents.map((agent) => (
            <li key={agent.id} style={styles.item}>
              <strong>{agent.id}</strong> <span style={styles.status}>{agent.status}</span>
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
    fontFamily: '"Segoe UI", sans-serif'
  },
  panel: {
    maxWidth: "560px",
    padding: "20px",
    border: "1px solid rgba(255, 231, 198, 0.15)",
    borderRadius: "16px",
    background: "rgba(30, 24, 19, 0.9)",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.35)"
  },
  title: {
    margin: "0 0 12px",
    fontSize: "28px"
  },
  copy: {
    margin: "0 0 8px",
    lineHeight: 1.5
  },
  path: {
    margin: "0 0 16px",
    color: "#d6c2a4"
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
  }
};
