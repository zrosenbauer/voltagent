import type { BaseMessage } from "@voltagent/core";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { LLMProvider, LLMProviderConfig } from "../types";
import { createProvider } from "./provider";

// Mock devLogger
vi.mock("@voltagent/internal/dev", () => ({
  devLogger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import the mocked devLogger
import { devLogger } from "@voltagent/internal/dev";

// Mock provider implementation for testing
const createMockProvider = (overrides: Partial<LLMProviderConfig<any>> = {}) => ({
  generateText: vi.fn().mockResolvedValue({
    text: "Hello, world!",
    provider: "test",
  }),
  streamText: vi.fn().mockResolvedValue({
    text: "Hello, world!",
    provider: "test",
  }),
  generateObject: vi.fn().mockResolvedValue({
    object: { text: "Hello, world!" },
    provider: "test",
  }),
  streamObject: vi.fn().mockResolvedValue({
    object: { text: "Hello, world!" },
    provider: "test",
  }),
  toMessage: vi.fn().mockImplementation((message) => message),
  toTool: vi.fn().mockImplementation((tool) => tool),
  getModelIdentifier: vi.fn().mockImplementation((model) => model.id),
  ...overrides,
});

describe("createProvider", () => {
  it("should create a provider with all required methods", () => {
    const config = createMockProvider();
    const provider = createProvider(config);

    expect(provider).toBeDefined();
    expect(provider.generateText).toBe(config.generateText);
    expect(provider.streamText).toBe(config.streamText);
    expect(provider.generateObject).toBe(config.generateObject);
    expect(provider.streamObject).toBe(config.streamObject);
    expect(provider.toMessage).toBe(config.toMessage);
    expect(provider.toTool).toBe(config.toTool);
    expect(provider.getModelIdentifier).toBe(config.getModelIdentifier);
  });

  it("should return the correct type", () => {
    const config = createMockProvider();
    const provider = createProvider(config);

    expectTypeOf(provider).toMatchObjectType<LLMProvider<any>>();
  });

  it("should throw error when generateText is missing", () => {
    const { generateText, ...configWithoutGenerateText } = createMockProvider();

    expect(() => createProvider(configWithoutGenerateText as any)).toThrow(
      "generateText is required",
    );
  });

  it("should throw error when streamText is missing", () => {
    const { streamText, ...configWithoutStreamText } = createMockProvider();

    expect(() => createProvider(configWithoutStreamText as any)).toThrow("streamText is required");
  });

  it("should throw error when generateObject is missing", () => {
    const { generateObject, ...configWithoutGenerateObject } = createMockProvider();

    expect(() => createProvider(configWithoutGenerateObject as any)).toThrow(
      "generateObject is required",
    );
  });

  it("should throw error when streamObject is missing", () => {
    const { streamObject, ...configWithoutStreamObject } = createMockProvider();

    expect(() => createProvider(configWithoutStreamObject as any)).toThrow(
      "streamObject is required",
    );
  });

  it("should throw error when toMessage is missing", () => {
    const { toMessage, ...configWithoutToMessage } = createMockProvider();

    expect(() => createProvider(configWithoutToMessage as any)).toThrow("toMessage is required");
  });

  it("should throw error when getModelIdentifier is missing", () => {
    const { getModelIdentifier, ...configWithoutGetModelIdentifier } = createMockProvider();

    expect(() => createProvider(configWithoutGetModelIdentifier as any)).toThrow(
      "getModelIdentifier is required",
    );
  });

  it("should not throw error when toTool is missing", () => {
    const { toTool, ...configWithoutToTool } = createMockProvider();

    // Should not throw, but should log a warning
    expect(() => createProvider(configWithoutToTool as any)).not.toThrow();

    // Verify warning was logged
    expect(devLogger.warn).toHaveBeenCalledWith(
      "toTool is not implemented, tools will not be converted to provider-specific tools",
    );
  });

  it("should work with provider that throws in streamObject", () => {
    const config = createMockProvider({
      streamObject: vi.fn().mockImplementation(() => {
        throw new Error("Not implemented");
      }),
    });

    const provider = createProvider(config);
    expect(provider).toBeDefined();
    expect(provider.streamObject).toBe(config.streamObject);
  });

  it("should preserve all properties from the config", () => {
    const customConfig = {
      ...createMockProvider(),
      customProperty: "test",
      customMethod: () => "custom",
    };

    const provider = createProvider(customConfig);

    expect((provider as any).customProperty).toBe("test");
    expect((provider as any).customMethod()).toBe("custom");
  });

  it("should handle async functions correctly", async () => {
    const config = createMockProvider({
      generateText: vi.fn().mockResolvedValue({
        text: "Async response",
        provider: "async-test",
      }),
    });

    const provider = createProvider(config);
    const result = await provider.generateText({ messages: [], model: { id: "test" } });

    expect(result.text).toBe("Async response");
    expect(result.provider).toBe("async-test");
  });

  it("should handle sync functions correctly", () => {
    const config = createMockProvider({
      toMessage: vi.fn().mockImplementation((message) => ({
        ...message,
        converted: true,
      })),
    });

    const provider = createProvider(config);
    const message: BaseMessage = { role: "user", content: "test" };
    const result = provider.toMessage(message);

    expect((result as any).converted).toBe(true);
    expect((result as BaseMessage).role).toBe("user");
  });
});
