import type { BaseMessage } from "@voltagent/core";
import { MockLanguageModelV1, simulateReadableStream } from "ai/test";
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
        stream: simulateReadableStream({
          chunks: chunks.map((chunk) => ({ type: "text-delta", textDelta: chunk })),
        }),
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
  return convertMessagesToText(messages).split("\n");
}

function convertObjectToChunks(object: Record<string, any>) {
  return JSON.stringify(object, null, 2).split("\n");
}
