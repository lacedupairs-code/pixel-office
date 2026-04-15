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
  name?: string;
  text?: string;
  message?: string;
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

    const topLevelToolName = typeof record.name === "string" ? record.name : undefined;
    if (topLevelToolName) {
      return READING_TOOLS.has(topLevelToolName.toLowerCase()) ? "reading" : "working";
    }

    if (record.role === "user") {
      return "working";
    }

    if (record.role === "tool" || record.type === "tool_result") {
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

    const fallbackText = [record.text, record.message].find((value) => typeof value === "string" && value.trim());
    if (fallbackText) {
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
    if (typeof record.name === "string" && record.name.trim()) {
      return record.name.trim();
    }

    const content = Array.isArray(record.content) ? record.content : [];
    const toolUse = content.find((item) => item.type === "tool_use");
    if (toolUse?.name) {
      return toolUse.name;
    }

    const text = content.find((item) => item.type === "text" && item.text?.trim());
    if (text?.text?.trim()) {
      return text.text.slice(0, 40).trim();
    }

    const fallbackText = [record.text, record.message].find((value) => typeof value === "string" && value.trim());
    return fallbackText?.slice(0, 40).trim() || undefined;
  } catch {
    return undefined;
  }
}
