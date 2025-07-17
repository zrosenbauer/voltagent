import { convertAsyncIterableToArray } from "@voltagent/internal";
import type { DangerouslyAllowAny } from "@voltagent/internal/types";
import type { CoreMessage } from "ai";
import { MockLanguageModelV1, simulateReadableStream } from "ai/test";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import { VercelAIProvider } from "./provider";
import { createMockModel } from "./testing";

describe.skip("custom", () => {
  let provider: VercelAIProvider;

  beforeEach(() => {
    provider = new VercelAIProvider();
  });

  describe("streamText", () => {
    let mockModel: MockLanguageModelV1;

    beforeEach(() => {
      mockModel = new MockLanguageModelV1({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: "text-delta", textDelta: "Hello" },
              { type: "text-delta", textDelta: ", " },
              { type: "text-delta", textDelta: "world!" },
              {
                type: "finish",
                finishReason: "stop",
                logprobs: undefined,
                usage: { completionTokens: 10, promptTokens: 3 },
              },
            ],
          }),
          rawCall: { rawPrompt: null, rawSettings: {} },
        }),
      });
    });

    it("should include fullStream", async () => {
      const result = await provider.streamText({
        messages: [{ role: "user", content: "Hello!" }],
        model: mockModel,
      });

      expect(result.fullStream).toBeDefined();
      expect(await convertAsyncIterableToArray(result.fullStream)).toEqual([
        { type: "text-delta", textDelta: "Hello" },
        { type: "text-delta", textDelta: ", " },
        { type: "text-delta", textDelta: "world!" },
        {
          type: "finish",
          finishReason: "stop",
          logprobs: undefined,
          usage: { completionTokens: 10, promptTokens: 3, totalTokens: 13 },
        },
      ]);
    });

    it("should handle onStepFinish callback with text response", async () => {
      const onStepFinish = vi.fn();

      await provider.streamText({
        messages: [{ role: "user", content: "Hello!" }],
        model: mockModel,
        onStepFinish,
      });

      expect(onStepFinish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "text",
          content: "Hello, world!",
          role: "assistant",
        }),
      );
    });

    it("should handle onChunk callback", async () => {
      const onChunk = vi.fn();

      await provider.streamText({
        messages: [{ role: "user", content: "Hello!" }],
        model: mockModel,
        onChunk,
      });

      expect(onChunk).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "text",
          content: "Hello",
          role: "assistant",
        }),
      );
    });

    it("should handle onFinish callback", async () => {
      const onFinish = vi.fn();

      await provider.streamText({
        messages: [{ role: "user", content: "Hello!" }],
        model: mockModel,
        onFinish,
      });

      expect(onFinish).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "Hello, world!",
          usage: expect.objectContaining({
            completionTokens: 10,
            promptTokens: 3,
            totalTokens: 13,
          }),
          finishReason: "stop",
        }),
      );
    });

    it("should handle onError callback", async () => {
      const errorModel = new MockLanguageModelV1({
        doStream: async () => {
          throw new Error("Test error");
        },
      });

      const onError = vi.fn();

      try {
        await provider.streamText({
          messages: [{ role: "user", content: "Hello!" }],
          model: errorModel,
          onError,
        });
      } catch (_error) {
        // Expected to throw
      }

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Test error"),
          stage: "llm_stream",
        }),
      );
    });

    it("should handle tools in streamText", async () => {
      const toolModel = new MockLanguageModelV1({
        // @ts-expect-error - This is a mock model
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: "text-delta", textDelta: "I'll help you with that." },
              {
                type: "tool-call",
                toolCallId: "call_123",
                toolName: "get_weather",
                toolCallType: "function",
                args: JSON.stringify({ location: "New York" }),
              },
              {
                type: "tool-result",
                toolCallId: "call_123",
                toolName: "get_weather",
                result: { temperature: 72, condition: "sunny" },
              },
              {
                type: "finish",
                finishReason: "stop",
                usage: { completionTokens: 15, promptTokens: 5 },
              },
            ],
          }),
          rawCall: { rawPrompt: null, rawSettings: {} },
        }),
      });

      const tools = [
        {
          id: "get_weather",
          name: "get_weather",
          description: "Get weather information",
          parameters: z.object({ location: z.string() }),
          execute: vi.fn(),
        },
      ];

      const onStepFinish = vi.fn();

      await provider.streamText({
        messages: [{ role: "user", content: "What's the weather?" }],
        model: toolModel,
        tools,
        onStepFinish,
      });

      expect(onStepFinish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "text",
          content: "I'll help you with that.",
        }),
      );

      expect(onStepFinish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "tool_call",
          name: "get_weather",
          arguments: { location: "New York" },
        }),
      );

      expect(onStepFinish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "tool_result",
          name: "get_weather",
          result: { temperature: 72, condition: "sunny" },
        }),
      );
    });
  });

  describe("generateText", () => {
    it("should handle tools in generateText", async () => {
      const mockModel = new MockLanguageModelV1({
        doGenerate: async () => ({
          text: "I'll help you with that.",
          toolCalls: [
            {
              toolCallType: "function",
              toolCallId: "call_123",
              toolName: "get_weather",
              args: JSON.stringify({ location: "New York" }),
            },
          ],
          finishReason: "stop",
          usage: { completionTokens: 15, promptTokens: 5 },
          rawCall: { rawPrompt: null, rawSettings: {} },
        }),
      });

      const tools = [
        {
          id: "get_weather",
          name: "get_weather",
          description: "Get weather information",
          parameters: z.object({ location: z.string() }),
          execute: vi.fn(() => Promise.resolve({ temperature: 72, condition: "sunny" })),
        },
      ];

      const onStepFinish = vi.fn();

      const result = await provider.generateText({
        messages: [{ role: "user", content: "What's the weather?" }],
        model: mockModel,
        tools,
        onStepFinish,
      });

      expect(result.toolCalls).toEqual([
        {
          toolCallId: "call_123",
          toolName: "get_weather",
          args: { location: "New York" },
          type: "tool-call",
        },
      ]);

      expect(result.toolResults).toEqual([
        {
          toolCallId: "call_123",
          toolName: "get_weather",
          args: { location: "New York" },
          result: { temperature: 72, condition: "sunny" },
          type: "tool-result",
        },
      ]);

      expect(onStepFinish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "text",
          content: "I'll help you with that.",
        }),
      );

      expect(onStepFinish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "tool_call",
          name: "get_weather",
          arguments: { location: "New York" },
        }),
      );

      expect(onStepFinish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "tool_result",
          name: "get_weather",
          result: { temperature: 72, condition: "sunny" },
        }),
      );
    });
  });

  describe.skip("generateObject", () => {
    it("should format object response with JSON format in onStepFinish", async () => {
      const mockModel = new MockLanguageModelV1({
        modelId: "mock-model",
        defaultObjectGenerationMode: "json",
        doGenerate: async () => ({
          text: JSON.stringify({ name: "John", age: 30 }),
          finishReason: "stop",
          usage: { completionTokens: 10, promptTokens: 3 },
          rawCall: { rawPrompt: null, rawSettings: {} },
        }),
      });

      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const onStepFinish = vi.fn();

      await provider.generateObject({
        messages: [{ role: "user", content: "Create a person object" }],
        model: mockModel,
        schema,
        onStepFinish,
      });

      expect(onStepFinish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "text",
          content: '{"name":"John","age":30}',
          role: "assistant",
        }),
      );
    });

    it("should handle string object in onStepFinish", async () => {
      const mockModel = new MockLanguageModelV1({
        modelId: "mock-model",
        defaultObjectGenerationMode: "json",
        doGenerate: async () => ({
          object: "Hello, world!",
          finishReason: "stop",
          usage: { completionTokens: 10, promptTokens: 3 },
          rawCall: { rawPrompt: null, rawSettings: {} },
        }),
      });

      const schema = z.string();

      const onStepFinish = vi.fn();

      await provider.generateObject({
        messages: [{ role: "user", content: "Generate a greeting" }],
        model: mockModel,
        schema,
        onStepFinish,
      });

      expect(onStepFinish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "text",
          content: "Hello, world!",
          role: "assistant",
        }),
      );
    });

    it("should handle error in generateObject", async () => {
      const errorModel = new MockLanguageModelV1({
        modelId: "mock-model",
        defaultObjectGenerationMode: "json",
        doGenerate: async () => {
          throw new Error("Object generation error");
        },
      });

      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      await expect(
        provider.generateObject({
          messages: [{ role: "user", content: "Create a person object" }],
          model: errorModel,
          schema,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining("Object generation error"),
          stage: "object_generate",
        }),
      );
    });
  });

  describe.skip("streamObject", () => {
    it("should format streamed object with JSON format in onStepFinish", async () => {
      const mockModel = new MockLanguageModelV1({
        modelId: "mock-model",
        defaultObjectGenerationMode: "json",
        // @ts-expect-error - This is a mock model
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: "object-delta", objectDelta: {} },
              { type: "object-delta", objectDelta: { name: "John" } },
              { type: "object-delta", objectDelta: { name: "John", age: 30 } },
            ],
          }),
          rawCall: { rawPrompt: null, rawSettings: {} },
        }),
      });

      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const onStepFinish = vi.fn();

      await provider.streamObject({
        messages: [{ role: "user", content: "Create a person object" }],
        model: mockModel,
        schema,
        onStepFinish,
      });

      // The onStepFinish should be called with the final JSON string
      expect(onStepFinish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "text",
          content: '{"name":"John","age":30}',
          role: "assistant",
        }),
      );
    });

    it("should handle onFinish callback in streamObject", async () => {
      const mockModel = new MockLanguageModelV1({
        modelId: "mock-model",
        defaultObjectGenerationMode: "json",
        // @ts-expect-error - This is a mock model
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [{ type: "object-delta", objectDelta: { name: "John", age: 30 } }],
          }),
          rawCall: { rawPrompt: null, rawSettings: {} },
        }),
      });

      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const onFinish = vi.fn();

      await provider.streamObject({
        messages: [{ role: "user", content: "Create a person object" }],
        model: mockModel,
        schema,
        onFinish,
      });

      expect(onFinish).toHaveBeenCalledWith(
        expect.objectContaining({
          object: { name: "John", age: 30 },
          providerResponse: expect.any(Object),
        }),
      );
    });

    it("should handle error in streamObject", async () => {
      const errorModel = new MockLanguageModelV1({
        modelId: "mock-model",
        defaultObjectGenerationMode: "json",
        doStream: async () => {
          throw new Error("Object stream error");
        },
      });

      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const onError = vi.fn();

      try {
        await provider.streamObject({
          messages: [{ role: "user", content: "Create a person object" }],
          model: errorModel,
          schema,
          onError,
        });
      } catch (_error) {
        // Expected to throw
      }

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Object stream error"),
          stage: "object_stream",
        }),
      );
    });

    it("should handle undefined object in onFinish", async () => {
      const mockModel = new MockLanguageModelV1({
        modelId: "mock-model",
        defaultObjectGenerationMode: "json",
        // @ts-expect-error - This is a mock model
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [{ type: "object-delta", objectDelta: undefined }],
          }),
          rawCall: { rawPrompt: null, rawSettings: {} },
        }),
      });

      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const onFinish = vi.fn();
      const onStepFinish = vi.fn();

      await provider.streamObject({
        messages: [{ role: "user", content: "Create a person object" }],
        model: mockModel,
        schema,
        onFinish,
        onStepFinish,
      });

      expect(onStepFinish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "text",
          content: "",
          role: "assistant",
        }),
      );
    });
  });

  describe("toMessage", () => {
    it("should convert BaseMessage to CoreMessage", () => {
      const baseMessage = {
        role: "user" as const,
        content: "Hello, world!",
      };

      const result = provider.toMessage(baseMessage);
      expectTypeOf(result).toMatchTypeOf<CoreMessage>();
    });
  });

  describe.todo("error handling", () => {
    it("should handle tool execution errors", async () => {
      const toolError = new Error("Tool execution failed");
      (toolError as DangerouslyAllowAny).toolCallId = "call_123";
      (toolError as DangerouslyAllowAny).toolName = "test_tool";
      (toolError as DangerouslyAllowAny).args = { param: "value" };
      (toolError as DangerouslyAllowAny).code = "TOOL_ERROR";

      const mockModel = new MockLanguageModelV1({
        doGenerate: async () => {
          throw toolError;
        },
      });

      await expect(
        provider.generateText({
          messages: [{ role: "user", content: "Test" }],
          model: mockModel,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining("Tool execution failed"),
          stage: "llm_generate",
          toolError: expect.objectContaining({
            toolCallId: "call_123",
            toolName: "test_tool",
            toolArguments: { param: "value" },
          }),
          code: "TOOL_ERROR",
        }),
      );
    });

    it("should handle unknown errors", async () => {
      const mockModel = new MockLanguageModelV1({
        doGenerate: async () => {
          throw "Unknown error";
        },
      });

      await expect(
        provider.generateText({
          messages: [{ role: "user", content: "Test" }],
          model: mockModel,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining("Unknown error"),
          stage: "llm_generate",
        }),
      );
    });
  });
});
