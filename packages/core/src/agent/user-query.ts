import type { ModelMessage, UIMessage } from "ai";

/** Extracts the last user query for semantic retrieval and conversation titles. */
export function extractUserQuery(input: string | UIMessage[] | ModelMessage[]): string | undefined {
  if (typeof input === "string") return input;

  const message = input.filter((message) => message.role === "user").at(-1);
  if (!message) return undefined;

  const content = "parts" in message ? message.parts : message.content;
  if (typeof content === "string") return content.trim() || undefined;

  const text = content
    .flatMap((part) =>
      part.type === "text" && typeof part.text === "string" ? [part.text.trim()] : [],
    )
    .filter(Boolean)
    .join(" ");
  return text || undefined;
}
