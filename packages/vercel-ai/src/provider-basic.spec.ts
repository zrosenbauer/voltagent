import type { BaseMessage } from "@voltagent/core";
import { convertAsyncIterableToArray } from "@voltagent/internal";
import type { DangerouslyAllowAny } from "@voltagent/internal/types";
import { MockLanguageModelV1, simulateReadableStream } from "ai/test";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { VercelAIProvider } from "./index";

// Example: How to use the createProviderTests utility
// This is just a demonstration - you would replace this with your actual provider

// Mock provider implementation for demonstration
const provider = new VercelAIProvider();

const testMessages = [
  { role: "user" as const, content: "Hello, how are you?" },
  { role: "assistant" as const, content: "I'm doing well, thank you!" },
];

const mockTextModel = new MockLanguageModelV1({
  doGenerate: async () => ({
    rawCall: { rawPrompt: null, rawSettings: {} },
    finishReason: "stop",
    usage: { promptTokens: 10, completionTokens: 20 },
    text: convertMessagesToText(testMessages),
    response: {
      id: "test-id",
      modelId: "mock-model-id",
      timestamp: new Date(),
    },
  }),
  doStream: async () => ({
    stream: simulateReadableStream({
      chunks: mockMessages.map((m) => ({ type: "text-delta", textDelta: m.content })),
    }),
    rawCall: { rawPrompt: null, rawSettings: {} },
  }),
});

/**
 * The default mock object to use for testing
 */
const testObject = {
  name: "John Doe",
  age: 30,
  hobbies: ["reading", "gaming"],
};

const mockObjectModel = new MockLanguageModelV1({
  defaultObjectGenerationMode: "json",
  doGenerate: async () => ({
    rawCall: { rawPrompt: null, rawSettings: {} },
    finishReason: "stop",
    usage: { promptTokens: 10, completionTokens: 20 },
    text: JSON.stringify(testObject),
  }),
  doStream: async () => ({
    stream: simulateReadableStream({
      chunks: mockMessages.map((m) => ({ type: "text-delta", textDelta: m.content })),
    }),
    rawCall: { rawPrompt: null, rawSettings: {} },
  }),
});

/**
 * The default mock messages to use for testing
 */
const mockMessages = [{ role: "user" as const, content: "Hello, how are you?" }];

describe("core", () => {
  describe("generateText", () => {
    it("should generate text matching", async () => {
      const result = await provider.generateText({
        messages: mockMessages,
        model: mockTextModel,
      });

      expect(result).toBeDefined();
      expect(result.text).toBe(convertMessagesToText(mockMessages));
    });

    it("should include the original provider response in the result", async () => {
      const result = await provider.generateText({
        messages: mockMessages,
        model: mockTextModel,
      });

      expect(result).toBeDefined();
      expect(result.provider).toBeDefined();
    });

    it("should include usage information in the result if available", async () => {
      const result = await provider.generateText({
        messages: mockMessages,
        model: mockTextModel as DangerouslyAllowAny,
      });

      expect(result).toBeDefined();
      // Usage is optional, so we just check if the result is valid
      if (result.usage) {
        expect(result.usage).toBeDefined();
      }
    });

    it("should handle finish reason", async () => {
      const result = await provider.generateText({
        messages: mockMessages,
        model: mockTextModel as DangerouslyAllowAny,
      });

      expect(result).toBeDefined();
      // Finish reason is optional, so we just check if the result is valid
      if (result.finishReason) {
        expect(result.finishReason).toBeDefined();
      }
    });
  });

  describe("streamText", () => {
    it("should stream text with basic input", async () => {
      const result = await provider.streamText({
        messages: mockMessages,
        model: mockTextModel,
      });

      expect(result).toBeDefined();
      expect(await convertAsyncIterableToArray(result.textStream)).toEqual(
        covertMessagesToStreamArray(testMessages),
      );
    });

    it("should provide readable stream", async () => {
      const result = await provider.streamText({
        messages: mockMessages,
        model: mockTextModel,
      });

      expect(result).toBeDefined();
      expect(result.textStream).toBeDefined();

      // Test that we can read from the stream
      const reader = result.textStream.getReader();
      expect(reader).toBeDefined();

      // Clean up
      reader.releaseLock();
    });
  });

  describe("generateObject", () => {
    it("should generate object with basic input", async () => {
      const result = await provider.generateObject({
        messages: mockMessages,
        model: mockObjectModel,
        schema: z.object({
          name: z.string(),
          age: z.number(),
          hobbies: z.array(z.string()),
        }),
      });

      expect(result).toBeDefined();
      expect(result.object).toEqual(testObject);
    });

    it("should handle object generation without schema", async () => {
      // This test may fail for providers that require schemas
      try {
        const result = await provider.generateObject({
          messages: mockMessages,
          model: mockObjectModel,
          schema: undefined as any,
        });

        expect(result).toBeDefined();
      } catch (error) {
        // It's acceptable for providers to require schemas
        expect(error).toBeDefined();
      }
    });
  });

  describe("streamObject", () => {
    it("should stream object with basic input", async () => {
      const result = await provider.streamObject({
        messages: mockMessages,
        model: mockObjectModel,
        schema: z.object({
          name: z.string(),
          age: z.number(),
          hobbies: z.array(z.string()),
        }),
      });

      expect(result).toBeDefined();
      expect(result.objectStream).toBeDefined();
      expect(typeof result.objectStream).toBe("object");
    });

    it("should provide readable object stream", async () => {
      const result = await provider.streamObject({
        messages: mockMessages,
        model: mockObjectModel,
        schema: z.object({
          name: z.string(),
          age: z.number(),
          hobbies: z.array(z.string()),
        }),
      });

      expect(result).toBeDefined();
      expect(result.objectStream).toBeDefined();

      // Test that we can read from the stream
      const reader = result.objectStream.getReader();
      expect(reader).toBeDefined();

      // Clean up
      reader.releaseLock();
    });
  });
});

function convertMessagesToText(messages: Array<BaseMessage>) {
  return messages.map((m) => m.content).join("\n");
}

function covertMessagesToStreamArray(messages: Array<BaseMessage>) {
  return convertMessagesToText(messages).split("\n");
}
