import type { ProviderOptions, ToolNeedsApprovalFunction } from "@ai-sdk/provider-utils";
import type { Tool as VercelTool } from "ai";
import type { z } from "zod";
import type { BaseTool, ToolExecuteOptions, ToolSchema } from "../agent/providers/base/types";
import { LoggerProxy } from "../logger";

/**
 * JSON value types (matches AI SDK's JSONValue)
 */
type JSONValue = string | number | boolean | null | { [key: string]: JSONValue } | Array<JSONValue>;

export type ToolExecutionResult<T> = PromiseLike<T> | AsyncIterable<T> | T;

export interface ToolHookOnStartArgs {
  tool: Tool<any, any>;
  args: unknown;
  options?: ToolExecuteOptions;
}

export interface ToolHookOnEndArgs {
  tool: Tool<any, any>;
  args: unknown;
  /** The successful output from the tool. Undefined on error. */
  output: unknown | undefined;
  /** The error if the tool execution failed. */
  error: unknown | undefined;
  options?: ToolExecuteOptions;
}

export interface ToolHookOnEndResult {
  output?: unknown;
}

export type ToolHookOnStart = (args: ToolHookOnStartArgs) => Promise<void> | void;
export type ToolHookOnEnd = (
  args: ToolHookOnEndArgs,
) => Promise<ToolHookOnEndResult | undefined> | Promise<void> | ToolHookOnEndResult | undefined;

export type ToolHooks = {
  onStart?: ToolHookOnStart;
  onEnd?: ToolHookOnEnd;
};

/**
 * Tool result output format for multi-modal content.
 * Matches AI SDK's LanguageModelV2ToolResultOutput type.
 */
export type ToolResultOutput =
  | { type: "text"; value: string }
  | { type: "json"; value: JSONValue }
  | { type: "error-text"; value: string }
  | { type: "error-json"; value: JSONValue }
  | {
      type: "content";
      value: Array<
        { type: "text"; text: string } | { type: "media"; data: string; mediaType: string }
      >;
    };

export type { Tool as VercelTool } from "ai";
export type { ProviderOptions } from "@ai-sdk/provider-utils";
export {
  createNamedAiSdkTool,
  defineTool,
  enhanceTool,
  getRawAiSdkTool,
  getVoltAgentToolMetadata,
  isNamedAiSdkTool,
  withVoltAgentMetadata,
} from "./ai-sdk-tool";
export type { NamedAiSdkTool, VoltAgentToolDefinition, VoltAgentToolMetadata } from "./ai-sdk-tool";

// Export ToolManager and related types
export { ToolManager, ToolStatus, ToolStatusInfo } from "./manager";
// Export Toolkit type and createToolkit function
export { type Toolkit, createToolkit } from "./toolkit";
// Export tool routing helpers
export { createEmbeddingToolSearchStrategy } from "./routing";
export type {
  ToolSearchCandidate,
  ToolSearchContext,
  ToolSearchResult,
  ToolSearchResultItem,
  ToolSearchSelection,
  ToolSearchStrategy,
  ToolRoutingConfig,
  ToolRoutingEmbeddingConfig,
  ToolRoutingEmbeddingInput,
} from "./routing/types";

/**
 * Tool definition compatible with Vercel AI SDK
 */
export type AgentTool = BaseTool;

/**
 * Block access to user-defined and dynamic tools by requiring provider-defined type
 * */
export type ProviderTool = VercelTool & {
  type: "provider";
  id: `${string}.${string}`;
  args: Record<string, unknown>;
  supportsDeferredResults?: boolean;
  name: string;
};

/**
 * Tool options for creating a new tool
 */
export type ToolOptions<
  T extends ToolSchema = ToolSchema,
  O extends ToolSchema | undefined = undefined,
> = {
  /**
   * Unique identifier for the tool
   */
  id?: string;

  /**
   * Name of the tool
   */
  name: string;

  /**
   * Description of the tool
   */
  description: string;

  /**
   * Tool parameter schema
   */
  parameters: T;

  /**
   * Tool output schema (optional)
   */
  outputSchema?: O;

  /**
   * Optional user-defined tags for organizing or labeling tools.
   */
  tags?: string[];

  /**
   * Whether the tool requires approval before execution.
   * When set to a function, it can decide dynamically per call.
   */
  needsApproval?: boolean | ToolNeedsApprovalFunction<z.infer<T>, any>;

  /**
   * Provider-specific options for the tool.
   * Enables provider-specific functionality like cache control.
   *
   * @example
   * ```typescript
   * // Anthropic cache control
   * providerOptions: {
   *   anthropic: {
   *     cacheControl: { type: 'ephemeral' }
   *   }
   * }
   * ```
   */
  providerOptions?: ProviderOptions;

  /**
   * Optional function to convert tool output to multi-modal content.
   * Enables returning images, media, or structured content to the LLM.
   *
   * Supported by: Anthropic, OpenAI
   *
   * @example
   * ```typescript
   * // Return image + text
   * toModelOutput: ({ output }) => ({
   *   type: 'content',
   *   value: [
   *     { type: 'text', text: 'Screenshot taken' },
   *     { type: 'media', data: output.base64Image, mediaType: 'image/png' }
   *   ]
   * })
   * ```
   */
  toModelOutput?: (args: {
    toolCallId: string;
    input: z.infer<T>;
    output: O extends ToolSchema ? z.infer<O> : unknown;
  }) => ToolResultOutput | PromiseLike<ToolResultOutput>;

  /**
   * Function to execute when the tool is called.
   * @param args - The arguments passed to the tool
   * @param options - Optional execution options including context, abort signals, etc.
   * @returns A result or an AsyncIterable of results (last value is final).
   */
  execute?: (
    args: z.infer<T>,
    options?: ToolExecuteOptions,
  ) => ToolExecutionResult<O extends ToolSchema ? z.infer<O> : unknown>;

  /**
   * Optional tool-specific hooks for lifecycle events.
   */
  hooks?: ToolHooks;
};

/** Structural representation for tools using the legacy parameters-style contract. */
export type Tool<
  T extends ToolSchema = ToolSchema,
  O extends ToolSchema | undefined = undefined,
> = Readonly<ToolOptions<T, O>> & {
  readonly id: string;
  readonly type: "user-defined";
  readonly isClientSide: () => boolean;
};

/**
 * Legacy helper for creating a parameters-style VoltAgent tool.
 *
 * @deprecated Use `defineTool()` with AI SDK-style `inputSchema` and VoltAgent
 * metadata under the `voltagent` namespace.
 */
export function createTool<T extends ToolSchema>(
  options: ToolOptions<T, undefined>,
): Tool<T, undefined>;
export function createTool<T extends ToolSchema, O extends ToolSchema>(
  options: ToolOptions<T, O>,
): Tool<T, O>;
export function createTool<T extends ToolSchema, O extends ToolSchema | undefined = undefined>(
  options: ToolOptions<T, O>,
): Tool<T, O> {
  if (!options.name) {
    throw new Error("Tool name is required");
  }
  if (!options.description) {
    const logger = new LoggerProxy({ component: "tool" });
    logger.warn(`Tool '${options.name}' created without a description`);
  }
  if (!options.parameters) {
    throw new Error(`Tool '${options.name}' parameters schema is required`);
  }

  const definedTool: Tool<T, O> = {
    id: options.id ?? options.name,
    name: options.name,
    description: options.description || "",
    parameters: options.parameters,
    outputSchema: options.outputSchema,
    tags: options.tags,
    needsApproval: options.needsApproval,
    providerOptions: options.providerOptions,
    toModelOutput: options.toModelOutput,
    execute: options.execute,
    hooks: options.hooks,
    type: "user-defined",
    isClientSide: () => typeof definedTool.execute !== "function",
  };
  return definedTool;
}
