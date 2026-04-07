export type AgentStatus =
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

const WORKING_TOOLS = new Set([
  "bash",
  "write",
  "edit",
  "computer",
  "str_replace_based_edit_tool"
]);

const READING_TOOLS = new Set(["read", "glob", "search", "grep", "list"]);

export function inferStatusFromLine(line: string): AgentStatus | null {
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
      if (WORKING_TOOLS.has(toolUse.name)) {
        return "working";
      }

      if (READING_TOOLS.has(toolUse.name)) {
        return "reading";
      }

      return "working";
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

