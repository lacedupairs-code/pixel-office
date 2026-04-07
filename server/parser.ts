export type AgentState =
  | "working"
  | "reading"
  | "idle"
  | "waiting"
  | "sleeping"
  | "offline";

type JsonRecord = {
  type?: string;
  role?: string;
  content?: Array<{
    type?: string;
    name?: string;
    text?: string;
  }>;
};

const READING_TOOLS = new Set(["read", "glob", "search", "grep", "list", "find"]);

export function parseLineForState(line: string): AgentState | null {
  if (!line.trim()) {
    return null;
  }

  try {
    const record = JSON.parse(line) as JsonRecord;

    if (record.type === "compaction") {
      return "working";
    }

    if (record.role === "user") {
      return "working";
    }

    if (record.role !== "assistant") {
      return null;
    }

    const content = Array.isArray(record.content) ? record.content : [];
    const toolUse = content.find((item) => item.type === "tool_use");
    if (toolUse?.name) {
      return READING_TOOLS.has(toolUse.name.toLowerCase()) ? "reading" : "working";
    }

    const hasText = content.some((item) => item.type === "text" && item.text?.trim());
    if (hasText) {
      return "waiting";
    }
  } catch {
    return null;
  }

  return null;
}

export function extractTaskHint(line: string): string | undefined {
  try {
    const record = JSON.parse(line) as JsonRecord;
    const content = Array.isArray(record.content) ? record.content : [];
    const toolUse = content.find((item) => item.type === "tool_use");
    if (toolUse?.name) {
      return toolUse.name;
    }

    const text = content.find((item) => item.type === "text" && item.text?.trim());
    return text?.text?.slice(0, 40).trim() || undefined;
  } catch {
    return undefined;
  }
}

