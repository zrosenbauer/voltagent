import type { BaseMessage } from "@voltagent/core";
import { convertArrayToReadableStream } from "@voltagent/internal";
import { safeStringify } from "@voltagent/internal/utils";
import { MockLanguageModelV1 } from "ai/test";
import type { VercelAIProvider } from "./provider";

/**
 * Creates a mock model that can be used to test the provider.
 * @param output - The output to return from the model.
 * @returns A mock model that can be used to test the provider.
 */
export function createMockModel(
  output: Error | BaseMessage[] | Record<string, any>,
): ProviderModel {
  const text = Array.isArray(output) ? convertMessagesToText(output) : JSON.stringify(output);
  const chunks = Array.isArray(output)
    ? covertMessagesToChunks(output)
    : convertObjectToChunks(output);

  return new MockLanguageModelV1({
    modelId: "mock-model",
    defaultObjectGenerationMode: Array.isArray(output) ? undefined : "json",
    doGenerate: async () => {
      if (output instanceof Error) {
        throw output;
      }

      return {
        rawCall: { rawPrompt: null, rawSettings: {} },
        finishReason: "stop",
        usage: { promptTokens: 10, completionTokens: 20 },
        text,
      };
    },
    doStream: async () => {
      if (output instanceof Error) {
        throw output;
      }

      return {
        stream: convertArrayToReadableStream([
          ...chunks,
          {
            type: "finish",
            finishReason: "stop",
            usage: { completionTokens: 10, promptTokens: 3 },
          },
        ]),
        usage: { promptTokens: 3, completionTokens: 10 },
        rawCall: { rawPrompt: null, rawSettings: {} },
      };
    },
  });
}

type ProviderModel = Parameters<VercelAIProvider["generateText"]>[0]["model"];

function convertMessagesToText(messages: Array<BaseMessage>) {
  return messages.map((m) => m.content).join("\n");
}

function covertMessagesToChunks(messages: Array<BaseMessage>) {
  return convertMessagesToText(messages)
    .split("\n")
    .map((chunk) => ({ type: "text-delta", textDelta: chunk }) as const);
}

function convertObjectToChunks(object: Record<string, any>) {
  return safeStringify(object, { indentation: 2 })
    .split("\n")
    .map((chunk) => ({ type: "text-delta", textDelta: chunk }) as const);
}
