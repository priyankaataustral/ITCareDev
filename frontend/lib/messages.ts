// lib/messages.ts
export type SolutionPayload = {
  type: "solution";
  text: string;
  askToSend?: boolean;
  next_actions?: string[];
};

export function parseMessageContent(
  raw: string
): { kind: "text" | "solution"; text: string; payload?: SolutionPayload } {
  if (!raw) return { kind: "text", text: "" };
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj?.type === "solution" && typeof obj.text === "string") {
        return { kind: "solution", text: obj.text, payload: obj as SolutionPayload };
      }
    } catch {
      /* fall through */
    }
  }
  return { kind: "text", text: raw };
}
