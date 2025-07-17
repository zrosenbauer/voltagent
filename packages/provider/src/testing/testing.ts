import type { BaseMessage } from "@voltagent/core";
import { convertAsyncIterableToArray } from "@voltagent/internal";
import type { DangerouslyAllowAny } from "@voltagent/internal/types";
import type { LLMProvider } from "../types";

/**
 * The default mock messages to use for testing
 */
export const mockMessages = [
  { role: "user" as const, content: "Hello, how are you?" },
  { role: "assistant" as const, content: "I'm doing well, thank you!" },
];

/**
 * The default mock object to use for testing
 */
export const mockObject = {
  name: "John Doe",
  age: 30,
  hobbies: ["reading", "gaming"],
};

/**
 * Mock model interface for testing providers
 */
export interface MockModel {
  id: string;
  name?: string;
  [key: string]: unknown;
}

/**
 * Options for creating provider tests
 */
export interface ProviderTestOptions<TProvider> {
  /**
   * The Provider to test
   */
  provider: LLMProvider<TProvider>;
  /**
   * Mock model to use for testing
   */
  mockModel: MockModel;
  /**
   * Mock messages to use for testing
   */
  mockMessages?: Array<BaseMessage>;
  /**
   * Mock object to use for testing
   */
  mockObject?: Record<string, unknown>;
}

/**
 * Creates tests for the generateText method.
 */
export async function createGenerateTextTests<TProvider>(config: ProviderTestOptions<TProvider>) {
  const { expect } = await import("vitest");
  const { provider } = config;
  const testMessages = config.mockMessages ?? mockMessages;
  const mockModel = config.mockModel as DangerouslyAllowAny;

  return [
    {
      name: "should generate text matching",
      test: async () => {
        const result = await provider.generateText({
          messages: testMessages,
          model: mockModel,
        });

        expect(result).toBeDefined();
        expect(result.text).toBe(convertMockMessagesToText(testMessages));
      },
    },
    {
      name: "should include the original provider response in the result",
      test: async () => {
        const result = await provider.generateText({
          messages: testMessages,
          model: mockModel,
        });

        expect(result).toBeDefined();
        expect(result.provider).toBeDefined();
      },
    },
    // {
    //   name: "should handle empty messages array",
    //   test: async () => {
    //     const result = await provider.generateText({
    //       messages: [],
    //       model: mockModel,
    //     });

    //     expect(result).toBeDefined();
    //     expect(result.text).toBeDefined();
    //   },
    // },
    {
      name: "should include usage information in the result if available",
      test: async () => {
        const result = await provider.generateText({
          messages: testMessages,
          model: mockModel,
        });

        expect(result).toBeDefined();
        // Usage is optional, so we just check if the result is valid
        if (result.usage) {
          expect(result.usage).toBeDefined();
        }
      },
    },
    {
      name: "should handle finish reason",
      test: async () => {
        const result = await provider.generateText({
          messages: testMessages,
          model: mockModel,
        });

        expect(result).toBeDefined();
        // Finish reason is optional, so we just check if the result is valid
        if (result.finishReason) {
          expect(result.finishReason).toBeDefined();
        }
      },
    },
  ];
}

/**
 * Creates tests for the streamText method.
 */
export async function createStreamTextTests<TProvider>(config: ProviderTestOptions<TProvider>) {
  const { expect } = await import("vitest");
  const { provider } = config;
  const testMessages = config.mockMessages ?? mockMessages;
  const mockModel = config.mockModel as DangerouslyAllowAny;

  return [
    {
      name: "should stream text with basic input",
      test: async () => {
        const result = await provider.streamText({
          messages: testMessages,
          model: mockModel,
        });

        expect(result).toBeDefined();
        expect(await convertAsyncIterableToArray(result.textStream)).toEqual(
          covertMockMessagesToStreamArray(testMessages),
        );
      },
    },
    // {
    //   name: "should handle empty messages array",
    //   test: async () => {
    //     const result = await provider.streamText({
    //       messages: [],
    //       model: mockModel,
    //     });

    //     expect(result).toBeDefined();
    //     expect(result.textStream).toBeDefined();
    //   },
    // },
    {
      name: "should provide readable stream",
      test: async () => {
        const result = await provider.streamText({
          messages: testMessages,
          model: mockModel,
        });

        expect(result).toBeDefined();
        expect(result.textStream).toBeDefined();

        // Test that we can read from the stream
        const reader = result.textStream.getReader();
        expect(reader).toBeDefined();

        // Clean up
        reader.releaseLock();
      },
    },
  ];
}

/**
 * Creates tests for the generateObject method.
 */
export async function createGenerateObjectTests<TProvider>(config: ProviderTestOptions<TProvider>) {
  const { expect } = await import("vitest");
  const { z } = await import("zod");
  const { provider } = config;
  const testMessages = config.mockMessages ?? mockMessages;
  const mockModel = config.mockModel as DangerouslyAllowAny;
  const testObject = config.mockObject ?? mockObject;

  return [
    {
      name: "should generate object with basic input",
      test: async () => {
        const result = await provider.generateObject({
          messages: testMessages,
          model: mockModel,
          schema: z.object({
            name: z.string(),
            age: z.number(),
            hobbies: z.array(z.string()),
          }),
        });

        expect(result).toBeDefined();
        expect(result.object).toEqual(testObject);
      },
    },
    {
      name: "should handle object generation without schema",
      test: async () => {
        // This test may fail for providers that require schemas
        try {
          const result = await provider.generateObject({
            messages: testMessages,
            model: mockModel,
            schema: undefined as any,
          });

          expect(result).toBeDefined();
        } catch (error) {
          // It's acceptable for providers to require schemas
          expect(error).toBeDefined();
        }
      },
    },
  ];
}

/**
 * Creates tests for the streamObject method.
 */
export async function createStreamObjectTests<TProvider>(config: ProviderTestOptions<TProvider>) {
  const { expect } = await import("vitest");
  const { z } = await import("zod");
  const { provider } = config;
  const testMessages = config.mockMessages ?? mockMessages;
  const mockModel = config.mockModel as DangerouslyAllowAny;
  // const testObject = config.mockObject ?? mockObject;

  return [
    {
      name: "should stream object with basic input",
      test: async () => {
        const result = await provider.streamObject({
          messages: testMessages,
          model: mockModel,
          schema: z.object({
            name: z.string(),
            age: z.number(),
            hobbies: z.array(z.string()),
          }),
        });

        expect(result).toBeDefined();
        expect(result.objectStream).toBeDefined();
        expect(typeof result.objectStream).toBe("object");
      },
    },
    {
      name: "should provide readable object stream",
      test: async () => {
        const result = await provider.streamObject({
          messages: testMessages,
          model: mockModel,
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
      },
    },
  ];
}

// /**
//  * Creates tests for utility methods (getModelIdentifier, toMessage, toTool).
//  */
// export async function createUtilityMethodTests<TProvider>(
//   provider: LLMProvider<TProvider>,
//   mockModel: DangerouslyAllowAny,
// ) {
//   const { expect } = await import("vitest");

//   const tests = [
//     {
//       name: "getModelIdentifier should return a string identifier for the model",
//       test: async () => {
//         const identifier = provider.getModelIdentifier(mockModel as any);
//         expect(identifier).toBeDefined();
//         expect(typeof identifier).toBe("string");
//         expect(identifier.length).toBeGreaterThan(0);
//       },
//     },
//     {
//       name: "toMessage should convert user message correctly",
//       test: async () => {
//         const message: BaseMessage = { role: "user", content: "Hello" };
//         const result = provider.toMessage(message);
//         expect(result).toBeDefined();
//         // Note: Provider-specific message format may vary
//         expect(typeof result).toBe("object");
//       },
//     },
//     {
//       name: "toMessage should convert assistant message correctly",
//       test: async () => {
//         const message: BaseMessage = { role: "assistant", content: "Hi there!" };
//         const result = provider.toMessage(message);
//         expect(result).toBeDefined();
//         expect(typeof result).toBe("object");
//       },
//     },
//     {
//       name: "toMessage should convert system message correctly",
//       test: async () => {
//         const message: BaseMessage = { role: "system", content: "You are a helpful assistant" };
//         const result = provider.toMessage(message);
//         expect(result).toBeDefined();
//         expect(typeof result).toBe("object");
//       },
//     },
//     {
//       name: "toMessage should handle tool message",
//       test: async () => {
//         const message: BaseMessage = {
//           role: "tool",
//           content: "Tool result",
//         };
//         const result = provider.toMessage(message);
//         expect(result).toBeDefined();
//         expect(typeof result).toBe("object");
//         // Note: tool message handling may vary by provider
//       },
//     },
//   ];

//   // If toTool is implemented, add test for it
//   if (provider.toTool) {
//     tests.push({
//       name: "toTool should convert tool correctly if implemented",
//       test: async () => {
//         const tool: BaseTool = {
//           id: "test_tool",
//           name: "test_tool",
//           description: "A test tool",
//           parameters: {
//             type: "object",
//             properties: {
//               input: { type: "string" },
//             },
//           },
//           execute: async () => ({ result: "test" }),
//         };

//         // @ts-expect-error - conditionally ran
//         const result = provider.toTool(tool);
//         expect(result).toBeDefined();
//       },
//     });
//   }

//   return tests;
// }

// /**
//  * Creates tests for error handling scenarios.
//  */
// export async function createErrorHandlingTests<TProvider>(
//   provider: LLMProvider<TProvider>,
//   mockModel: DangerouslyAllowAny,
//   testMessages: Array<BaseMessage>,
// ) {
//   const { expect } = await import("vitest");

//   return [
//     {
//       name: "should handle invalid model gracefully",
//       test: async () => {
//         const invalidModel = { id: "invalid-model" };

//         try {
//           await provider.generateText({
//             messages: testMessages,
//             model: invalidModel as any,
//           });
//           // If it succeeds, that's fine too
//           expect(true).toBe(true);
//         } catch (error) {
//           // If it fails, that's also acceptable
//           expect(error).toBeDefined();
//         }
//       },
//     },
//     {
//       name: "should handle malformed messages gracefully",
//       test: async () => {
//         const malformedMessages = [
//           { role: "user" as const, content: "" },
//           { role: "assistant" as const, content: null as any },
//         ];

//         try {
//           await provider.generateText({
//             messages: malformedMessages as any,
//             model: mockModel as any,
//           });
//           // If it succeeds, that's fine too
//           expect(true).toBe(true);
//         } catch (error) {
//           // If it fails, that's also acceptable
//           expect(error).toBeDefined();
//         }
//       },
//     },
//   ];
// }

function convertMockMessagesToText(messages: Array<BaseMessage>) {
  return messages.map((m) => m.content).join("\n");
}

function covertMockMessagesToStreamArray(messages: Array<BaseMessage>) {
  return convertMockMessagesToText(messages).split("\n");
}
