/**
 * Message converter utility functions for converting between AI SDK message types
 */

import * as crypto from "node:crypto";
import type { AssistantModelMessage, ToolModelMessage } from "@ai-sdk/provider-utils";
import type { UIMessage } from "ai";

/**
 * Convert response messages to UIMessages for batch saving
 * This follows the same pattern as AI SDK's internal toUIMessageStream conversion
 */
export async function convertResponseMessagesToUIMessages(
  responseMessages: (AssistantModelMessage | ToolModelMessage)[],
): Promise<UIMessage[]> {
  // Collapse all response messages from a single call into ONE assistant UIMessage,
  // mirroring AI SDK's stream behavior (single response message with combined parts).

  const uiMessage: UIMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    parts: [],
  };

  // Track tool parts globally by toolCallId to update outputs when tool results arrive
  const toolPartsById = new Map<string, any>();

  let assistantCounter = 0;

  for (const message of responseMessages) {
    if (message.role === "assistant" && message.content) {
      // Insert step boundary between assistant messages (optional but aligns with stream semantics)
      if (assistantCounter > 0) {
        uiMessage.parts.push({ type: "step-start" } as any);
      }
      assistantCounter++;

      if (typeof message.content === "string") {
        if (message.content.trim()) {
          uiMessage.parts.push({
            type: "text",
            text: message.content,
          });
        }
        continue;
      }

      for (const contentPart of message.content) {
        switch (contentPart.type) {
          case "text": {
            if (contentPart.text && contentPart.text.length > 0) {
              uiMessage.parts.push({
                type: "text",
                text: contentPart.text,
                ...(contentPart.providerOptions
                  ? { providerMetadata: contentPart.providerOptions as any }
                  : {}),
              });
            }
            break;
          }
          case "reasoning": {
            if (contentPart.text && contentPart.text.length > 0) {
              uiMessage.parts.push({
                type: "reasoning",
                text: contentPart.text,
                ...(contentPart.providerOptions
                  ? { providerMetadata: contentPart.providerOptions as any }
                  : {}),
              });
            }
            break;
          }
          case "tool-call": {
            const toolPart = {
              type: `tool-${contentPart.toolName}` as const,
              toolCallId: contentPart.toolCallId,
              state: "input-available" as const,
              input: contentPart.input || {},
              ...(contentPart.providerOptions
                ? { callProviderMetadata: contentPart.providerOptions as any }
                : {}),
              ...(contentPart.providerExecuted != null
                ? { providerExecuted: contentPart.providerExecuted }
                : {}),
            };
            uiMessage.parts.push(toolPart as any);
            toolPartsById.set(contentPart.toolCallId, toolPart);
            break;
          }
          case "tool-result": {
            const existing = toolPartsById.get(contentPart.toolCallId);
            if (existing) {
              existing.state = "output-available";
              existing.output = contentPart.output;
              // providerExecuted is true for provider-executed results
              existing.providerExecuted = true;
            } else {
              const resultPart = {
                type: `tool-${contentPart.toolName}` as const,
                toolCallId: contentPart.toolCallId,
                state: "output-available" as const,
                input: {},
                output: contentPart.output,
                providerExecuted: true,
              };
              uiMessage.parts.push(resultPart as any);
              toolPartsById.set(contentPart.toolCallId, resultPart);
            }
            break;
          }
          case "file": {
            let url: string;
            if (contentPart.data instanceof URL) {
              url = contentPart.data.toString();
            } else if (typeof contentPart.data === "string") {
              url = `data:${contentPart.mediaType};base64,${contentPart.data}`;
            } else {
              const base64 = Buffer.from(contentPart.data as Uint8Array).toString("base64");
              url = `data:${contentPart.mediaType};base64,${base64}`;
            }
            uiMessage.parts.push({
              type: "file",
              mediaType: contentPart.mediaType,
              url,
            });
            break;
          }
        }
      }
    } else if (message.role === "tool" && message.content) {
      for (const toolResult of message.content) {
        const existing = toolPartsById.get(toolResult.toolCallId);
        if (existing) {
          existing.state = "output-available";
          existing.output = toolResult.output;
          existing.providerExecuted = true;
        } else {
          const resultPart = {
            type: `tool-${toolResult.toolName}` as const,
            toolCallId: toolResult.toolCallId,
            state: "output-available" as const,
            input: {},
            output: toolResult.output,
            providerExecuted: true,
          };
          uiMessage.parts.push(resultPart as any);
          toolPartsById.set(toolResult.toolCallId, resultPart);
        }
      }
    }
  }

  return uiMessage.parts.length > 0 ? [uiMessage] : [];
}
