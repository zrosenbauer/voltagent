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
  StreamObjectFinishResult,
  StreamObjectOptions,
  StreamTextOptions,
  UsageInfo,
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
import { convertToolsForSDK, createVoltagentErrorFromSdkError } from "./utils";

export class VercelAIProvider implements LLMProvider<LanguageModelV1> {
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

  /**
   * Gets the model identifier for the Vercel SDK
   * @param model - The model to get the identifier for
   * @returns The model identifier
   */
  public getModelIdentifier(model: LanguageModelV1): string {
    return model.modelId;
  }

  /**
   * Converts a BaseMessage to a CoreMessage for the Vercel SDK
   * @param message - The BaseMessage to convert
   * @returns The CoreMessage for the Vercel SDK
   */
  public toMessage(message: BaseMessage): CoreMessage {
    return message as CoreMessage;
  }

  /**
   * Creates a step from a chunk of the Vercel SDK
   * @param chunk - The chunk to create a step from
   * @returns The step
   */
  public createStepFromChunk(chunk: {
    type: string;
    [key: string]: any;
  }): StepWithContent | null {
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
            toolName: chunk.toolName,
            result: chunk.result,
          },
        ]),
        role: "assistant" as MessageRole,
        usage: chunk.usage || undefined,
      };
    }

    return null;
  }

  /**
   * Generates a text response using the Vercel SDK
   * @param options - The options for the text generation
   * @returns The text response
   */
  public async generateText(
    options: GenerateTextOptions<LanguageModelV1>,
  ): Promise<ProviderTextResponse<GenerateTextResult<Record<string, any>, never>>> {
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

    try {
      const result = await generateText({
        ...options.provider,
        messages: vercelMessages,
        model: options.model,
        tools: vercelTools,
        maxSteps: options.maxSteps,
        abortSignal: options.signal,
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
    } catch (sdkError) {
      // Create VoltAgentError using the helper
      const voltagentErr = createVoltagentErrorFromSdkError(sdkError, "llm_generate"); // Use appropriate stage
      // Throw the standardized error
      throw voltagentErr;
    }
  }

  /**
   * Streams a text response using the Vercel SDK
   * @param options - The options for the text streaming
   * @returns The text stream response
   */
  public async streamText(
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
      ...options.provider,
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
      onFinish: options.onFinish
        ? async (
            result: Omit<StepResult<Record<string, any>>, "stepType" | "isContinued"> & {
              readonly steps: StepResult<Record<string, any>>[];
            },
          ) => {
            options.onFinish?.({
              text: result.text,
              usage: result.usage,
              finishReason: result.finishReason,
              warnings: result.warnings,
              providerResponse: result,
            });
          }
        : undefined,
      onError: (sdkError) => {
        // Create the error using the helper
        const voltagentErr = createVoltagentErrorFromSdkError(sdkError, "llm_stream");
        // Call the agent's onError callback if it exists
        if (options.onError) {
          options.onError(voltagentErr);
        }
      },
    });

    // Return only provider and textStream
    return {
      provider: result,
      textStream: result.textStream as any,
    };
  }

  /**
   * Generates an object response using the Vercel SDK
   * @param options - The options for the object generation
   * @returns The object response
   */
  public async generateObject<TSchema extends z.ZodType>(
    options: GenerateObjectOptions<LanguageModelV1, TSchema>,
  ): Promise<ProviderObjectResponse<GenerateObjectResult<z.infer<TSchema>>, z.infer<TSchema>>> {
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

    try {
      const result = await generateObject({
        ...options.provider,
        messages: vercelMessages,
        model: options.model,
        schema: options.schema,
        abortSignal: options.signal,
      });

      // Call the custom onFinish handler if defined
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
    } catch (sdkError) {
      // Create VoltAgentError using the helper
      const voltagentErr = createVoltagentErrorFromSdkError(sdkError, "object_generate"); // Use appropriate stage
      // Throw the standardized error
      throw voltagentErr;
    }
  }

  /**
   * Streams an object response using the Vercel SDK
   * @param options - The options for the object streaming
   * @returns The object stream response
   */
  public async streamObject<TSchema extends z.ZodType>(
    options: StreamObjectOptions<LanguageModelV1, TSchema>,
  ): Promise<
    ProviderObjectStreamResponse<
      StreamObjectResult<z.infer<TSchema>, unknown, never>,
      z.infer<TSchema>
    >
  > {
    const vercelMessages = options.messages.map(this.toMessage);

    // Define the onFinish handler to be passed to the Vercel SDK
    const sdkOnFinish = async (event: {
      // Type for Vercel SDK event
      object: z.infer<TSchema> | undefined;
      error: unknown | undefined; // Handle potential error in event?
      usage: LanguageModelUsage;
      response: LanguageModelResponseMetadata;
      warnings?: CallWarning[];
      providerMetadata: ProviderMetadata | undefined;
    }) => {
      // --- Handle onStepFinish simulation (if provided by Agent) ---
      // This uses the final object/usage info from the finish event
      if (options.onStepFinish) {
        const jsonResult = event.object ? JSON.stringify(event.object) : "";
        const step = this.createStepFromChunk({
          type: "text", // Simulate as a text step containing the final JSON
          text: jsonResult,
          usage: event.usage, // Use usage from the event
        });
        if (step) await options.onStepFinish(step);
      }
      // --- End handle onStepFinish simulation ---

      // --- Handle onFinish callback (if provided by Agent) ---
      if (options.onFinish && event.object) {
        // Check if Agent wants onFinish and object exists
        let mappedUsage: UsageInfo | undefined = undefined;
        if (event.usage) {
          mappedUsage = {
            promptTokens: event.usage.promptTokens,
            completionTokens: event.usage.completionTokens,
            totalTokens: event.usage.totalTokens,
          };
        }
        // Construct the standardized result object
        const finishResult: StreamObjectFinishResult<z.infer<TSchema>> = {
          object: event.object, // The final object from the event
          usage: mappedUsage, // Mapped usage info
          warnings: event.warnings,
          providerResponse: event, // Include the original SDK event object
          // finishReason is not typically available in Vercel's streamObject finish event
        };
        // Call the agent's onFinish with the standardized result
        await options.onFinish(finishResult);
      }
      // --- End handle onFinish callback ---
    };

    const result = streamObject({
      ...options.provider,
      messages: vercelMessages,
      model: options.model,
      schema: options.schema,
      abortSignal: options.signal,
      // Pass the correctly defined sdkOnFinish handler
      // Only pass it if either onStepFinish or onFinish is provided by the agent
      ...(options.onStepFinish || options.onFinish ? { onFinish: sdkOnFinish } : {}),
      onError: (sdkError) => {
        // Create the error using the helper
        const voltagentErr = createVoltagentErrorFromSdkError(sdkError, "object_stream");
        // Call the agent's onError callback if it exists
        if (options.onError) {
          options.onError(voltagentErr);
        }
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
