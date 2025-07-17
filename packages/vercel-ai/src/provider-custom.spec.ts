import { convertArrayToReadableStream, convertAsyncIterableToArray } from "@voltagent/internal";
import type { DangerouslyAllowAny } from "@voltagent/internal/types";
import type { CoreMessage } from "ai";
import { MockLanguageModelV1 } from "ai/test";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import { VercelAIProvider } from "./provider";
import { createMockModel } from "./testing";

describe("custom", () => {
  let provider: VercelAIProvider;

  beforeEach(() => {
    provider = new VercelAIProvider();
  });

  describe("streamText", () => {
    let mockModel: MockLanguageModelV1;

    beforeEach(() => {
      mockModel = new MockLanguageModelV1({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            { type: "text-delta", textDelta: "Hello" },
            { type: "text-delta", textDelta: ", " },
            { type: "text-delta", textDelta: "world!" },
            {
              type: "finish",
              finishReason: "stop",
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
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

    it("should handle tools in streamText", async () => {
      const toolModel = new MockLanguageModelV1({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            { type: "text-delta", textDelta: "I'll help you with that." },
            {
              type: "tool-call",
              toolCallId: "call_123",
              toolName: "get_weather",
              toolCallType: "function",
              args: JSON.stringify({ location: "New York" }),
            },
            {
              type: "finish",
              finishReason: "stop",
              usage: { completionTokens: 15, promptTokens: 5 },
            },
          ]),
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

      const result = await provider.streamText({
        messages: [{ role: "user", content: "What's the weather?" }],
        model: toolModel,
        tools,
        onStepFinish,
      });
      await convertAsyncIterableToArray(result.textStream);

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

    it("should handle a fatal error", async () => {
      const p = new VercelAIProvider();
      p.toMessage = () => {
        throw new Error("Fatal error");
      };
      const mockModel = new MockLanguageModelV1({
        doStream: async () => {
          throw new Error("Fatal error");
        },
      });

      try {
        await p.streamText({
          messages: [{ role: "user", content: "What's the weather?" }],
          model: mockModel,
        });
      } catch (error) {
        expect(error).toEqual(
          expect.objectContaining({
            message: "Fatal error",
            stage: "llm_stream",
          }),
        );
      }
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

  describe("generateObject", () => {
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
  });

  describe("streamObject", () => {
    it("should format streamed object with JSON format in onStepFinish", async () => {
      const mockModel = createMockModel({
        name: "John",
        age: 30,
      });

      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const onStepFinish = vi.fn();

      const result = await provider.streamObject({
        messages: [{ role: "user", content: "Create a person object" }],
        model: mockModel,
        schema,
        onStepFinish,
      });
      await convertAsyncIterableToArray(result.objectStream);

      // The onStepFinish should be called with the final JSON string
      expect(onStepFinish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "text",
          content: '{"name":"John","age":30}',
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
});
