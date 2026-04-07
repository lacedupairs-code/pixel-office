import { useEffect, type CSSProperties } from "react";
import { useAgentSocket } from "./hooks/useAgentSocket";
import { useOfficeStore } from "./store/officeStore";

export default function App() {
  useAgentSocket();

  const agents = useOfficeStore((state) => state.agents);
  const connectionState = useOfficeStore((state) => state.connectionState);

  useEffect(() => {
    document.title = "Pixel Office";
  }, []);

  return (
    <main style={styles.page}>
      <section style={styles.panel}>
        <h1 style={styles.title}>Pixel Office</h1>
        <p style={styles.copy}>
          The standalone server is now responsible for OpenClaw discovery and state broadcasting. This browser client
          is connected over WebSockets and ready for the canvas office port.
        </p>
        <p style={styles.path}>Socket status: {connectionState}</p>
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
  },
  meta: {
    marginTop: "4px",
    fontSize: "12px",
    color: "#bda988"
  }
};
