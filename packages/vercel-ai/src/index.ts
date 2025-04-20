import type {
  BaseMessage,
  GenerateObjectOptions,
  GenerateTextOptions,
  LLMProvider,
  MessageRole,
  ProviderObjectResponse,
  ProviderObjectStreamResponse,
  ProviderTextResponse,
  ProviderTextStreamResponse,
  StepWithContent,
  StreamObjectOptions,
  StreamTextOptions,
} from "@voltagent/core";
import type {
  CallWarning,
  CoreMessage,
  FinishReason,
  GenerateObjectResult,
  GenerateTextResult,
  LanguageModelRequestMetadata,
  LanguageModelResponseMetadata,
  LanguageModelUsage,
  LanguageModelV1,
  ProviderMetadata,
  StepResult,
  StreamObjectResult,
  StreamTextResult,
} from "ai";
import { generateObject, generateText, streamObject, streamText } from "ai";
import type { z } from "zod";
import type { VercelProviderOptions } from "./types";
import { convertToolsForSDK } from "./utils";

export class VercelAIProvider implements LLMProvider<LanguageModelV1> {
  // @ts-ignore
  constructor(private options?: VercelProviderOptions) {
    // Bind methods to preserve 'this' context
    this.generateText = this.generateText.bind(this);
    this.streamText = this.streamText.bind(this);
    this.generateObject = this.generateObject.bind(this);
    this.streamObject = this.streamObject.bind(this);
    this.toMessage = this.toMessage.bind(this);
    this.createStepFromChunk = this.createStepFromChunk.bind(this);
    this.getModelIdentifier = this.getModelIdentifier.bind(this);
  }

  getModelIdentifier = (model: LanguageModelV1): string => {
    return model.modelId;
  };

  toMessage = (message: BaseMessage): CoreMessage => {
    return message as CoreMessage;
  };

  createStepFromChunk = (chunk: {
    type: string;
    [key: string]: any;
  }): StepWithContent | null => {
    if (chunk.type === "text" && chunk.text) {
      return {
        id: "",
        type: "text",
        content: chunk.text,
        role: "assistant" as MessageRole,
        usage: chunk.usage || undefined,
      };
    }

    if (chunk.type === "tool-call" || chunk.type === "tool_call") {
      return {
        id: chunk.toolCallId,
        type: "tool_call",
        name: chunk.toolName,
        arguments: chunk.args,
        content: JSON.stringify([
          {
            type: "tool-call",
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            args: chunk.args,
          },
        ]),
        role: "assistant" as MessageRole,
        usage: chunk.usage || undefined,
      };
    }

    if (chunk.type === "tool-result" || chunk.type === "tool_result") {
      return {
        id: chunk.toolCallId,
        type: "tool_result",
        name: chunk.toolName,
        result: chunk.result,
        content: JSON.stringify([
          {
            type: "tool-result",
            toolCallId: chunk.toolCallId,
            result: chunk.result,
          },
        ]),
        role: "assistant" as MessageRole,
        usage: chunk.usage || undefined,
      };
    }

    return null;
  };

  generateText = async (
    options: GenerateTextOptions<LanguageModelV1>,
  ): Promise<ProviderTextResponse<GenerateTextResult<Record<string, any>, never>>> => {
    const vercelMessages = options.messages.map(this.toMessage);
    const vercelTools = options.tools ? convertToolsForSDK(options.tools) : undefined;

    // Process onStepFinish if provided
    const onStepFinish = options.onStepFinish
      ? async (result: StepResult<Record<string, any>>) => {
          if (options.onStepFinish) {
            // Handle text response
            if (result.text) {
              const step = this.createStepFromChunk({
                type: "text",
                text: result.text,
                usage: result.usage,
              });
              if (step) await options.onStepFinish(step);
            }

            // Handle all tool calls - each as a separate step
            if (result.toolCalls && result.toolCalls.length > 0) {
              for (const toolCall of result.toolCalls) {
                const step = this.createStepFromChunk({
                  type: "tool-call",
                  toolCallId: toolCall.toolCallId,
                  toolName: toolCall.toolName,
                  args: toolCall.args,
                  usage: result.usage,
                });
                if (step) await options.onStepFinish(step);
              }
            }

            // Handle all tool results - each as a separate step
            if (result.toolResults && result.toolResults.length > 0) {
              for (const toolResult of result.toolResults) {
                const step = this.createStepFromChunk({
                  type: "tool-result",
                  toolCallId: toolResult.toolCallId,
                  toolName: toolResult.toolName,
                  result: toolResult.result,
                  usage: result.usage,
                });
                if (step) await options.onStepFinish(step);
              }
            }
          }
        }
      : undefined;

    const result = await generateText({
      messages: vercelMessages,
      model: options.model,
      tools: vercelTools,
      maxSteps: options.maxSteps,
      abortSignal: options.signal,
      ...options.provider,
      onStepFinish,
    });

    // Return standardized response
    return {
      provider: result,
      text: result.text || "",
      usage: result.usage
        ? {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
          }
        : undefined,
      toolCalls: result.toolCalls,
      toolResults: result.toolResults,
      finishReason: result.finishReason,
    };
  };

  async streamText(
    options: StreamTextOptions<LanguageModelV1>,
  ): Promise<ProviderTextStreamResponse<StreamTextResult<Record<string, any>, never>>> {
    const vercelMessages = options.messages.map(this.toMessage);
    const vercelTools = options.tools ? convertToolsForSDK(options.tools) : undefined;

    // Process onStepFinish if provided
    const onStepFinish = options.onStepFinish
      ? async (result: StepResult<Record<string, any>>) => {
          if (options.onStepFinish) {
            // Handle text response
            if (result.text) {
              const step = this.createStepFromChunk({
                type: "text",
                text: result.text,
                usage: result.usage,
              });
              if (step) await options.onStepFinish(step);
            }

            // Handle all tool calls - each as a separate step
            if (result.toolCalls && result.toolCalls.length > 0) {
              for (const toolCall of result.toolCalls) {
                const step = this.createStepFromChunk({
                  type: "tool-call",
                  toolCallId: toolCall.toolCallId,
                  toolName: toolCall.toolName,
                  args: toolCall.args,
                  usage: result.usage,
                });
                if (step) await options.onStepFinish(step);
              }
            }

            // Handle all tool results - each as a separate step
            if (result.toolResults && result.toolResults.length > 0) {
              for (const toolResult of result.toolResults) {
                const step = this.createStepFromChunk({
                  type: "tool-result",
                  toolCallId: toolResult.toolCallId,
                  toolName: toolResult.toolName,
                  result: toolResult.result,
                  usage: result.usage,
                });
                if (step) await options.onStepFinish(step);
              }
            }
          }
        }
      : undefined;

    const result = streamText({
      messages: vercelMessages,
      model: options.model,
      tools: vercelTools,
      maxSteps: options.maxSteps,
      abortSignal: options.signal,
      onStepFinish,
      onChunk: async ({ chunk }) => {
        if (options?.onChunk) {
          // Handle the chunk directly without usage tracking
          const step = this.createStepFromChunk(chunk);
          if (step) await options.onChunk(step);
        }
      },
      onFinish: async (result) => {
        if (options.onFinish) await options.onFinish(result);
      },
      onError: (error) => {
        options.onError?.(error.error);
      },
    });

    // Return only provider and textStream
    return {
      provider: result,
      textStream: result.textStream as any,
    };
  }

  generateObject = async <TSchema extends z.ZodType>(
    options: GenerateObjectOptions<LanguageModelV1, TSchema>,
  ): Promise<ProviderObjectResponse<GenerateObjectResult<z.infer<TSchema>>, z.infer<TSchema>>> => {
    const vercelMessages = options.messages.map(this.toMessage);

    // For object generation, we use onFinish as onStepFinish is not supported
    const onFinish = options.onStepFinish
      ? async (result: {
          object: z.infer<TSchema>;
          finishReason: FinishReason;
          usage: LanguageModelUsage;
          warnings: CallWarning[] | undefined;
          request: LanguageModelRequestMetadata;
          response: LanguageModelResponseMetadata;
          logprobs: any | undefined;
          providerMetadata: ProviderMetadata | undefined;
        }) => {
          if (options.onStepFinish) {
            const jsonResult =
              typeof result.object === "string" ? result.object : JSON.stringify(result.object);

            // Create a step with usage information directly passed
            const step = this.createStepFromChunk({
              type: "text",
              text: jsonResult,
              usage: result.usage,
            });

            if (step) await options.onStepFinish(step);
          }
        }
      : undefined;

    const result = await generateObject({
      messages: vercelMessages,
      model: options.model,
      schema: options.schema,
      abortSignal: options.signal,
      ...options.provider,
    });

    await onFinish?.(result);

    // Return standardized response
    return {
      provider: result,
      object: result.object,
      usage: result.usage
        ? {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
          }
        : undefined,
      finishReason: result.finishReason,
    };
  };

  async streamObject<TSchema extends z.ZodType>(
    options: StreamObjectOptions<LanguageModelV1, TSchema>,
  ): Promise<
    ProviderObjectStreamResponse<
      StreamObjectResult<z.infer<TSchema>, unknown, never>,
      z.infer<TSchema>
    >
  > {
    const vercelMessages = options.messages.map(this.toMessage);

    // For object streaming, we use onFinish as onStepFinish is not supported
    const onFinish = options.onStepFinish
      ? async (event: {
          object: z.infer<TSchema> | undefined;
          error: unknown | undefined;
          usage: LanguageModelUsage;
          response: LanguageModelResponseMetadata;
          warnings?: CallWarning[];
          providerMetadata: ProviderMetadata | undefined;
        }) => {
          if (options.onStepFinish) {
            const jsonResult = event.object ? JSON.stringify(event.object) : "";

            // Create a step with usage information directly passed
            const step = this.createStepFromChunk({
              type: "text",
              text: jsonResult,
              usage: event.usage,
            });

            if (step) await options.onStepFinish(step);
          }
          if (options.onFinish && event.object) {
            await options.onFinish({ object: event.object });
          }
        }
      : options.onFinish;

    const result = streamObject({
      messages: vercelMessages,
      model: options.model,
      schema: options.schema,
      abortSignal: options.signal,
      ...options.provider,
      ...(onFinish ? { onFinish } : {}),
      onError: (error) => {
        options.onError?.(error.error);
      },
    });

    // TODO: Add usage to the result - https://sdk.vercel.ai/docs/reference/ai-sdk-core/stream-object

    const partialObjectStream = result.partialObjectStream;
    // Return only provider and objectStream
    return {
      provider: { ...result, partialObjectStream },
      objectStream: partialObjectStream,
    };
  }
}
