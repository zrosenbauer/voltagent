import { isDeepStrictEqual } from "node:util";
import {
  type Context as AISDKContext,
  type AssistantModelMessage,
  type HasRequiredKey,
  type InferToolSetContext,
  type ModelMessage,
  type ProviderOptions,
  type SystemModelMessage,
  type ToolExecutionOptions,
  type ToolModelMessage,
  validateTypes,
} from "@ai-sdk/provider-utils";
import type { Span } from "@opentelemetry/api";
import { SpanKind, SpanStatusCode, context as otelContext } from "@opentelemetry/api";
import type { Logger } from "@voltagent/internal";
import { safeStringify } from "@voltagent/internal/utils";
import type {
  StreamTextResult as AIStreamTextResult,
  Tool as AITool,
  GenerateObjectResult,
  GenerateTextResult,
  LanguageModel,
  PrepareStepFunction,
  StepResult,
  ToolApprovalConfiguration,
  ToolApprovalStatus,
  ToolChoice,
  ToolSet,
  UIMessage,
} from "ai";
import {
  type AsyncIterableStream,
  type FinishReason,
  type Instructions,
  InvalidArgumentError,
  InvalidPromptError,
  type LanguageModelUsage,
  NoOutputGeneratedError,
  Output,
  type Warning,
  consumeStream,
  convertToModelMessages,
  createTextStreamResponse,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  generateText,
  isStepCount,
  pipeTextStreamToResponse,
  pipeUIMessageStreamToResponse,
  streamText,
  validateUIMessages,
} from "ai";
import { z } from "zod";
import { LogEvents, LoggerProxy } from "../logger";
import { ActionType, buildAgentLogMessage } from "../logger/message-builder";
import { Memory } from "../memory";
import type { MemoryUpdateMode } from "../memory";
import { MemoryManager } from "../memory/manager/memory-manager";
import type { ConversationTitleConfig, ConversationTitleGenerator } from "../memory/types";
import { type VoltAgentObservability, createVoltAgentObservability } from "../observability";
import { TRIGGER_CONTEXT_KEY } from "../observability/context-keys";
import { type ObservabilityFlushState, flushObservability } from "../observability/utils";
import { AgentRegistry } from "../registries/agent-registry";
import { ModelProviderRegistry } from "../registries/model-provider-registry";
import type { BaseRetriever } from "../retriever/retriever";
import type {
  NamedAiSdkTool,
  ProviderTool,
  Tool,
  ToolExecutionResult,
  Toolkit,
  VercelTool,
  VoltAgentToolMetadata,
} from "../tool";
import { createTool } from "../tool";
import { getRawAiSdkTool, getVoltAgentToolMetadata, isNamedAiSdkTool } from "../tool";
import { isProviderTool } from "../tool/manager";
import { ToolManager } from "../tool/manager";
import { createEmbeddingToolSearchStrategy } from "../tool/routing";
import {
  TOOL_ROUTING_CALL_TOOL_NAME,
  TOOL_ROUTING_INTERNAL_TOOL_SYMBOL,
  TOOL_ROUTING_SEARCH_TOOL_NAME,
} from "../tool/routing/constants";
import type {
  ToolRoutingConfig,
  ToolSearchCandidate,
  ToolSearchResult,
  ToolSearchResultItem,
  ToolSearchSelection,
  ToolSearchStrategy,
} from "../tool/routing/types";
import { randomUUID } from "../utils/id";
import { convertModelMessagesToUIMessages } from "../utils/message-converter";
import { NodeType, createNodeId } from "../utils/node-utils";
import { zodSchemaToJsonUI } from "../utils/toolParser";
import { convertUsage } from "../utils/usage-converter";
import { normalizeFinishUsageStream, resolveFinishUsage } from "../utils/usage-normalizer";
import type { Voice } from "../voice";
import { VoltOpsClient as VoltOpsClientClass } from "../voltops/client";
import type { VoltOpsClient } from "../voltops/client";
import type { PromptContent, PromptHelper } from "../voltops/types";
import { Workspace } from "../workspace";
import type {
  AgentContext,
  AgentContextInput,
  AgentContextParameter,
  AgentContextSchema,
} from "./context";
import { buildToolErrorResult } from "./error-utils";
import {
  ToolDeniedError,
  createAbortError,
  createBailError,
  createVoltAgentError,
  isBailError,
  isClientHTTPError,
  isMiddlewareAbortError,
  isToolDeniedError,
  isVoltAgentError,
} from "./errors";
import { AgentContextValidationError } from "./errors/context-validation-error";
import {
  type AgentEvalHost,
  type EnqueueEvalScoringArgs,
  enqueueEvalScoring as enqueueEvalScoringHelper,
} from "./eval";
import type { AgentHooks, OnToolEndHookResult, OnToolErrorHookResult } from "./hooks";
import { stripDanglingOpenAIReasoningFromModelMessages } from "./model-message-normalizer";
import {
  createRetryingLanguageModel,
  isRetryingLanguageModel,
  waitForModelRetry,
} from "./model-retry";
import {
  createNativeToolExecutor,
  disposeNativeToolExecution,
  prepareNativeToolExecution,
} from "./native-tool-execution";
import { AgentTraceContext, addModelAttributesToSpan } from "./open-telemetry/trace-context";
import {
  estimatePromptContextUsage,
  promptContextUsageEstimateToAttributes,
} from "./prompt-context-usage";
import type {
  BaseMessage,
  BaseTool,
  StepWithContent,
  ToolExecuteOptions,
  UsageInfo,
} from "./providers/base/types";
import { computeRetryDelayMs } from "./retry-after";
import {
  delegateStreamResult,
  observeTerminalStreamErrors,
  readableFromIterable,
  replayableStream,
} from "./streaming/stream-result";
import { coerceStringifiedJsonToolArgs } from "./tool-input-coercion";
import { extractUserQuery as agentExtractUserQuery } from "./user-query";
export type { AgentHooks } from "./hooks";
export type {
  RuntimeMemoryBehaviorOptions,
  RuntimeMemoryEnvelope,
  SemanticMemoryOptions,
} from "./types";
import { P, match } from "ts-pattern";
import type { PrepareStep, StopWhen } from "../ai-types";
import type { SamplingPolicy } from "../eval/runtime";
import type { ConversationStepRecord } from "../memory/types";
import { applySummarization } from "./apply-summarization";
import {
  AGENT_REF_CONTEXT_KEY,
  AI_SDK_RUNTIME_CONTEXT_KEY,
  AI_SDK_TOOLS_CONTEXT_KEY,
  AI_SDK_TOOLS_KEY,
  EFFECTIVE_MODEL_NAME_CONTEXT_KEY,
  FORCED_TOOL_CHOICE_CONTEXT_KEY,
  SPECULATIVE_INPUT_GUARDRAIL_CONTEXT_KEY,
  TOOL_APPROVAL_CONTEXT_KEY,
  TOOL_ROUTING_CONTEXT_KEY,
  TOOL_ROUTING_SEARCHED_TOOLS_CONTEXT_KEY,
} from "./context-keys";
import { ConversationBuffer } from "./conversation-buffer";
import {
  createFeedbackHandle as createFeedbackHandleHelper,
  findFeedbackMessageId as findFeedbackMessageIdHelper,
  markFeedbackProvided as markFeedbackProvidedHelper,
} from "./feedback";
import {
  type NormalizedInputGuardrail,
  type NormalizedOutputGuardrail,
  runInputGuardrails as executeInputGuardrails,
  runOutputGuardrails as executeOutputGuardrails,
  normalizeInputGuardrailList,
  normalizeOutputGuardrailList,
} from "./guardrail";
import {
  AGENT_METADATA_CONTEXT_KEY,
  type AgentMetadataContextValue,
  MemoryPersistQueue,
} from "./memory-persist-queue";
import { sanitizeMessagesForModel } from "./message-normalizer";
import {
  type NormalizedInputMiddleware,
  type NormalizedOutputMiddleware,
  normalizeInputMiddlewareList,
  normalizeOutputMiddlewareList,
  runInputMiddlewares,
  runOutputMiddlewares,
} from "./middleware";
import {
  type GuardrailPipeline,
  createAsyncIterableReadable,
  createGuardrailPipeline,
} from "./streaming/guardrail-stream";
import {
  SpeculativeInputGuardrailRun,
  applySpeculativeInputGuardrailToFullStream,
  applySpeculativeInputGuardrailToPartialOutputStream,
  applySpeculativeInputGuardrailToTextStream,
  applySpeculativeInputGuardrailToUIStream,
} from "./streaming/input-guardrail-stream";
import { SubAgentManager } from "./subagent";
import type { SubAgentConfig } from "./subagent/types";
import type { VoltAgentTextStreamPart } from "./subagent/types";
import type {
  AgentConversationPersistenceMode,
  AgentConversationPersistenceOptions,
  AgentEvalConfig,
  AgentEvalOperationType,
  AgentFeedbackHandle,
  AgentFeedbackMetadata,
  AgentFeedbackOptions,
  AgentFullState,
  AgentGuardrailState,
  AgentMarkFeedbackProvidedInput,
  AgentMessageMetadataPersistenceConfig,
  AgentMessageMetadataPersistenceOptions,
  AgentModelConfig,
  AgentModelValue,
  AgentOptions,
  AgentSummarizationOptions,
  AgentToolInput,
  AgentToolRoutingState,
  ApiToolInfo,
  CommonResolvedRuntimeMemoryOptions,
  DynamicValue,
  DynamicValueOptions,
  InputGuardrail,
  InputMiddleware,
  InstructionsDynamicValue,
  OperationContext,
  OutputGuardrail,
  OutputMiddleware,
  RuntimeMemoryEnvelope,
  SemanticMemoryOptions,
  SupervisorConfig,
  VoltAgentRuntimeOptions,
} from "./types";

const BUFFER_CONTEXT_KEY = Symbol("conversationBuffer");
const QUEUE_CONTEXT_KEY = Symbol("memoryPersistQueue");
const CONVERSATION_PERSISTENCE_OPTIONS_KEY = Symbol("conversationPersistenceOptions");
const STEP_PERSIST_COUNT_KEY = Symbol("persistedStepCount");
const ABORT_LISTENER_ATTACHED_KEY = Symbol("abortListenerAttached");
const MIDDLEWARE_RETRY_FEEDBACK_KEY = Symbol("middlewareRetryFeedback");
const STREAM_RESPONSE_MESSAGE_ID_KEY = Symbol("streamResponseMessageId");
const STEP_RESPONSE_MESSAGE_FINGERPRINTS_KEY = Symbol("stepResponseMessageFingerprints");
const DEFAULT_FEEDBACK_KEY = "satisfaction";
const DEFAULT_CONVERSATION_TITLE_PROMPT = [
  "You generate concise titles for new conversations.",
  "Summarize the user's first message in a short phrase.",
  "Keep it under 80 characters and return only the title.",
].join("\n");
const DEFAULT_CONVERSATION_TITLE_MAX_OUTPUT_TOKENS = 32;
const DEFAULT_CONVERSATION_TITLE_MAX_CHARS = 80;
const CONVERSATION_TITLE_INPUT_MAX_CHARS = 2000;
const DEFAULT_TOOL_SEARCH_TOP_K = 1;

type ResolvedConversationPersistenceOptions = {
  mode: AgentConversationPersistenceMode;
  debounceMs: number;
  flushOnToolResult: boolean;
};

const DEFAULT_CONVERSATION_PERSISTENCE_OPTIONS: ResolvedConversationPersistenceOptions = {
  mode: "step",
  debounceMs: 200,
  flushOnToolResult: true,
};

type ResolvedMessageMetadataPersistenceOptions = {
  usage: boolean;
  finishReason: boolean;
};

const DEFAULT_MESSAGE_METADATA_PERSISTENCE_OPTIONS: ResolvedMessageMetadataPersistenceOptions = {
  usage: false,
  finishReason: false,
};

type ResponseMessage = AssistantModelMessage | ToolModelMessage;
type ValidationIssue = Parameters<typeof coerceStringifiedJsonToolArgs>[1][number];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) && !Array.isArray(value);

const getValidationIssues = (error: unknown): ValidationIssue[] => {
  if (!isRecord(error)) {
    return [];
  }

  const issues = error.issues ?? error.errors;
  return Array.isArray(issues) ? (issues as ValidationIssue[]) : [];
};

const stringIncludesTemperature = (value: unknown): boolean =>
  typeof value === "string" && value.toLowerCase().includes("temperature");

const isTemperatureWarning = (warning: Warning): boolean => {
  const warningRecord: Record<string, unknown> = warning;
  const warningType = warningRecord.type;

  if (typeof warningType !== "string") {
    return false;
  }

  if (warningType === "unsupported-setting") {
    return stringIncludesTemperature(warningRecord.setting);
  }

  if (warningType === "unsupported" || warningType === "compatibility") {
    return (
      stringIncludesTemperature(warningRecord.feature) ||
      stringIncludesTemperature(warningRecord.details)
    );
  }

  return (
    stringIncludesTemperature(warningRecord.details) ||
    stringIncludesTemperature(warningRecord.message)
  );
};

const hasNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const firstNonBlank = (...values: Array<unknown>): string | undefined => {
  for (const value of values) {
    if (hasNonEmptyString(value)) {
      return value;
    }
  }
  return undefined;
};

const firstDefined = <T>(...values: Array<T | null | undefined>): T | undefined => {
  for (const value of values) {
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return undefined;
};

type OpenRouterUsageCost = {
  cost?: number;
  isByok?: boolean;
  upstreamInferenceCost?: number;
  upstreamInferenceInputCost?: number;
  upstreamInferenceOutputCost?: number;
};

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const toBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return undefined;
};

const extractOpenRouterUsageCost = (providerMetadata: unknown): OpenRouterUsageCost | undefined => {
  if (!isPlainObject(providerMetadata)) {
    return undefined;
  }

  const openRouterMetadata = isPlainObject(providerMetadata.openrouter)
    ? providerMetadata.openrouter
    : undefined;
  const usage =
    openRouterMetadata && isPlainObject(openRouterMetadata.usage)
      ? openRouterMetadata.usage
      : undefined;

  if (!usage) {
    return undefined;
  }

  const costDetails = firstDefined(
    isPlainObject(usage.costDetails) ? usage.costDetails : undefined,
    isPlainObject(usage.cost_details) ? usage.cost_details : undefined,
  );

  const result: OpenRouterUsageCost = {
    cost: toFiniteNumber(usage.cost),
    isByok: firstDefined(toBoolean(usage.isByok), toBoolean(usage.is_byok)),
    upstreamInferenceCost: firstDefined(
      toFiniteNumber(costDetails?.upstreamInferenceCost),
      toFiniteNumber(costDetails?.upstream_inference_cost),
    ),
    upstreamInferenceInputCost: firstDefined(
      toFiniteNumber(costDetails?.upstreamInferenceInputCost),
      toFiniteNumber(costDetails?.upstream_inference_input_cost),
    ),
    upstreamInferenceOutputCost: firstDefined(
      toFiniteNumber(costDetails?.upstreamInferenceOutputCost),
      toFiniteNumber(costDetails?.upstream_inference_output_cost),
    ),
  };

  return Object.values(result).some((value) => value !== undefined) ? result : undefined;
};

type GenerationErrorDetails = {
  usage?: LanguageModelUsage;
  providerMetadata?: unknown;
  finishReason?: string;
};

const toLanguageModelUsage = (value: unknown): LanguageModelUsage | undefined =>
  isPlainObject(value) ? (value as LanguageModelUsage) : undefined;

const extractGenerationErrorDetails = (error: unknown): GenerationErrorDetails => {
  const metadata = isRecord(error) && isPlainObject(error.metadata) ? error.metadata : undefined;
  const originalError = isRecord(error) ? error.originalError : undefined;

  const usage = firstDefined(
    isRecord(error) ? toLanguageModelUsage(error.usage) : undefined,
    metadata ? toLanguageModelUsage(metadata.usage) : undefined,
    isRecord(originalError) ? toLanguageModelUsage(originalError.usage) : undefined,
  );

  const providerMetadata = firstDefined(
    metadata?.providerMetadata,
    isRecord(error) ? error.providerMetadata : undefined,
    isRecord(originalError) ? originalError.providerMetadata : undefined,
  );

  const finishReason = firstNonBlank(
    isRecord(error) ? error.finishReason : undefined,
    metadata?.finishReason,
    isRecord(originalError) ? originalError.finishReason : undefined,
  );

  return { usage, providerMetadata, finishReason };
};

const isAssistantContentPart = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false;
  }

  switch (value.type) {
    case "text":
    case "reasoning":
      return typeof value.text === "string";
    case "tool-call":
    case "tool-result":
      return hasNonEmptyString(value.toolCallId) && hasNonEmptyString(value.toolName);
    case "tool-approval-request":
      return hasNonEmptyString(value.toolCallId) && hasNonEmptyString(value.approvalId);
    case "image":
      return "image" in value && value.image != null;
    case "file":
      return hasNonEmptyString(value.mediaType) && "data" in value && value.data != null;
    default:
      return false;
  }
};

const isToolContentPart = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false;
  }

  switch (value.type) {
    case "tool-result":
      return hasNonEmptyString(value.toolCallId) && hasNonEmptyString(value.toolName);
    case "tool-approval-response":
      return hasNonEmptyString(value.approvalId) && typeof value.approved === "boolean";
    default:
      return false;
  }
};

const isResponseMessage = (value: unknown): value is ResponseMessage => {
  if (!isRecord(value)) {
    return false;
  }

  if (value.role === "assistant") {
    if (typeof value.content === "string") {
      return true;
    }
    if (Array.isArray(value.content)) {
      return value.content.every(isAssistantContentPart);
    }
    return false;
  }

  if (value.role === "tool") {
    return Array.isArray(value.content) && value.content.every(isToolContentPart);
  }

  return false;
};

const filterResponseMessages = (messages: unknown): ModelMessage[] | undefined => {
  if (!Array.isArray(messages)) {
    return undefined;
  }

  const filtered = messages.filter(isResponseMessage);
  return filtered.length > 0 ? filtered : undefined;
};

const resolveWorkspace = (workspace: AgentOptions["workspace"]): Workspace | undefined => {
  if (!workspace) {
    return undefined;
  }

  if (workspace instanceof Workspace) {
    return workspace;
  }

  return new Workspace(workspace);
};

const buildWorkspaceToolkits = (
  workspace: Workspace | undefined,
  options: AgentOptions["workspaceToolkits"],
): Toolkit[] => {
  if (!workspace || options === false) {
    return [];
  }

  const includeDefaults = options === undefined;
  const toolkits: Toolkit[] = [];

  const filesystemOptions = includeDefaults ? {} : options?.filesystem;
  if (includeDefaults || filesystemOptions !== undefined) {
    if (filesystemOptions !== false) {
      toolkits.push(workspace.createFilesystemToolkit(filesystemOptions || {}));
    }
  }

  const sandboxOptions = includeDefaults ? {} : options?.sandbox;
  if (includeDefaults || sandboxOptions !== undefined) {
    if (sandboxOptions !== false) {
      toolkits.push(workspace.createSandboxToolkit(sandboxOptions || {}));
    }
  }

  const searchOptions = includeDefaults ? {} : options?.search;
  if (includeDefaults || searchOptions !== undefined) {
    if (searchOptions !== false) {
      toolkits.push(workspace.createSearchToolkit(searchOptions || {}));
    }
  }

  const skillsOptions = includeDefaults ? {} : options?.skills;
  if (includeDefaults || skillsOptions !== undefined) {
    if (skillsOptions !== false) {
      toolkits.push(workspace.createSkillsToolkit(skillsOptions || {}));
    }
  }

  return toolkits;
};

const composePrepareMessagesHooks = (
  hooks: Array<AgentHooks["onPrepareMessages"] | null | undefined>,
): AgentHooks["onPrepareMessages"] | undefined => {
  const sequence = hooks.filter((hook): hook is NonNullable<AgentHooks["onPrepareMessages"]> =>
    Boolean(hook),
  );
  if (sequence.length === 0) {
    return undefined;
  }

  return async (args) => {
    let currentArgs = args;
    for (const hook of sequence) {
      const result = await hook(currentArgs);
      if (result?.messages) {
        currentArgs = { ...currentArgs, messages: result.messages };
      }
    }
    return { messages: currentArgs.messages };
  };
};

const isWorkspaceSkillsToolkitEnabled = (options: AgentOptions["workspaceToolkits"]): boolean => {
  if (options === false) {
    return false;
  }
  if (options === undefined) {
    return true;
  }
  if (options.skills === undefined) {
    return false;
  }
  return options.skills !== false;
};

type WorkspaceSkillsPromptResolutionOptions = Pick<
  AgentOptions,
  "hooks" | "workspaceSkillsPrompt" | "workspaceToolkits"
>;

const resolveWorkspaceSkillsPromptHook = (
  workspace: Workspace | undefined,
  options: WorkspaceSkillsPromptResolutionOptions,
): AgentHooks["onPrepareMessages"] | undefined => {
  const existingHook = options.hooks?.onPrepareMessages;
  if (!workspace?.skills) {
    return existingHook;
  }

  const promptConfig = options.workspaceSkillsPrompt;
  if (promptConfig === false) {
    return existingHook;
  }

  const hasExplicitPromptConfig = promptConfig !== undefined;
  if (!hasExplicitPromptConfig && !isWorkspaceSkillsToolkitEnabled(options.workspaceToolkits)) {
    return existingHook;
  }

  const promptOptions =
    typeof promptConfig === "object" && promptConfig !== null ? promptConfig : {};

  const skillsPromptHook = workspace.createSkillsPromptHook(promptOptions).onPrepareMessages;
  return composePrepareMessagesHooks([existingHook, skillsPromptHook]);
};

const searchToolsParameters = z.object({
  query: z.string().describe("User request or query to search tools for."),
  topK: z.number().int().positive().optional().describe("Maximum number of tools to return."),
});

const searchToolsOutputSchema = z.object({
  query: z.string(),
  selections: z.array(
    z.object({
      name: z.string(),
      score: z.number().optional(),
      reason: z.string().optional(),
    }),
  ),
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string().nullable(),
      tags: z.array(z.string()).nullable(),
      parametersSchema: z.any().nullable(),
      outputSchema: z.any().nullable(),
      score: z.number().optional(),
      reason: z.string().optional(),
    }),
  ),
});

const callToolParameters = z.object({
  name: z.string().describe("The exact name of the tool to call."),
  args: z
    .record(z.string(), z.any())
    .nullable()
    .optional()
    .default({})
    .describe("Arguments to pass to the tool."),
});

// ============================================================================
// Types
// ============================================================================

export type OutputSpec = Output.Output<unknown, unknown>;

/**
 * Context input type that accepts both Map and plain object
 */
export type ContextInput = Map<string | symbol, unknown> | Record<string | symbol, unknown>;

/**
 * Converts context input to Map
 */
function toContextMap(context?: ContextInput): Map<string | symbol, unknown> | undefined {
  if (!context) return undefined;
  return context instanceof Map ? context : new Map(Object.entries(context));
}

function sanitizeConversationTitle(text: string, maxLength: number): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";

  const unquoted = trimmed.replace(/^["'`]+|["'`]+$/g, "");
  if (!Number.isFinite(maxLength) || maxLength <= 0) {
    return unquoted;
  }

  return unquoted.length > maxLength ? unquoted.slice(0, maxLength).trim() : unquoted;
}

/**
 * Agent context with comprehensive tracking
 */
// AgentContext removed; OperationContext is used directly throughout

// AgentHooks type is defined in './hooks' and uses OperationContext

/**
 * Extended StreamTextResult that includes context
 */
export type StreamTextResultWithContext<
  TOOLS extends ToolSet = Record<string, any>,
  OUTPUT extends OutputSpec = OutputSpec,
  RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  CONTEXT extends Map<string | symbol, unknown> = Map<string | symbol, unknown>,
> = Omit<AIStreamTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>, "stream" | "fullStream"> & {
  readonly stream: AsyncIterableStream<VoltAgentTextStreamPart<TOOLS>>;
  /** @deprecated Use `stream` instead. */
  readonly fullStream: AsyncIterableStream<VoltAgentTextStreamPart<TOOLS>>;
  // Additional context field
  context: CONTEXT;
  // Feedback metadata for the trace, if enabled
  feedback?: AgentFeedbackHandle | null;
};

/**
 * Extended StreamObjectResult that includes context
 */
export interface StreamObjectResultWithContext<
  T,
  CONTEXT extends Map<string | symbol, unknown> = Map<string | symbol, unknown>,
> {
  // Delegate to original streamObject result properties
  readonly object: Promise<T>;
  readonly partialObjectStream: ReadableStream<Partial<T>>;
  readonly textStream: AsyncIterableStream<string>;
  readonly warnings: Promise<Warning[] | undefined>;
  readonly usage: Promise<LanguageModelUsage>;
  readonly finishReason: Promise<FinishReason>;
  // Response conversion methods
  pipeTextStreamToResponse(response: any, init?: ResponseInit): void;
  toTextStreamResponse(init?: ResponseInit): Response;
  // Additional context field
  context: CONTEXT;
}

/**
 * Extended GenerateTextResult that includes context
 */
export interface GenerateTextResultWithContext<
  TOOLS extends ToolSet = Record<string, any>,
  OUTPUT extends OutputSpec = OutputSpec,
  RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  CONTEXT extends Map<string | symbol, unknown> = Map<string | symbol, unknown>,
> extends GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT> {
  // Additional context field
  context: CONTEXT;
  // Feedback metadata for the trace, if enabled
  feedback?: AgentFeedbackHandle | null;
}

type ModelAttempt = {
  model: LanguageModel;
  modelName: string;
  modelId?: string;
  maxRetries: number;
  modelIndex: number;
  isLastModel: boolean;
  attempt: number;
  isLastAttempt: boolean;
};
type ModelRetryState = {
  candidates: AgentModelConfig[];
  resolved: Map<number, LanguageModel>;
  modelIndex: number;
};

type LLMOperation =
  | "streamText"
  | "generateText"
  | "streamObject"
  | "generateObject"
  | "generateTitle";

/**
 * Extended GenerateObjectResult that includes context
 */
export interface GenerateObjectResultWithContext<
  T,
  CONTEXT extends Map<string | symbol, unknown> = Map<string | symbol, unknown>,
> extends GenerateObjectResult<T> {
  // Additional context field
  context: CONTEXT;
}

function cloneGenerateTextResultWithContext<
  TOOLS extends ToolSet = Record<string, any>,
  OUTPUT extends OutputSpec = OutputSpec,
  RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
>(
  result: GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>,
  overrides: Partial<
    Pick<
      GenerateTextResultWithContext<TOOLS, OUTPUT, RUNTIME_CONTEXT>,
      "text" | "output" | "context" | "toolCalls" | "toolResults" | "feedback"
    >
  >,
): GenerateTextResultWithContext<TOOLS, OUTPUT, RUNTIME_CONTEXT> {
  const prototype = Object.getPrototypeOf(result);
  const clone = Object.create(prototype) as GenerateTextResultWithContext<
    TOOLS,
    OUTPUT,
    RUNTIME_CONTEXT
  >;
  const descriptors = Object.getOwnPropertyDescriptors(result);
  const overrideKeys = new Set(Object.keys(overrides));
  const baseDescriptors = Object.fromEntries(
    Object.entries(descriptors).filter(([key]) => !overrideKeys.has(key)),
  ) as PropertyDescriptorMap;

  Object.defineProperties(clone, baseDescriptors);

  for (const key of Object.keys(overrides) as Array<keyof typeof overrides>) {
    Object.defineProperty(clone, key, {
      value: overrides[key],
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }

  return clone;
}

type AIGenerateTextOptions<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  OUTPUT extends OutputSpec = OutputSpec,
> = Parameters<typeof generateText<TOOLS, RUNTIME_CONTEXT, OUTPUT>>[0];
type AIStreamTextOptions<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  OUTPUT extends OutputSpec = OutputSpec,
> = Parameters<typeof streamText<TOOLS, RUNTIME_CONTEXT, OUTPUT>>[0];
type GenerationMethod = "generate" | "stream" | "legacy";
type AITextGenerationOptions<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  OUTPUT extends OutputSpec = OutputSpec,
  METHOD extends GenerationMethod = "legacy",
> = METHOD extends "generate"
  ? AIGenerateTextOptions<TOOLS, RUNTIME_CONTEXT, OUTPUT>
  : METHOD extends "stream"
    ? AIStreamTextOptions<TOOLS, RUNTIME_CONTEXT, OUTPUT>
    : AIGenerateTextOptions<TOOLS, RUNTIME_CONTEXT, OUTPUT> &
        AIStreamTextOptions<TOOLS, RUNTIME_CONTEXT, OUTPUT>;
type VoltAgentControlledAISDKOption =
  | "model"
  | "prompt"
  | "messages"
  | "tools"
  | "output"
  | "providerOptions"
  | "abortSignal"
  | "maxRetries"
  | "toolChoice"
  | "toolApproval"
  | "toolsContext"
  | "prepareStep"
  | "experimental_toolApprovalSecret"
  | "onStepEnd"
  | "onStepFinish"
  | "onEnd"
  | "onFinish"
  | "onError"
  | "_internal";
type AISDKPassthroughOptions<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  OUTPUT extends OutputSpec = OutputSpec,
  METHOD extends GenerationMethod = "legacy",
> = Partial<
  Omit<
    AITextGenerationOptions<TOOLS, RUNTIME_CONTEXT, OUTPUT, METHOD>,
    VoltAgentControlledAISDKOption
  >
>;
type AISDKManagedCallbackName = "onStepEnd" | "onStepFinish" | "onEnd" | "onFinish" | "onError";
type AISDKManagedCallbacks<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  OUTPUT extends OutputSpec = OutputSpec,
  METHOD extends GenerationMethod = "legacy",
> = Pick<
  Partial<AITextGenerationOptions<TOOLS, RUNTIME_CONTEXT, OUTPUT, METHOD>>,
  Extract<
    AISDKManagedCallbackName,
    keyof AITextGenerationOptions<TOOLS, RUNTIME_CONTEXT, OUTPUT, METHOD>
  >
>;

type IsExactToolSet<TOOLS extends ToolSet> = [ToolSet] extends [TOOLS] ? true : false;
type IsEmptyObject<OBJECT> = keyof OBJECT extends never ? true : false;
type ToolsContextFor<TOOLS extends ToolSet> = IsExactToolSet<TOOLS> extends true
  ? Record<string, unknown>
  : InferToolSetContext<TOOLS>;
type VoltAgentToolsContextParameter<TOOLS extends ToolSet> = IsExactToolSet<TOOLS> extends true
  ? { toolsContext?: Record<string, unknown> }
  : IsEmptyObject<InferToolSetContext<TOOLS>> extends true
    ? { toolsContext?: never }
    : HasRequiredKey<InferToolSetContext<TOOLS>> extends true
      ? { toolsContext: InferToolSetContext<TOOLS> }
      : { toolsContext?: InferToolSetContext<TOOLS> };

type AITextCallOptions<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  OUTPUT extends OutputSpec = OutputSpec,
> = AISDKPassthroughOptions<TOOLS, RUNTIME_CONTEXT, OUTPUT> & {
  instructions?: Instructions;
  system?: Instructions;
  stop?: string | string[];
  toolChoice?: ToolChoice<TOOLS>;
  toolApproval?: ToolApprovalConfiguration<TOOLS, RUNTIME_CONTEXT>;
  experimental_toolApprovalSecret?: string | Uint8Array;
  toolsContext?: ToolsContextFor<TOOLS>;
  prepareStep?: PrepareStepFunction<TOOLS, RUNTIME_CONTEXT>;
  onStepEnd?: AISDKManagedCallbacks<TOOLS, RUNTIME_CONTEXT, OUTPUT>["onStepEnd"];
  onStepFinish?: AISDKManagedCallbacks<TOOLS, RUNTIME_CONTEXT, OUTPUT>["onStepFinish"];
  onEnd?: AISDKManagedCallbacks<TOOLS, RUNTIME_CONTEXT, OUTPUT>["onEnd"];
  onFinish?: AISDKManagedCallbacks<TOOLS, RUNTIME_CONTEXT, OUTPUT>["onFinish"];
  onError?:
    | AISDKManagedCallbacks<TOOLS, RUNTIME_CONTEXT, OUTPUT>["onError"]
    | GenerationErrorCallback;
};

const VALIDATED_CONTEXT = Symbol("validatedContext");
type AnyBaseGenerationOptions = Record<string, any> & {
  [VALIDATED_CONTEXT]?: Map<string | symbol, unknown>;
  hooks?: AgentHooks;
  inputGuardrails?: InputGuardrail[];
  outputGuardrails?: OutputGuardrail<any>[];
  inputMiddlewares?: InputMiddleware[];
  outputMiddlewares?: OutputMiddleware<any>[];
};

type VoltAgentGenerateTextCallOptions<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  OUTPUT extends OutputSpec = OutputSpec,
> = Omit<AIGenerateTextOptions<TOOLS, RUNTIME_CONTEXT, OUTPUT>, "toolsContext"> & {
  toolsContext?: ToolsContextFor<TOOLS>;
};
type VoltAgentStreamTextCallOptions<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  OUTPUT extends OutputSpec = OutputSpec,
> = Omit<AIStreamTextOptions<TOOLS, RUNTIME_CONTEXT, OUTPUT>, "toolsContext" | "onError"> & {
  toolsContext?: ToolsContextFor<TOOLS>;
  onError?: GenerationErrorCallback;
};

function generateTextWithVoltAgentTools<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  OUTPUT extends OutputSpec = OutputSpec,
>(
  options: VoltAgentGenerateTextCallOptions<TOOLS, RUNTIME_CONTEXT, OUTPUT>,
): Promise<GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>> {
  // VoltAgent resolves ToolSet entries dynamically at runtime, so TypeScript
  // cannot infer which tools declare AI SDK `contextSchema`. The AI SDK runtime
  // supports `toolsContext`; this boundary keeps the cast localized.
  return generateText(
    options as unknown as AIGenerateTextOptions<TOOLS, RUNTIME_CONTEXT, OUTPUT>,
  ) as Promise<GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>>;
}

function streamTextWithVoltAgentTools<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  OUTPUT extends OutputSpec = OutputSpec,
>(
  options: VoltAgentStreamTextCallOptions<TOOLS, RUNTIME_CONTEXT, OUTPUT>,
): AIStreamTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT> {
  // See `generateTextWithVoltAgentTools` for why this cast is localized here.
  return streamText(
    options as unknown as AIStreamTextOptions<TOOLS, RUNTIME_CONTEXT, OUTPUT>,
  ) as AIStreamTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>;
}

function applyForcedToolChoice<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  OUTPUT extends OutputSpec = OutputSpec,
>(
  aiSDKOptions: AITextCallOptions<TOOLS, RUNTIME_CONTEXT, OUTPUT>,
  forcedToolChoice: ToolChoice<TOOLS> | undefined,
): void {
  if (!forcedToolChoice || aiSDKOptions.toolChoice !== undefined) {
    return;
  }

  const userPrepareStep = aiSDKOptions.prepareStep;
  const prepareStepWithForcedToolChoice = async (
    options: Parameters<PrepareStepFunction<TOOLS, RUNTIME_CONTEXT>>[0],
  ) => {
    const prepared = userPrepareStep ? await userPrepareStep(options) : undefined;
    const isFirstStep = options.steps.length === 0;
    if (!isFirstStep || prepared?.toolChoice !== undefined) {
      return prepared;
    }

    if (prepared) {
      return { ...prepared, toolChoice: forcedToolChoice };
    }

    return { toolChoice: forcedToolChoice };
  };

  aiSDKOptions.prepareStep = prepareStepWithForcedToolChoice as NonNullable<
    AITextCallOptions<TOOLS, RUNTIME_CONTEXT, OUTPUT>["prepareStep"]
  >;
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

const asyncGeneratorFunction = Object.getPrototypeOf(async function* () {}).constructor;
const DEFAULT_LLM_MAX_RETRIES = 3;

function isAsyncGeneratorFunction(
  value: unknown,
): value is (...args: any[]) => AsyncIterable<unknown> {
  return typeof value === "function" && value.constructor === asyncGeneratorFunction;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function";
}

/**
 * Base options for all generation methods
 * Extends AI SDK's CallSettings for full compatibility
 */
export type BaseGenerationOptions<
  TProviderOptions extends ProviderOptions = ProviderOptions,
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  OUTPUT extends OutputSpec = OutputSpec,
  METHOD extends GenerationMethod = "legacy",
> = AISDKPassthroughOptions<TOOLS, RUNTIME_CONTEXT, OUTPUT, METHOD> &
  AISDKManagedCallbacks<TOOLS, RUNTIME_CONTEXT, OUTPUT, METHOD> &
  VoltAgentToolsContextParameter<TOOLS> & {
    /** Model for this invocation. Replaces the constructor model/fallback list for this call. */
    model?: LanguageModel;

    // === VoltAgent Specific ===
    // New namespace for VoltAgent runtime-specific options.
    voltagent?: VoltAgentRuntimeOptions;

    // Context
    /**
     * Runtime memory envelope for per-call memory identity and behavior overrides.
     */
    memory?: RuntimeMemoryEnvelope;
    /**
     * @deprecated Use `memory.userId` instead.
     */
    userId?: string;
    /**
     * @deprecated Use `memory.conversationId` instead.
     */
    conversationId?: string;
    context?: ContextInput;
    /**
     * HTTP request headers associated with this call.
     *
     * Server adapters populate this from the incoming request and expose it to
     * dynamic `model`, `instructions`, and `tools` callbacks as `headers`.
     * This is separate from AI SDK/provider `headers`.
     */
    requestHeaders?: Record<string, string>;
    elicitation?: (request: unknown) => Promise<unknown>;

    // Parent tracking
    parentAgentId?: string;
    parentOperationContext?: OperationContext;
    parentSpan?: Span; // Optional parent span for OpenTelemetry context propagation
    inheritParentSpan?: boolean; // Use active VoltAgent span if parentSpan is not provided
    /**
     * External abort signal for this operation. VoltAgent wires this into its
     * operation context so memory, tools, guardrails, tracing, and the model call
     * are cancelled together.
     */
    abortSignal?: AbortSignal;

    // Memory
    /**
     * @deprecated Use `memory.options.contextLimit` instead.
     */
    contextLimit?: number;

    // Semantic memory options
    /**
     * @deprecated Use `memory.options.semanticMemory` instead.
     */
    semanticMemory?: SemanticMemoryOptions;
    /**
     * @deprecated Use `memory.options.conversationPersistence` instead.
     */
    conversationPersistence?: AgentConversationPersistenceOptions;
    /**
     * @deprecated Use `memory.options.messageMetadataPersistence` instead.
     */
    messageMetadataPersistence?: AgentMessageMetadataPersistenceConfig;

    // Steps control
    maxSteps?: number;
    /**
     * Number of retries per model call (a non-negative integer).
     *
     * The underlying AI SDK call receives `maxRetries: 0`; VoltAgent owns retries
     * at the provider boundary, preserving completed steps and tool results.
     */
    maxRetries?: number;
    feedback?: boolean | AgentFeedbackOptions;
    /**
     * When true, avoids wiring the HTTP abort signal into streams so clients can resume later.
     * Non-streaming calls ignore this option.
     */
    resumableStream?: boolean;
    /**
     * Custom stop condition for ai-sdk step execution.
     * When provided, this overrides VoltAgent's default `isStepCount(maxSteps)`.
     * Use with care: incorrect predicates can cause early termination or
     * unbounded loops depending on provider behavior and tool usage.
     */
    stopWhen?: StopWhen;

    // Tools (can provide additional tools dynamically)
    tools?: AgentToolInput<TOOLS>;
    /**
     * Optional per-call tool routing override.
     */
    toolRouting?: ToolRoutingConfig | false;

    // Hooks (can override agent hooks)
    hooks?: AgentHooks;

    // Guardrails (can override agent-level guardrails)
    inputGuardrails?: InputGuardrail[];
    outputGuardrails?: OutputGuardrail<any>[];

    // Middleware (can override agent-level middlewares)
    inputMiddlewares?: InputMiddleware[];
    outputMiddlewares?: OutputMiddleware<any>[];
    maxMiddlewareRetries?: number;

    // Provider-specific options
    providerOptions?: TProviderOptions;

    // Structured output (for schema-guided generation)
    output?: OutputSpec;

    // === AI SDK generation settings ===
    // BaseGenerationOptions inherits AI SDK generateText/streamText settings.
    // VoltAgent forwards AI SDK options at the model-call boundary and keeps
    // framework-specific lifecycle behavior under `hooks` / `voltagent`.
    /**
     * Optional explicit stop sequences to pass through to the underlying provider.
     * Mirrors the `stop` option supported by ai-sdk `generateText/streamText`.
     */
    stop?: string | string[];

    /**
     * Tool choice strategy for AI SDK calls.
     */
    toolChoice?: ToolChoice<TOOLS>;

    /**
     * AI SDK native tool approval configuration.
     *
     * This takes precedence over tool-level `needsApproval` during AI SDK tool
     * execution. VoltAgent also reads it inside tool routing so hidden pool tools
     * can follow the same approval policy when called through `callTool`.
     */
    toolApproval?: ToolApprovalConfiguration<TOOLS, RUNTIME_CONTEXT>;

    /**
     * Secret used by AI SDK to sign native tool approval requests.
     */
    experimental_toolApprovalSecret?: string | Uint8Array;

    /**
     * Step preparation callback (ai-sdk `prepareStep`).
     * Called before each step to control tool availability, tool choice, etc.
     * Overrides the agent-level `prepareStep` if provided.
     */
    prepareStep?: PrepareStepFunction<TOOLS, RUNTIME_CONTEXT>;
  };

function normalizeInstructions(instructions: Instructions | undefined): SystemModelMessage[] {
  if (!instructions) {
    return [];
  }
  if (typeof instructions === "string") {
    return [{ role: "system", content: instructions }];
  }
  return Array.isArray(instructions) ? instructions : [instructions];
}

function splitInstructionsFromMessages(
  messages: ModelMessage[],
  existingInstructions?: Instructions,
  allowSystemInMessages = false,
): { instructions?: Instructions; messages: ModelMessage[] } {
  const systemMessages: SystemModelMessage[] = [];
  const modelMessages: ModelMessage[] = [];

  for (const message of messages) {
    if (message.role === "system" && !allowSystemInMessages) {
      systemMessages.push(message as SystemModelMessage);
    } else {
      modelMessages.push(message);
    }
  }

  const mergedInstructions = [...normalizeInstructions(existingInstructions), ...systemMessages];

  return {
    instructions:
      mergedInstructions.length === 0
        ? undefined
        : mergedInstructions.length === 1
          ? mergedInstructions[0]
          : mergedInstructions,
    messages: modelMessages,
  };
}

export type GenerateTextOptions<
  OUTPUT extends OutputSpec = OutputSpec,
  TProviderOptions extends ProviderOptions = ProviderOptions,
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  CONTEXT_SCHEMA extends AgentContextSchema = AgentContextSchema,
> = Omit<
  BaseGenerationOptions<TProviderOptions, TOOLS, RUNTIME_CONTEXT, OUTPUT, "generate">,
  "output" | "voltagent" | "context"
> &
  AgentContextParameter<CONTEXT_SCHEMA> & {
    output?: OUTPUT;
  };
export type StreamTextOptions<
  TProviderOptions extends ProviderOptions = ProviderOptions,
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  OUTPUT extends OutputSpec = OutputSpec,
  CONTEXT_SCHEMA extends AgentContextSchema = AgentContextSchema,
> = Omit<
  BaseGenerationOptions<TProviderOptions, TOOLS, RUNTIME_CONTEXT, OUTPUT, "stream">,
  "output" | "voltagent" | "context"
> &
  AgentContextParameter<CONTEXT_SCHEMA> & {
    output?: OUTPUT;
  };
export type TextGenerationInput = string | UIMessage[] | BaseMessage[];
type TextGenerationOptionsArgs<TOptions> = Record<never, never> extends TOptions
  ? [options?: TOptions]
  : [options: TOptions];
type TextGenerationRequest<TOptions> = (
  | {
      prompt: string | ModelMessage[];
      messages?: never;
    }
  | {
      messages: UIMessage[] | BaseMessage[];
      prompt?: never;
    }
) &
  ((TOptions & { options?: Partial<TOptions> }) | (Partial<TOptions> & { options: TOptions }));
export type GenerateTextRequest<
  OUTPUT extends OutputSpec = OutputSpec,
  TProviderOptions extends ProviderOptions = ProviderOptions,
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  CONTEXT_SCHEMA extends AgentContextSchema = AgentContextSchema,
> = TextGenerationRequest<
  GenerateTextOptions<OUTPUT, TProviderOptions, TOOLS, RUNTIME_CONTEXT, CONTEXT_SCHEMA>
>;
export type StreamTextRequest<
  TProviderOptions extends ProviderOptions = ProviderOptions,
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  OUTPUT extends OutputSpec = OutputSpec,
  CONTEXT_SCHEMA extends AgentContextSchema = AgentContextSchema,
> = TextGenerationRequest<
  StreamTextOptions<TProviderOptions, TOOLS, RUNTIME_CONTEXT, OUTPUT, CONTEXT_SCHEMA>
>;
export type GenerateObjectOptions<
  TProviderOptions extends ProviderOptions = ProviderOptions,
  CONTEXT_SCHEMA extends AgentContextSchema = AgentContextSchema,
> = Omit<BaseGenerationOptions<TProviderOptions>, "voltagent" | "context"> &
  AgentContextParameter<CONTEXT_SCHEMA>;
export type StreamObjectOptions<
  TProviderOptions extends ProviderOptions = ProviderOptions,
  CONTEXT_SCHEMA extends AgentContextSchema = AgentContextSchema,
> = GenerateObjectOptions<TProviderOptions, CONTEXT_SCHEMA> & {
  onFinish?: (result: any) => void | Promise<void>;
};

function normalizeVoltAgentRuntimeOptions<TOptions extends AnyBaseGenerationOptions | undefined>(
  options: TOptions,
): TOptions {
  if (!options || !("voltagent" in options)) {
    return options;
  }

  const { voltagent, ...legacyOptions } = options;
  if (!voltagent) {
    return legacyOptions as TOptions;
  }

  const {
    guardrails,
    middleware,
    inputGuardrails,
    outputGuardrails,
    inputMiddlewares,
    outputMiddlewares,
    maxMiddlewareRetries,
    ...runtimeOptions
  } = voltagent;
  const normalizedOptions = {
    ...legacyOptions,
    ...runtimeOptions,
    ...(guardrails?.input !== undefined || inputGuardrails !== undefined
      ? { inputGuardrails: guardrails?.input ?? inputGuardrails }
      : {}),
    ...(guardrails?.output !== undefined || outputGuardrails !== undefined
      ? { outputGuardrails: guardrails?.output ?? outputGuardrails }
      : {}),
    ...(middleware?.input !== undefined || inputMiddlewares !== undefined
      ? { inputMiddlewares: middleware?.input ?? inputMiddlewares }
      : {}),
    ...(middleware?.output !== undefined || outputMiddlewares !== undefined
      ? { outputMiddlewares: middleware?.output ?? outputMiddlewares }
      : {}),
    ...(middleware?.maxRetries !== undefined || maxMiddlewareRetries !== undefined
      ? { maxMiddlewareRetries: middleware?.maxRetries ?? maxMiddlewareRetries }
      : {}),
  };

  return normalizedOptions as TOptions;
}

type GenerationFinishCallback = (result: any) => void | PromiseLike<void>;
type GenerationStepEndCallback<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
> = (event: StepResult<TOOLS, RUNTIME_CONTEXT>) => void | PromiseLike<void>;
// Newer SDKs inspect callback return values (for example `{ retry: true }`).
type GenerationErrorCallback = (event: { error: unknown }) => unknown;

function extractAISDKCallOptions<
  TProviderOptions extends ProviderOptions = ProviderOptions,
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  OUTPUT extends OutputSpec = OutputSpec,
>(
  options?: AnyBaseGenerationOptions,
): {
  aiSDKOptions: AITextCallOptions<TOOLS, RUNTIME_CONTEXT, OUTPUT>;
  output?: OUTPUT;
  providerOptions?: TProviderOptions;
  onEnd?: GenerationFinishCallback;
  onStepEnd?: GenerationStepEndCallback<TOOLS, RUNTIME_CONTEXT>;
  onError?: GenerationErrorCallback;
} {
  const {
    voltagent: _voltagent,
    [VALIDATED_CONTEXT]: _validatedContext,
    userId: _userId,
    conversationId: _conversationId,
    memory: _memory,
    context: _context,
    requestHeaders: _requestHeaders,
    elicitation: _elicitation,
    parentAgentId: _parentAgentId,
    parentOperationContext: _parentOperationContext,
    parentSpan: _parentSpan,
    inheritParentSpan: _inheritParentSpan,
    hooks: _hooks,
    feedback: _feedback,
    maxSteps: _maxSteps,
    tools: _tools,
    model: _model,
    toolRouting: _toolRouting,
    contextLimit: _contextLimit,
    semanticMemory: _semanticMemory,
    conversationPersistence: _conversationPersistence,
    messageMetadataPersistence: _messageMetadataPersistence,
    inputGuardrails: _inputGuardrails,
    outputGuardrails: _outputGuardrails,
    inputMiddlewares: _inputMiddlewares,
    outputMiddlewares: _outputMiddlewares,
    maxMiddlewareRetries: _maxMiddlewareRetries,
    resumableStream: _resumableStream,
    output,
    providerOptions,
    onFinish,
    onEnd,
    onStepEnd,
    onStepFinish,
    onError,
    ...aiSDKOptions
  } = options ?? {};

  return {
    aiSDKOptions: aiSDKOptions as AITextCallOptions<TOOLS, RUNTIME_CONTEXT, OUTPUT>,
    output: output as OUTPUT | undefined,
    providerOptions: providerOptions as TProviderOptions | undefined,
    onEnd: onEnd ?? onFinish,
    onStepEnd: (onStepEnd ?? onStepFinish) as
      | GenerationStepEndCallback<TOOLS, RUNTIME_CONTEXT>
      | undefined,
    onError,
  };
}

async function invokeAISDKCallbackSafely<TEvent>(
  callback: ((event: TEvent) => void | PromiseLike<void>) | undefined,
  event: TEvent,
  logger: Logger | undefined,
  callbackName: string,
): Promise<void> {
  if (!callback) {
    return;
  }

  try {
    await callback(event);
  } catch (error) {
    logger?.debug?.(`AI SDK ${callbackName} callback failed`, { error });
  }
}

/** Validate caller-owned input before memory and framework instructions are added. */
function validateGenerationInput(
  input: TextGenerationInput,
  options?: AnyBaseGenerationOptions,
): void {
  if (typeof input !== "string" && !Array.isArray(input)) {
    throw new InvalidPromptError({ prompt: input, message: "prompt or messages must be defined" });
  }
  if (Array.isArray(input)) {
    if (input.length === 0) {
      throw new InvalidPromptError({ prompt: input, message: "messages must not be empty" });
    }
    if (!options?.allowSystemInMessages && input.some((message) => message?.role === "system")) {
      throw new InvalidPromptError({
        prompt: input,
        message:
          "System messages are not allowed in the prompt or messages fields. Use the instructions option instead.",
      });
    }
  }
  const instructions = options?.instructions === undefined ? options?.system : options.instructions;
  if (
    instructions !== undefined &&
    typeof instructions !== "string" &&
    !(Array.isArray(instructions) ? instructions : [instructions]).every(
      (message) => message?.role === "system",
    )
  ) {
    throw new InvalidPromptError({
      prompt: input,
      message: "instructions must be a string, SystemModelMessage, or array of SystemModelMessage",
    });
  }
}

function isTextGenerationRequest<TOptions>(
  input: TextGenerationInput | TextGenerationRequest<TOptions>,
): input is TextGenerationRequest<TOptions> {
  return (
    typeof input === "object" &&
    input !== null &&
    !Array.isArray(input) &&
    ("prompt" in input || "messages" in input)
  );
}

function normalizeTextGenerationArgs<TOptions extends object>(
  inputOrRequest: TextGenerationInput | TextGenerationRequest<TOptions>,
  options?: TOptions,
): { input: TextGenerationInput; options?: TOptions } {
  if (!isTextGenerationRequest(inputOrRequest)) {
    return {
      input: inputOrRequest,
      options: options
        ? (normalizeVoltAgentRuntimeOptions(
            options as TOptions & AnyBaseGenerationOptions,
          ) as TOptions)
        : undefined,
    };
  }

  const {
    prompt,
    messages,
    options: nestedOptions,
    ...topLevelOptions
  } = inputOrRequest as TextGenerationRequest<TOptions> & {
    prompt?: string | ModelMessage[];
    messages?: UIMessage[] | BaseMessage[];
  };
  if (prompt != null && messages != null) {
    throw new InvalidPromptError({
      prompt: inputOrRequest,
      message: "prompt and messages cannot be defined at the same time",
    });
  }
  const input = prompt ?? messages;
  if (input == null) {
    throw new InvalidPromptError({
      prompt: inputOrRequest,
      message: "prompt or messages must be defined",
    });
  }

  const mergedOptions = {
    ...(nestedOptions ?? {}),
    ...topLevelOptions,
    ...(options ?? {}),
  } as TOptions;

  return {
    input,
    options:
      Object.keys(mergedOptions).length > 0
        ? (normalizeVoltAgentRuntimeOptions(
            mergedOptions as TOptions & AnyBaseGenerationOptions,
          ) as TOptions)
        : undefined,
  };
}

type LegacyToolInputItem = Tool<any, any> | Toolkit | VercelTool;
type ManagedToolInfo = BaseTool | ProviderTool | NamedAiSdkTool;

function splitAgentToolInput(input: AgentToolInput | undefined): {
  items: LegacyToolInputItem[];
  toolSet?: ToolSet;
} {
  if (!input) {
    return { items: [] };
  }

  if (Array.isArray(input)) {
    return { items: input };
  }

  return { items: [], toolSet: input };
}

function addAgentToolInputToManager(manager: ToolManager, input: AgentToolInput | undefined): void {
  const { items, toolSet } = splitAgentToolInput(input);
  if (items.length > 0) {
    manager.addItems(items);
  }
  if (toolSet) {
    manager.addToolSet(toolSet);
  }
}

// ============================================================================
// Agent Implementation
// ============================================================================

export interface Agent<
  AGENT_TOOLS extends ToolSet = ToolSet,
  CONTEXT_SCHEMA extends AgentContextSchema = any,
> {
  readonly id: string;
  readonly name: string;
  readonly purpose?: string;
  readonly instructions: InstructionsDynamicValue;
  readonly model: AgentModelValue;
  readonly dynamicTools?: DynamicValue<AgentToolInput<AGENT_TOOLS>>;
  hooks: AgentHooks;
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
  maxSteps: number;
  readonly maxRetries: number;
  readonly stopWhen?: StopWhen;
  readonly prepareStep?: PrepareStep;
  readonly markdown: boolean;
  readonly inheritParentSpan: boolean;
  readonly voice?: Voice;
  readonly retriever?: BaseRetriever;
  readonly supervisorConfig?: SupervisorConfig;
  generateText<
    OUTPUT extends OutputSpec = ReturnType<typeof Output.text>,
    TProviderOptions extends ProviderOptions = ProviderOptions,
    TOOLS extends ToolSet = AGENT_TOOLS,
    RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  >(
    input: string | UIMessage[] | BaseMessage[],
    ...options: TextGenerationOptionsArgs<
      GenerateTextOptions<OUTPUT, TProviderOptions, TOOLS, RUNTIME_CONTEXT, CONTEXT_SCHEMA>
    >
  ): Promise<
    GenerateTextResultWithContext<TOOLS, OUTPUT, RUNTIME_CONTEXT, AgentContext<CONTEXT_SCHEMA>>
  >;
  generateText<
    OUTPUT extends OutputSpec = ReturnType<typeof Output.text>,
    TProviderOptions extends ProviderOptions = ProviderOptions,
    TOOLS extends ToolSet = AGENT_TOOLS,
    RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  >(
    request: GenerateTextRequest<OUTPUT, TProviderOptions, TOOLS, RUNTIME_CONTEXT, CONTEXT_SCHEMA>,
  ): Promise<
    GenerateTextResultWithContext<TOOLS, OUTPUT, RUNTIME_CONTEXT, AgentContext<CONTEXT_SCHEMA>>
  >;
  streamText<
    TProviderOptions extends ProviderOptions = ProviderOptions,
    TOOLS extends ToolSet = AGENT_TOOLS,
    RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
    OUTPUT extends OutputSpec = ReturnType<typeof Output.text>,
  >(
    input: string | UIMessage[] | BaseMessage[],
    ...options: TextGenerationOptionsArgs<
      StreamTextOptions<TProviderOptions, TOOLS, RUNTIME_CONTEXT, OUTPUT, CONTEXT_SCHEMA>
    >
  ): Promise<
    StreamTextResultWithContext<TOOLS, OUTPUT, RUNTIME_CONTEXT, AgentContext<CONTEXT_SCHEMA>>
  >;
  streamText<
    TProviderOptions extends ProviderOptions = ProviderOptions,
    TOOLS extends ToolSet = AGENT_TOOLS,
    RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
    OUTPUT extends OutputSpec = ReturnType<typeof Output.text>,
  >(
    request: StreamTextRequest<TProviderOptions, TOOLS, RUNTIME_CONTEXT, OUTPUT, CONTEXT_SCHEMA>,
  ): Promise<
    StreamTextResultWithContext<TOOLS, OUTPUT, RUNTIME_CONTEXT, AgentContext<CONTEXT_SCHEMA>>
  >;
  generateObject<T extends z.ZodType, TProviderOptions extends ProviderOptions = ProviderOptions>(
    originalInput: string | UIMessage[] | BaseMessage[],
    schema: T,
    ...rawOptions: TextGenerationOptionsArgs<
      GenerateObjectOptions<TProviderOptions, CONTEXT_SCHEMA>
    >
  ): Promise<GenerateObjectResultWithContext<z.infer<T>, AgentContext<CONTEXT_SCHEMA>>>;
  streamObject<T extends z.ZodType, TProviderOptions extends ProviderOptions = ProviderOptions>(
    originalInput: string | UIMessage[] | BaseMessage[],
    schema: T,
    ...rawOptions: TextGenerationOptionsArgs<StreamObjectOptions<TProviderOptions, CONTEXT_SCHEMA>>
  ): Promise<StreamObjectResultWithContext<z.infer<T>, AgentContext<CONTEXT_SCHEMA>>>;
  getModelName(model?: LanguageModel | string): string;
  getFullState(): AgentFullState;
  addTools(tools: AgentToolInput): {
    added: AgentToolInput;
  };
  removeTools(toolNames: string[]): { removed: string[] };
  removeToolkit(toolkitName: string): boolean;
  addSubAgent(agentConfig: SubAgentConfig): void;
  removeSubAgent(agentId: string): void;
  getTools(): Array<Tool<any, any> | ProviderTool | NamedAiSdkTool>;
  getToolsForApi(): ApiToolInfo[];
  getSubAgents(): SubAgentConfig[];
  unregister(): void;
  isTelemetryConfigured(): boolean;
  markFeedbackProvided(
    input: AgentMarkFeedbackProvidedInput,
  ): Promise<AgentFeedbackMetadata | null>;
  getMemoryManager(): MemoryManager;
  getToolManager(): ToolManager;
  getWorkspace(): Workspace | undefined;
  getMemory(): Memory | false | undefined;
  __setDefaultMemory(memory: Memory): void;
  __setDefaultConversationPersistence(
    conversationPersistence: AgentConversationPersistenceOptions,
  ): void;
  __setDefaultWorkspace(workspace: Workspace): void;
  __setDefaultToolRouting(toolRouting?: ToolRoutingConfig): void;
  toTool(options?: {
    name?: string;
    description?: string;
    parametersSchema?: z.ZodObject<any>;
    context?: AgentContextInput<CONTEXT_SCHEMA>;
  }): Tool<any, any>;
}

/** Defines an agent with factory-owned state and bound execution methods. */
export function defineAgent<
  AGENT_TOOLS extends ToolSet = ToolSet,
  CONTEXT_SCHEMA extends AgentContextSchema = AgentContextSchema,
>(typedOptions: AgentOptions<AGENT_TOOLS, CONTEXT_SCHEMA>): Agent<AGENT_TOOLS, CONTEXT_SCHEMA> {
  let stateHooks: AgentHooks;
  let stateMaxSteps: number;
  let stateConversationPersistence: ResolvedConversationPersistenceOptions;
  let stateWorkspace: Workspace | undefined;
  let stateDefaultObservability: VoltAgentObservability | undefined;
  const stateObservabilityAuthWarningState: ObservabilityFlushState = {
    authWarningLogged: false,
  };
  let stateToolRouting: ToolRoutingConfig | false | undefined;
  let stateToolRoutingConfigured: boolean;
  let stateToolRoutingExposedNames: Set<string> = new Set();
  let stateToolRoutingPoolExplicit = false;
  let stateToolRoutingSearchStrategy: ToolSearchStrategy | undefined;

  // ============================================================================
  // Public API Methods
  // ============================================================================

  async function agentValidateInvocationContext(
    options: AnyBaseGenerationOptions | undefined,
  ): Promise<AnyBaseGenerationOptions | undefined> {
    if (!stateContextSchema) return options;
    const abortSignal = (options?.abortSignal ??
      options?.parentOperationContext?.abortController.signal) as AbortSignal | undefined;
    abortSignal?.throwIfAborted();

    // Validate a snapshot first: an invalid call must not partially update a shared map.
    const merged = agentResolveContext(options, true);
    let validated: Record<string, unknown>;
    try {
      validated = await validateTypes({
        value: Object.fromEntries(merged),
        schema: stateContextSchema,
      });
      if (
        validated === null ||
        typeof validated !== "object" ||
        Array.isArray(validated) ||
        validated instanceof Map
      ) {
        throw new TypeError("contextSchema must produce a context object");
      }
    } catch (error) {
      abortSignal?.throwIfAborted();
      throw new AgentContextValidationError(error);
    }
    abortSignal?.throwIfAborted();

    // Keep explicitly shared maps authoritative. Constructor-only defaults are copied
    // so schema transforms/defaults do not change subsequent invocations.
    const context =
      options?.parentOperationContext?.context ??
      toContextMap(options?.context) ??
      new Map(stateContext);
    for (const [key, value] of merged) context.set(key, value);
    for (const key of Reflect.ownKeys(validated)) {
      context.set(key, Reflect.get(validated, key));
    }
    return { ...options, [VALIDATED_CONTEXT]: context };
  }

  /**
   * Generate text response
   */
  function agentGenerateText<
    OUTPUT extends OutputSpec = ReturnType<typeof Output.text>,
    TProviderOptions extends ProviderOptions = ProviderOptions,
    TOOLS extends ToolSet = AGENT_TOOLS,
    RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  >(
    input: string | UIMessage[] | BaseMessage[],
    ...options: TextGenerationOptionsArgs<
      GenerateTextOptions<OUTPUT, TProviderOptions, TOOLS, RUNTIME_CONTEXT, CONTEXT_SCHEMA>
    >
  ): Promise<
    GenerateTextResultWithContext<TOOLS, OUTPUT, RUNTIME_CONTEXT, AgentContext<CONTEXT_SCHEMA>>
  >;

  function agentGenerateText<
    OUTPUT extends OutputSpec = ReturnType<typeof Output.text>,
    TProviderOptions extends ProviderOptions = ProviderOptions,
    TOOLS extends ToolSet = AGENT_TOOLS,
    RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  >(
    request: GenerateTextRequest<OUTPUT, TProviderOptions, TOOLS, RUNTIME_CONTEXT, CONTEXT_SCHEMA>,
  ): Promise<
    GenerateTextResultWithContext<TOOLS, OUTPUT, RUNTIME_CONTEXT, AgentContext<CONTEXT_SCHEMA>>
  >;

  async function agentGenerateText<
    OUTPUT extends OutputSpec = ReturnType<typeof Output.text>,
    TProviderOptions extends ProviderOptions = ProviderOptions,
    TOOLS extends ToolSet = AGENT_TOOLS,
    RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  >(
    inputOrRequest:
      | string
      | UIMessage[]
      | BaseMessage[]
      | GenerateTextRequest<OUTPUT, TProviderOptions, TOOLS, RUNTIME_CONTEXT, CONTEXT_SCHEMA>,
    ...requestOptions: [
      options?: GenerateTextOptions<
        OUTPUT,
        TProviderOptions,
        TOOLS,
        RUNTIME_CONTEXT,
        CONTEXT_SCHEMA
      >,
    ]
  ): Promise<GenerateTextResultWithContext<TOOLS, OUTPUT, RUNTIME_CONTEXT>> {
    const normalizedArgs = normalizeTextGenerationArgs(inputOrRequest, requestOptions[0]);
    const { input } = normalizedArgs;
    validateGenerationInput(input, normalizedArgs.options);
    const options = await agentValidateInvocationContext(normalizedArgs.options);
    const startTime = Date.now();
    const oc = agentCreateOperationContext(input, options);
    const methodLogger = oc.logger;
    const feedbackOptions = agentResolveFeedbackOptions(options);
    const feedbackClient = feedbackOptions ? agentGetFeedbackClient() : undefined;
    const shouldDeferPersist = Boolean(feedbackOptions && feedbackClient);
    const shouldPersistMemory = agentShouldPersistMemoryForContext(oc);
    let feedbackMetadata: AgentFeedbackMetadata | null = null;

    // Wrap entire execution in root span for trace context
    const rootSpan = oc.traceContext.getRootSpan();
    return await oc.traceContext.withSpan(rootSpan, async () => {
      const guardrailSet = agentResolveGuardrailSets(options);
      const middlewareSet = agentResolveMiddlewareSets(options);
      const maxMiddlewareRetries = agentResolveMiddlewareRetries(options);
      let middlewareRetryCount = 0;
      const feedbackPromise =
        feedbackOptions && feedbackClient ? agentCreateFeedbackMetadata(oc, options) : null;
      let effectiveInput: typeof input = input;
      try {
        while (true) {
          try {
            if (middlewareRetryCount > 0) {
              agentResetOperationAttemptState(oc);
            }

            const buffer = agentGetConversationBuffer(oc);
            const persistQueue = agentGetMemoryPersistQueue(oc);

            effectiveInput = await runInputMiddlewares(
              input,
              oc,
              middlewareSet.input,
              "generateText",
              runtimeAgent,
              middlewareRetryCount,
            );

            effectiveInput = await executeInputGuardrails(
              effectiveInput,
              oc,
              guardrailSet.input,
              "generateText",
              runtimeAgent,
            );

            const { messages, uiMessages, modelName, tools, maxSteps } =
              await agentPrepareExecution(effectiveInput, oc, options);
            const resolvedMemory = agentResolveMemoryRuntimeOptions(options, oc);
            const contextLimit = resolvedMemory.contextLimit;

            // Add model attributes and all options
            addModelAttributesToSpan(
              rootSpan,
              modelName,
              options,
              stateMaxOutputTokens,
              stateTemperature,
            );

            // Add context to span
            const contextMap = Object.fromEntries(oc.context.entries());
            if (Object.keys(contextMap).length > 0) {
              rootSpan.setAttribute("agent.context", safeStringify(contextMap));
            }

            // Add messages (serialize to JSON string)
            rootSpan.setAttribute("agent.messages", safeStringify(messages));
            rootSpan.setAttribute("agent.messages.ui", safeStringify(uiMessages));

            // Add agent state snapshot for remote observability
            const agentState = runtimeAgent.getFullState();
            rootSpan.setAttribute("agent.stateSnapshot", safeStringify(agentState));

            // Log generation start with only event-specific context
            methodLogger.debug(
              buildAgentLogMessage(
                stateName,
                ActionType.GENERATION_START,
                `Starting text generation with ${modelName}`,
              ),
              {
                event: LogEvents.AGENT_GENERATION_STARTED,
                operationType: "text",
                contextLimit,
                memoryEnabled: !!stateMemoryManager.getMemory(),
                model: modelName,
                messageCount: messages?.length || 0,
                input: effectiveInput,
              },
            );

            // Call hooks
            await agentGetMergedHooks(options).onStart?.({ agent: runtimeAgent, context: oc });

            // Event tracking now handled by OpenTelemetry spans

            // Setup abort signal listener
            agentSetupAbortSignalListener(oc);

            methodLogger.debug("Starting agent llm call");

            methodLogger.debug("[LLM] - Generating text", {
              messages: messages.map((msg) => ({
                role: msg.role,
                content: msg.content,
              })),
              maxSteps,
              tools: tools ? Object.keys(tools) : [],
            });

            const {
              aiSDKOptions,
              output,
              providerOptions,
              onEnd: userOnEnd,
              onStepEnd: userOnStepEnd,
            } = extractAISDKCallOptions<TProviderOptions, TOOLS, RUNTIME_CONTEXT, OUTPUT>(options);

            // Apply agent-level prepareStep as default (per-call overrides)
            if (statePrepareStep && !aiSDKOptions.prepareStep) {
              aiSDKOptions.prepareStep = statePrepareStep as AITextCallOptions<
                TOOLS,
                RUNTIME_CONTEXT,
                OUTPUT
              >["prepareStep"];
            }

            const forcedToolChoice = oc.systemContext.get(FORCED_TOOL_CHOICE_CONTEXT_KEY) as
              | ToolChoice<TOOLS>
              | undefined;
            applyForcedToolChoice(aiSDKOptions, forcedToolChoice);
            agentConfigureNativeToolExecution(aiSDKOptions, oc);
            agentConfigureStepModelRetries(aiSDKOptions, oc, "generateText", options);
            const {
              instructions: explicitInstructions,
              system: explicitSystem,
              ...aiSDKCallOptions
            } = aiSDKOptions;
            const promptOptions = splitInstructionsFromMessages(
              messages,
              explicitInstructions === undefined ? explicitSystem : explicitInstructions,
              aiSDKOptions.allowSystemInMessages,
            );

            const { result, modelName: effectiveModelName } = await agentExecuteWithModelFallback({
              oc,
              operation: "generateText",
              options,
              run: async ({
                model: resolvedModel,
                modelName: resolvedModelName,
                modelId,
                maxRetries,
                modelIndex,
                attempt,
                isLastAttempt: _isLastAttempt,
                isLastModel: _isLastModel,
              }) => {
                const llmSpan = agentCreateLLMSpan(oc, {
                  operation: "generateText",
                  modelName: resolvedModelName,
                  isStreaming: false,
                  messages,
                  tools,
                  providerOptions,
                  callOptions: {
                    temperature: aiSDKOptions?.temperature ?? stateTemperature,
                    maxOutputTokens: aiSDKOptions?.maxOutputTokens ?? stateMaxOutputTokens,
                    topP: aiSDKOptions?.topP,
                    stop: aiSDKOptions?.stop ?? options?.stop,
                    maxRetries,
                    modelIndex,
                    attempt,
                    modelId,
                  },
                });
                const finalizeLLMSpan = agentCreateLLMSpanFinalizer(llmSpan);

                try {
                  const response = await oc.traceContext.withSpan(llmSpan, () =>
                    generateTextWithVoltAgentTools<ToolSet, AISDKContext, OutputSpec>({
                      model: resolvedModel,
                      ...promptOptions,
                      tools,
                      // Default values
                      temperature: stateTemperature,
                      maxOutputTokens: stateMaxOutputTokens,
                      stopWhen: options?.stopWhen ?? stateStopWhen ?? isStepCount(maxSteps),
                      // User overrides from AI SDK options
                      ...aiSDKCallOptions,
                      maxRetries: 0,
                      // Structured output if provided
                      output,
                      // Provider-specific options
                      providerOptions,
                      // VoltAgent controlled (these should not be overridden)
                      abortSignal: oc.abortController.signal,
                      onEnd: userOnEnd,
                      onStepEnd: agentCreateStepHandler<ToolSet, AISDKContext>(
                        oc,
                        options,
                        userOnStepEnd as
                          | GenerationStepEndCallback<ToolSet, AISDKContext>
                          | undefined,
                      ),
                    } as unknown as VoltAgentGenerateTextCallOptions<
                      ToolSet,
                      AISDKContext,
                      OutputSpec
                    >),
                  );

                  await agentEnsureStructuredOutputGenerated({
                    result: response,
                    output,
                    tools,
                    maxSteps,
                  });

                  llmSpan.setAttribute("llm.model", agentGetEffectiveModelName(oc, resolvedModel));
                  const resolvedProviderUsage = response.usage
                    ? await Promise.resolve(response.usage)
                    : undefined;
                  finalizeLLMSpan(SpanStatusCode.OK, {
                    usage: resolvedProviderUsage,
                    finishReason: response.finishReason,
                    providerMetadata: (response as { providerMetadata?: unknown }).providerMetadata,
                  });

                  return response;
                } catch (error) {
                  const errorDetails = extractGenerationErrorDetails(error);
                  finalizeLLMSpan(SpanStatusCode.ERROR, {
                    message: (error as Error).message,
                    usage: errorDetails.usage,
                    finishReason: errorDetails.finishReason,
                    providerMetadata: errorDetails.providerMetadata,
                  });
                  throw error;
                }
              },
            });

            addModelAttributesToSpan(
              oc.traceContext.getRootSpan(),
              effectiveModelName,
              options,
              stateMaxOutputTokens,
              stateTemperature,
            );

            const providerUsage = result.usage ? await Promise.resolve(result.usage) : undefined;
            const usageForFinish = resolveFinishUsage({
              providerMetadata: (result as { providerMetadata?: unknown }).providerMetadata,
              usage: providerUsage,
              totalUsage: (result as { totalUsage?: LanguageModelUsage }).totalUsage,
            });
            agentRecordRootSpanUsageAndProviderCost(
              oc.traceContext,
              usageForFinish,
              (result as { providerMetadata?: unknown }).providerMetadata,
            );
            const { toolCalls: aggregatedToolCalls, toolResults: aggregatedToolResults } =
              agentCollectToolDataFromResult(result);

            const usageInfo = convertUsage(usageForFinish);
            const persistedAssistantMetadata = agentBuildPersistedAssistantMessageMetadata({
              oc,
              usage: usageInfo,
              finishReason: result.finishReason ?? null,
            });
            const responseMessages = filterResponseMessages(result.response?.messages);
            agentApplyMetadataToLastAssistantMessage({
              buffer,
              metadata: persistedAssistantMetadata,
              responseMessages,
            });
            const middlewareText = await runOutputMiddlewares<string>(
              result.text,
              oc,
              middlewareSet.output as NormalizedOutputMiddleware<string>[],
              "generateText",
              runtimeAgent,
              middlewareRetryCount,
              {
                usage: usageInfo,
                finishReason: result.finishReason ?? null,
                warnings: result.warnings ?? null,
              },
            );

            void agentRecordStepResults(result.steps, oc);

            if (!shouldDeferPersist && shouldPersistMemory) {
              await persistQueue.flush(buffer, oc);
            }

            const finalText = await executeOutputGuardrails({
              output: middlewareText,
              operationContext: oc,
              guardrails: guardrailSet.output,
              operation: "generateText",
              agent: runtimeAgent,
              metadata: {
                usage: usageInfo,
                finishReason: result.finishReason ?? null,
                warnings: result.warnings ?? null,
              },
            });

            // Preserve the native parsed value (and lazy missing-output errors) unless
            // middleware or guardrails changed the text. Reparse before success hooks
            // so schema failures do not report a successful operation or replay tools.
            const outputOverride =
              finalText === result.text
                ? {}
                : {
                    output: await (output ?? Output.text()).parseCompleteOutput(
                      { text: finalText },
                      {
                        response: result.response,
                        usage: result.finalStep?.usage ?? result.usage,
                        finishReason: result.finishReason,
                      },
                    ),
                  };

            await agentGetMergedHooks(options).onEnd?.({
              conversationId: oc.conversationId || "",
              agent: runtimeAgent,
              output: {
                text: finalText,
                usage: providerUsage,
                totalUsage: (result as { totalUsage?: LanguageModelUsage }).totalUsage,
                steps: result.steps,
                providerResponse: result.response,
                finishReason: result.finishReason,
                warnings: result.warnings,
                context: oc.context,
              },
              error: undefined,
              context: oc,
            });

            // Log successful completion with usage details
            const tokenInfo = usageForFinish
              ? `${usageForFinish.totalTokens} tokens`
              : "no usage data";
            methodLogger.debug(
              buildAgentLogMessage(
                stateName,
                ActionType.GENERATION_COMPLETE,
                `Text generation completed (${tokenInfo})`,
              ),
              {
                event: LogEvents.AGENT_GENERATION_COMPLETED,
                duration: Date.now() - startTime,
                finishReason: result.finishReason,
                usage: usageForFinish,
                toolCalls: aggregatedToolCalls.length,
                text: finalText,
              },
            );

            oc.traceContext.setOutput(finalText);
            oc.traceContext.setFinishReason(result.finishReason);

            // Check if stopped by maxSteps
            if (result.steps && result.steps.length >= maxSteps) {
              oc.traceContext.setStopConditionMet(result.steps.length, maxSteps);
            }

            // Set output in operation context
            oc.output = finalText;

            agentEnqueueEvalScoring({
              oc,
              output: finalText,
              operation: "generateText",
              metadata: {
                finishReason: result.finishReason,
                usage: usageForFinish ? JSON.parse(safeStringify(usageForFinish)) : undefined,
                toolCalls: aggregatedToolCalls,
              },
            });

            // Close span after scheduling scorers
            oc.traceContext.end("completed");

            if (feedbackPromise) {
              feedbackMetadata = await feedbackPromise;
            }

            if (feedbackMetadata) {
              const metadataApplied = buffer.addMetadataToLastAssistantMessage(
                { feedback: feedbackMetadata },
                { requirePending: true },
              );
              if (!metadataApplied) {
                const responseMessages = filterResponseMessages(result.response?.messages);
                if (responseMessages?.length) {
                  buffer.addModelMessages(responseMessages, "response");
                  buffer.addMetadataToLastAssistantMessage(
                    { feedback: feedbackMetadata },
                    { requirePending: true },
                  );
                }
              }
            }

            if (shouldDeferPersist && shouldPersistMemory) {
              await persistQueue.flush(buffer, oc);
            }

            const feedbackValue = (() => {
              if (!feedbackMetadata) {
                return null;
              }
              const metadata = feedbackMetadata;
              return createFeedbackHandleHelper({
                metadata,
                defaultUserId: oc.userId,
                defaultConversationId: oc.conversationId,
                resolveMessageId: () =>
                  findFeedbackMessageIdHelper(buffer.getAllMessages(), metadata),
                markFeedbackProvided: (input) => runtimeAgent.markFeedbackProvided(input),
              });
            })();

            const finalResult = cloneGenerateTextResultWithContext(result, {
              text: finalText,
              ...outputOverride,
              context: oc.context,
              toolCalls: aggregatedToolCalls,
              toolResults: aggregatedToolResults,
              feedback: feedbackValue,
            });

            return finalResult as unknown as GenerateTextResultWithContext<
              TOOLS,
              OUTPUT,
              RUNTIME_CONTEXT
            >;
          } catch (error) {
            if (agentShouldRetryMiddleware(error, middlewareRetryCount, maxMiddlewareRetries)) {
              const retryError = error as {
                middlewareId?: string;
                metadata?: unknown;
                message?: string;
              };
              await agentGetMergedHooks(options).onRetry?.({
                agent: runtimeAgent,
                context: oc,
                operation: "generateText",
                source: "middleware",
                middlewareId: retryError.middlewareId ?? null,
                retryCount: middlewareRetryCount,
                maxRetries: maxMiddlewareRetries,
                reason: retryError.message,
                metadata: retryError.metadata,
              });
              methodLogger.warn(`[Agent:${stateName}] - Middleware requested retry`, {
                operation: "generateText",
                retryCount: middlewareRetryCount,
                maxMiddlewareRetries,
                middlewareId: retryError.middlewareId ?? null,
                reason: retryError.message ?? "middleware retry",
                metadata:
                  retryError.metadata !== undefined
                    ? safeStringify(retryError.metadata)
                    : undefined,
              });
              agentStoreMiddlewareRetryFeedback(oc, retryError.message, retryError.metadata);
              middlewareRetryCount += 1;
              continue;
            }
            throw error;
          }
        }
      } catch (error) {
        // Check if this is a BailError (subagent early termination via abort)
        if (isBailError(error as Error)) {
          // Retrieve bailed result from systemContext
          const bailedResult = oc.systemContext.get("bailedResult") as
            | { agentName: string; response: string }
            | undefined;

          if (bailedResult) {
            methodLogger.info("Using bailed subagent result as final output (from abort)", {
              event: LogEvents.AGENT_GENERATION_COMPLETED,
              agentName: bailedResult.agentName,
              bailed: true,
            });

            const usageInfo: UsageInfo = {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
            };
            const providerUsage: LanguageModelUsage = {
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              inputTokenDetails: {
                noCacheTokens: 0,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
              },
              outputTokenDetails: {
                textTokens: 0,
                reasoningTokens: 0,
              },
            };

            // Apply guardrails to bailed result
            const finalText = await executeOutputGuardrails({
              output: bailedResult.response,
              operationContext: oc,
              guardrails: guardrailSet.output,
              operation: "generateText",
              agent: runtimeAgent,
              metadata: {
                usage: usageInfo,
                finishReason: "bail" as any,
                warnings: null,
              },
            });

            // Bail has no final model response. Use operation metadata and the
            // existing zero usage for parsing the guarded replacement value.
            const response = {
              id: oc.operationId,
              timestamp: new Date(startTime),
              modelId: runtimeAgent.getModelName(),
            };
            let finalOutput: unknown;
            try {
              finalOutput = await (options?.output ?? Output.text()).parseCompleteOutput(
                { text: finalText },
                { response, usage: providerUsage, finishReason: "stop" },
              );
            } catch (outputError) {
              await agentFlushPendingMessagesOnError(oc).catch(() => {});
              return agentHandleError(outputError as Error, oc, options, startTime);
            }

            // Call onEnd hook
            await agentGetMergedHooks(options).onEnd?.({
              conversationId: oc.conversationId || "",
              agent: runtimeAgent,
              output: {
                text: finalText,
                usage: providerUsage,
                totalUsage: providerUsage,
                providerResponse: undefined as any,
                finishReason: "bail" as any,
                warnings: undefined,
                context: oc.context,
              },
              error: undefined,
              context: oc,
            });

            void agentRecordStepResults(undefined, oc);

            // Return bailed result as successful generation
            return {
              text: finalText,
              output: finalOutput,
              usage: providerUsage,
              totalUsage: providerUsage,
              finishReason: "bail" as any,
              warnings: undefined,
              response,
              operationContext: oc,
              context: oc.context,
            } as any;
          }
        }

        await agentFlushPendingMessagesOnError(oc).catch(() => {});
        return agentHandleError(error as Error, oc, options, startTime);
      } finally {
        // Ensure all spans are exported before returning (critical for serverless)
        // Uses waitUntil if available to avoid blocking
        await flushObservability(
          agentGetObservability(),
          oc.logger ?? stateLogger,
          stateObservabilityAuthWarningState,
          "generateText:finally",
        );
      }
    });
  }

  /**
   * Stream text response
   */
  function agentStreamText<
    TProviderOptions extends ProviderOptions = ProviderOptions,
    TOOLS extends ToolSet = AGENT_TOOLS,
    RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
    OUTPUT extends OutputSpec = ReturnType<typeof Output.text>,
  >(
    input: string | UIMessage[] | BaseMessage[],
    ...options: TextGenerationOptionsArgs<
      StreamTextOptions<TProviderOptions, TOOLS, RUNTIME_CONTEXT, OUTPUT, CONTEXT_SCHEMA>
    >
  ): Promise<
    StreamTextResultWithContext<TOOLS, OUTPUT, RUNTIME_CONTEXT, AgentContext<CONTEXT_SCHEMA>>
  >;

  function agentStreamText<
    TProviderOptions extends ProviderOptions = ProviderOptions,
    TOOLS extends ToolSet = AGENT_TOOLS,
    RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
    OUTPUT extends OutputSpec = ReturnType<typeof Output.text>,
  >(
    request: StreamTextRequest<TProviderOptions, TOOLS, RUNTIME_CONTEXT, OUTPUT, CONTEXT_SCHEMA>,
  ): Promise<
    StreamTextResultWithContext<TOOLS, OUTPUT, RUNTIME_CONTEXT, AgentContext<CONTEXT_SCHEMA>>
  >;

  async function agentStreamText<
    TProviderOptions extends ProviderOptions = ProviderOptions,
    TOOLS extends ToolSet = AGENT_TOOLS,
    RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
    OUTPUT extends OutputSpec = ReturnType<typeof Output.text>,
  >(
    inputOrRequest:
      | string
      | UIMessage[]
      | BaseMessage[]
      | StreamTextRequest<TProviderOptions, TOOLS, RUNTIME_CONTEXT, OUTPUT, CONTEXT_SCHEMA>,
    ...requestOptions: [
      options?: StreamTextOptions<TProviderOptions, TOOLS, RUNTIME_CONTEXT, OUTPUT, CONTEXT_SCHEMA>,
    ]
  ): Promise<StreamTextResultWithContext<TOOLS, OUTPUT, RUNTIME_CONTEXT>> {
    const normalizedArgs = normalizeTextGenerationArgs(inputOrRequest, requestOptions[0]);
    const { input } = normalizedArgs;
    validateGenerationInput(input, normalizedArgs.options);
    const options = await agentValidateInvocationContext(normalizedArgs.options);
    const startTime = Date.now();
    const oc = agentCreateOperationContext(input, options);
    const feedbackOptions = agentResolveFeedbackOptions(options);
    const feedbackClient = feedbackOptions ? agentGetFeedbackClient() : undefined;
    const shouldDeferPersist = Boolean(feedbackOptions && feedbackClient);
    const shouldPersistMemory = agentShouldPersistMemoryForContext(oc);
    const feedbackDeferred = feedbackOptions
      ? createDeferred<AgentFeedbackMetadata | null>()
      : null;
    let feedbackMetadataValue: AgentFeedbackMetadata | null = null;
    let feedbackValue: AgentFeedbackHandle | null = null;
    let feedbackResolved = false;
    let feedbackFinalizeRequested = false;
    let feedbackApplied = false;
    let feedbackCancelled = false;
    let latestResponseMessages: ModelMessage[] | undefined;
    const resolveFeedbackDeferred = (value: AgentFeedbackMetadata | null) => {
      if (!feedbackDeferred || feedbackResolved) {
        return;
      }
      feedbackResolved = true;
      feedbackDeferred.resolve(value);
    };

    // Wrap entire execution in root span to ensure all logs have trace context
    const rootSpan = oc.traceContext.getRootSpan();
    return await oc.traceContext.withSpan(rootSpan, async () => {
      const methodLogger = oc.logger; // Extract logger with executionId
      const guardrailSet = agentResolveGuardrailSets(options);
      const middlewareSet = agentResolveMiddlewareSets(options);
      const maxMiddlewareRetries = agentResolveMiddlewareRetries(options);
      let middlewareRetryCount = 0;
      const buffer = agentGetConversationBuffer(oc);
      const persistQueue = agentGetMemoryPersistQueue(oc);
      const scheduleFeedbackPersist = (metadata: AgentFeedbackMetadata | null) => {
        if (!metadata || feedbackApplied) {
          return;
        }
        feedbackApplied = true;
        const metadataApplied = buffer.addMetadataToLastAssistantMessage(
          { feedback: metadata },
          { requirePending: true },
        );
        if (!metadataApplied && latestResponseMessages?.length) {
          buffer.addModelMessages(latestResponseMessages, "response");
          buffer.addMetadataToLastAssistantMessage(
            { feedback: metadata },
            { requirePending: true },
          );
        }
        if (shouldDeferPersist && shouldPersistMemory) {
          void persistQueue.flush(buffer, oc).catch((error) => {
            oc.logger?.debug?.("Failed to persist feedback metadata", { error });
          });
        }
      };
      const feedbackPromise =
        feedbackOptions && feedbackClient ? agentCreateFeedbackMetadata(oc, options) : null;
      if (feedbackPromise) {
        feedbackPromise
          .then((metadata) => {
            if (feedbackCancelled) {
              resolveFeedbackDeferred(null);
              return;
            }
            feedbackMetadataValue = metadata;
            feedbackValue = metadata
              ? createFeedbackHandleHelper({
                  metadata,
                  defaultUserId: oc.userId,
                  defaultConversationId: oc.conversationId,
                  resolveMessageId: () =>
                    findFeedbackMessageIdHelper(buffer.getAllMessages(), metadata),
                  markFeedbackProvided: (input) => runtimeAgent.markFeedbackProvided(input),
                })
              : null;
            resolveFeedbackDeferred(metadata);
            if (feedbackFinalizeRequested) {
              scheduleFeedbackPersist(metadata);
            }
          })
          .catch(() => resolveFeedbackDeferred(null));
      } else if (feedbackDeferred) {
        resolveFeedbackDeferred(null);
      }
      let effectiveInput: typeof input = input;
      let speculativeInputGuardrail: SpeculativeInputGuardrailRun | null = null;
      try {
        while (true) {
          try {
            effectiveInput = await runInputMiddlewares(
              input,
              oc,
              middlewareSet.input,
              "streamText",
              runtimeAgent,
              middlewareRetryCount,
            );
            break;
          } catch (error) {
            if (agentShouldRetryMiddleware(error, middlewareRetryCount, maxMiddlewareRetries)) {
              const retryError = error as {
                middlewareId?: string;
                metadata?: unknown;
                message?: string;
              };
              await agentGetMergedHooks(options).onRetry?.({
                agent: runtimeAgent,
                context: oc,
                operation: "streamText",
                source: "middleware",
                middlewareId: retryError.middlewareId ?? null,
                retryCount: middlewareRetryCount,
                maxRetries: maxMiddlewareRetries,
                reason: retryError.message,
                metadata: retryError.metadata,
              });
              methodLogger.warn(`[Agent:${stateName}] - Middleware requested retry`, {
                operation: "streamText",
                retryCount: middlewareRetryCount,
                maxMiddlewareRetries,
                middlewareId: retryError.middlewareId ?? null,
                reason: retryError.message ?? "middleware retry",
                metadata:
                  retryError.metadata !== undefined
                    ? safeStringify(retryError.metadata)
                    : undefined,
              });
              agentStoreMiddlewareRetryFeedback(oc, retryError.message, retryError.metadata);
              middlewareRetryCount += 1;
              continue;
            }
            throw error;
          }
        }

        const blockingInputGuardrails = guardrailSet.input.filter(
          (guardrail) => guardrail.execution !== "parallel",
        );
        const parallelInputGuardrails = guardrailSet.input.filter(
          (guardrail) => guardrail.execution === "parallel",
        );

        effectiveInput = await executeInputGuardrails(
          effectiveInput,
          oc,
          blockingInputGuardrails,
          "streamText",
          runtimeAgent,
        );

        if (parallelInputGuardrails.length > 0) {
          speculativeInputGuardrail = new SpeculativeInputGuardrailRun({
            input: effectiveInput,
            operationContext: oc,
            guardrails: parallelInputGuardrails,
            operation: "streamText",
            agent: runtimeAgent,
            buffer,
            onBlock: () => {
              feedbackCancelled = true;
              feedbackMetadataValue = null;
              feedbackValue = null;
              resolveFeedbackDeferred(null);
            },
          });
          oc.systemContext.set(SPECULATIVE_INPUT_GUARDRAIL_CONTEXT_KEY, speculativeInputGuardrail);
        }

        // No need to initialize stream collection anymore - we'll use UIMessageStreamWriter

        const { messages, uiMessages, modelName, tools, maxSteps } = await agentPrepareExecution(
          effectiveInput,
          oc,
          options,
        );
        const resolvedMemory = agentResolveMemoryRuntimeOptions(options, oc);
        const contextLimit = resolvedMemory.contextLimit;

        // Add model attributes to root span if TraceContext exists
        // Input is now set during TraceContext creation in createContext
        if (oc.traceContext) {
          const rootSpan = oc.traceContext.getRootSpan();
          // Add model attributes and all options
          addModelAttributesToSpan(
            rootSpan,
            modelName,
            options,
            stateMaxOutputTokens,
            stateTemperature,
          );

          // Add context to span
          const contextMap = Object.fromEntries(oc.context.entries());
          if (Object.keys(contextMap).length > 0) {
            rootSpan.setAttribute("agent.context", safeStringify(contextMap));
          }

          // Add messages (serialize to JSON string)
          rootSpan.setAttribute("agent.messages", safeStringify(messages));
          rootSpan.setAttribute("agent.messages.ui", safeStringify(uiMessages));

          // Add agent state snapshot for remote observability
          const agentState = runtimeAgent.getFullState();
          rootSpan.setAttribute("agent.stateSnapshot", safeStringify(agentState));
        }

        // Log stream start
        methodLogger.debug(
          buildAgentLogMessage(
            stateName,
            ActionType.STREAM_START,
            `Starting stream generation with ${modelName}`,
          ),
          {
            event: LogEvents.AGENT_STREAM_STARTED,
            operationType: "stream",
            contextLimit,
            memoryEnabled: !!stateMemoryManager.getMemory(),
            model: modelName,
            messageCount: messages?.length || 0,
            input: effectiveInput,
          },
        );

        // Call hooks
        await agentGetMergedHooks(options).onStart?.({ agent: runtimeAgent, context: oc });

        // Event tracking now handled by OpenTelemetry spans

        // Setup abort signal listener
        agentSetupAbortSignalListener(oc);

        const {
          aiSDKOptions,
          output,
          providerOptions,
          onEnd: userOnEnd,
          onStepEnd: userOnStepEnd,
          onError: userOnError,
        } = extractAISDKCallOptions<TProviderOptions, TOOLS, RUNTIME_CONTEXT, OUTPUT>(options);

        // Apply agent-level prepareStep as default (per-call overrides)
        if (statePrepareStep && !aiSDKOptions.prepareStep) {
          aiSDKOptions.prepareStep = statePrepareStep as AITextCallOptions<
            TOOLS,
            RUNTIME_CONTEXT,
            OUTPUT
          >["prepareStep"];
        }

        const forcedToolChoice = oc.systemContext.get(FORCED_TOOL_CHOICE_CONTEXT_KEY) as
          | ToolChoice<TOOLS>
          | undefined;
        applyForcedToolChoice(aiSDKOptions, forcedToolChoice);
        agentConfigureNativeToolExecution(aiSDKOptions, oc);
        agentConfigureStepModelRetries(aiSDKOptions, oc, "streamText", options);
        const {
          instructions: explicitInstructions,
          system: explicitSystem,
          ...aiSDKCallOptions
        } = aiSDKOptions;
        const promptOptions = splitInstructionsFromMessages(
          messages,
          explicitInstructions === undefined ? explicitSystem : explicitInstructions,
          aiSDKOptions.allowSystemInMessages,
        );

        const responseMessageId = await agentEnsureStreamingResponseMessageId(oc, buffer);
        const guardrailStreamingEnabled = guardrailSet.output.length > 0;

        let guardrailPipeline: GuardrailPipeline | null = null;
        let sanitizedTextPromise: Promise<string> | undefined;
        const { result, modelName: effectiveModelName } = await agentExecuteWithModelFallback({
          oc,
          operation: "streamText",
          options,
          run: async ({
            model: resolvedModel,
            modelName: resolvedModelName,
            modelId,
            maxRetries,
            modelIndex,
            attempt,
          }) => {
            const attemptState: { hasOutput: boolean; lastError?: unknown } = {
              hasOutput: false,
            };
            const llmSpan = agentCreateLLMSpan(oc, {
              operation: "streamText",
              modelName: resolvedModelName,
              isStreaming: true,
              messages,
              tools,
              providerOptions,
              callOptions: {
                temperature: aiSDKOptions?.temperature ?? stateTemperature,
                maxOutputTokens: aiSDKOptions?.maxOutputTokens ?? stateMaxOutputTokens,
                topP: aiSDKOptions?.topP,
                stop: aiSDKOptions?.stop ?? options?.stop,
                maxRetries,
                modelIndex,
                attempt,
                modelId,
              },
            });
            const finalizeLLMSpan = agentCreateLLMSpanFinalizer(llmSpan);

            const nativeStreamRetriesEnabled = options?.streamRetries !== undefined;
            const handleTerminalError = async (
              errorData: { error: unknown },
              notifyUser = true,
            ) => {
              // Handle nested error structure from OpenAI and other providers
              // The error might be directly the error or wrapped in { error: ... }
              const actualError = (errorData as any)?.error || errorData;
              attemptState.lastError = actualError;

              // Check if this is a BailError (subagent early termination)
              // This is not a real error - it's a signal that execution should stop
              if (isBailError(actualError)) {
                methodLogger.info("Stream aborted due to subagent bail (not an error)", {
                  agentName: actualError.agentName,
                  event: LogEvents.AGENT_GENERATION_COMPLETED,
                });

                // Don't log as error, don't call error hooks
                // onFinish will be called and will handle span ending with correct finish reason
                return;
              }

              resolveFeedbackDeferred(null);

              let userOnErrorError: unknown;
              if (notifyUser && userOnError) {
                try {
                  await userOnError(errorData as { error: unknown });
                } catch (error) {
                  userOnErrorError = error;
                }
              }

              // Log the error
              methodLogger.error("Stream error occurred", {
                error: actualError,
                agentName: stateName,
                modelName: agentGetEffectiveModelName(oc, resolvedModel),
                attempt,
                maxRetries,
              });

              finalizeLLMSpan(SpanStatusCode.ERROR, { message: (actualError as Error)?.message });

              // Call error hooks if they exist
              await agentGetMergedHooks(options).onError?.({
                agent: runtimeAgent,
                error: actualError as Error,
                context: oc,
              });

              // Close OpenTelemetry span with error status
              oc.traceContext.end("error", actualError as Error);

              // Let provider errors remain stream errors. If the user's
              // AI SDK onError callback throws, propagate that after
              // VoltAgent cleanup, matching the native stream callback path.
              // Ensure spans are flushed on error.
              // Uses waitUntil if available to avoid blocking
              try {
                if (userOnErrorError) {
                  throw userOnErrorError;
                }
              } finally {
                await flushObservability(
                  agentGetObservability(),
                  oc.logger ?? stateLogger,
                  stateObservabilityAuthWarningState,
                  "streamText:onError",
                );
              }
            };
            const streamResult = streamTextWithVoltAgentTools<ToolSet, AISDKContext, OutputSpec>({
              model: resolvedModel,
              ...promptOptions,
              tools,
              // Default values
              temperature: stateTemperature,
              maxOutputTokens: stateMaxOutputTokens,
              stopWhen: options?.stopWhen ?? stateStopWhen ?? isStepCount(maxSteps),
              // User overrides from AI SDK options
              ...aiSDKCallOptions,
              maxRetries: 0,
              // Structured output if provided
              output,
              // Provider-specific options
              providerOptions,
              // VoltAgent controlled (these should not be overridden)
              abortSignal: oc.abortController.signal,
              onStepEnd: agentCreateStepHandler<ToolSet, AISDKContext>(
                oc,
                options,
                userOnStepEnd as GenerationStepEndCallback<ToolSet, AISDKContext> | undefined,
              ),
              onError: nativeStreamRetriesEnabled ? userOnError : handleTerminalError,
              experimental_transform: nativeStreamRetriesEnabled
                ? observeTerminalStreamErrors(aiSDKCallOptions.experimental_transform, (error) =>
                    handleTerminalError({ error }, false),
                  )
                : aiSDKCallOptions.experimental_transform,
              onEnd: async (finalResult: any) => {
                await invokeAISDKCallbackSafely(
                  userOnEnd,
                  finalResult,
                  oc.logger ?? stateLogger,
                  "onEnd",
                );

                llmSpan.setAttribute("llm.model", agentGetEffectiveModelName(oc, resolvedModel));
                latestResponseMessages = filterResponseMessages(finalResult.response?.messages);
                const providerUsage = finalResult.usage
                  ? await Promise.resolve(finalResult.usage)
                  : undefined;
                const usageForFinish = resolveFinishUsage({
                  providerMetadata: finalResult.providerMetadata,
                  usage: providerUsage,
                  totalUsage: finalResult.totalUsage,
                });
                agentRecordRootSpanUsageAndProviderCost(
                  oc.traceContext,
                  usageForFinish,
                  finalResult.providerMetadata,
                );
                finalizeLLMSpan(SpanStatusCode.OK, {
                  usage: providerUsage,
                  finishReason: finalResult.finishReason,
                  providerMetadata: finalResult.providerMetadata,
                });

                if (speculativeInputGuardrail) {
                  const inputGuardrailDecision = await speculativeInputGuardrail.wait();
                  if (inputGuardrailDecision.status === "blocked") {
                    return;
                  }
                }

                const usageInfo = convertUsage(usageForFinish);
                const persistedAssistantMetadata = agentBuildPersistedAssistantMessageMetadata({
                  oc,
                  usage: usageInfo,
                  finishReason: finalResult.finishReason ?? null,
                });
                agentApplyMetadataToLastAssistantMessage({
                  buffer,
                  metadata: persistedAssistantMetadata,
                  responseMessages: latestResponseMessages,
                });

                if (!shouldDeferPersist && shouldPersistMemory) {
                  await persistQueue.flush(buffer, oc);
                }

                // History update removed - using OpenTelemetry only

                // Event tracking now handled by OpenTelemetry spans
                let finalText: string;

                // Check if we aborted due to subagent bail (early termination)
                const bailedResult = oc.systemContext.get("bailedResult") as
                  | { agentName: string; response: string }
                  | undefined;

                if (bailedResult) {
                  // Use the bailed result instead of the supervisor's output
                  methodLogger.info("Using bailed subagent result as final output", {
                    event: LogEvents.AGENT_GENERATION_COMPLETED,
                    agentName: bailedResult.agentName,
                    bailed: true,
                  });

                  // Apply guardrails to bailed result
                  if (guardrailSet.output.length > 0) {
                    finalText = await executeOutputGuardrails({
                      output: bailedResult.response,
                      operationContext: oc,
                      guardrails: guardrailSet.output,
                      operation: "streamText",
                      agent: runtimeAgent,
                      metadata: {
                        usage: usageInfo,
                        finishReason: "bail" as any,
                        warnings: finalResult.warnings ?? null,
                      },
                    });
                  } else {
                    finalText = bailedResult.response;
                  }
                } else if (guardrailPipeline) {
                  finalText = await getSanitizedTextPromise();
                } else if (guardrailSet.output.length > 0) {
                  finalText = await executeOutputGuardrails({
                    output: finalResult.text,
                    operationContext: oc,
                    guardrails: guardrailSet.output,
                    operation: "streamText",
                    agent: runtimeAgent,
                    metadata: {
                      usage: usageInfo,
                      finishReason: finalResult.finishReason ?? null,
                      warnings: finalResult.warnings ?? null,
                    },
                  });
                } else {
                  finalText = finalResult.text;
                }

                oc.traceContext.setOutput(finalText);

                void agentRecordStepResults(finalResult.steps, oc);

                // Set finish reason - override to "stop" if bailed (not "error")
                if (bailedResult) {
                  oc.traceContext.setFinishReason("stop" as any);
                } else {
                  oc.traceContext.setFinishReason(finalResult.finishReason);
                }

                // Check if stopped by maxSteps
                const steps = finalResult.steps;
                if (steps && steps.length >= maxSteps) {
                  oc.traceContext.setStopConditionMet(steps.length, maxSteps);
                }

                // Set output in operation context
                oc.output = finalText;
                // Call hooks with standardized output (stream finish result)
                await agentGetMergedHooks(options).onEnd?.({
                  conversationId: oc.conversationId || "",
                  agent: runtimeAgent,
                  output: {
                    text: finalText,
                    usage: providerUsage,
                    totalUsage: finalResult.totalUsage,
                    steps: finalResult.steps,
                    providerResponse: finalResult.response,
                    finishReason: finalResult.finishReason,
                    warnings: finalResult.warnings,
                    context: oc.context,
                  },
                  error: undefined,
                  context: oc,
                });

                const tokenInfo = usageInfo ? `${usageInfo.totalTokens} tokens` : "no usage data";
                methodLogger.debug(
                  buildAgentLogMessage(
                    stateName,
                    ActionType.GENERATION_COMPLETE,
                    `Text generation completed (${tokenInfo})`,
                  ),
                  {
                    event: LogEvents.AGENT_GENERATION_COMPLETED,
                    duration: Date.now() - startTime,
                    finishReason: finalResult.finishReason,
                    usage: usageForFinish,
                    toolCalls: finalResult.toolCalls?.length || 0,
                    text: finalText,
                  },
                );

                agentEnqueueEvalScoring({
                  oc,
                  output: finalText,
                  operation: "streamText",
                  metadata: {
                    finishReason: finalResult.finishReason,
                    usage: usageForFinish ? JSON.parse(safeStringify(usageForFinish)) : undefined,
                    toolCalls: finalResult.toolCalls,
                  },
                });

                finalizeLLMSpan(SpanStatusCode.OK, {
                  usage: usageForFinish,
                  finishReason: finalResult.finishReason,
                  providerMetadata: finalResult.providerMetadata,
                });

                oc.traceContext.end("completed");

                feedbackFinalizeRequested = true;

                if (!feedbackResolved && feedbackDeferred) {
                  await feedbackDeferred.promise;
                }

                if (feedbackResolved && feedbackMetadataValue) {
                  scheduleFeedbackPersist(feedbackMetadataValue);
                } else if (shouldDeferPersist && shouldPersistMemory) {
                  void persistQueue.flush(buffer, oc).catch((error) => {
                    oc.logger?.debug?.("Failed to persist deferred messages", { error });
                  });
                }

                // Schedule span flush without blocking the response
                void flushObservability(
                  agentGetObservability(),
                  oc.logger ?? stateLogger,
                  stateObservabilityAuthWarningState,
                  "streamText:onFinish",
                );
              },
            } as unknown as VoltAgentStreamTextCallOptions<ToolSet, AISDKContext, OutputSpec>);

            const originalFullStream = streamResult.stream;
            const probeResult = await agentProbeStreamStart(originalFullStream, attemptState);
            const streamResultForConsumption = agentWithProbedFullStream(
              streamResult,
              originalFullStream,
              probeResult.stream,
            );

            if (
              probeResult.status === "error" &&
              speculativeInputGuardrail?.getDecision()?.status !== "blocked"
            ) {
              agentDiscardStream(streamResultForConsumption.stream);
              throw probeResult.error;
            }

            return streamResultForConsumption;
          },
        });

        if (oc.traceContext) {
          addModelAttributesToSpan(
            oc.traceContext.getRootSpan(),
            effectiveModelName,
            options,
            stateMaxOutputTokens,
            stateTemperature,
          );
        }

        // Capture the agent instance for use in helpers
        type ToUIMessageStreamOptions = Parameters<typeof result.toUIMessageStream>[0];
        type ToUIMessageStreamResponseOptions = Parameters<
          typeof result.toUIMessageStreamResponse
        >[0];
        type ToUIMessageStreamReturn = ReturnType<typeof result.toUIMessageStream>;
        type UIStreamChunk = ToUIMessageStreamReturn extends AsyncIterable<infer Chunk>
          ? Chunk
          : never;

        const applyResponseMessageId = (
          streamOptions?: ToUIMessageStreamOptions,
        ): ToUIMessageStreamOptions | undefined => {
          if (!responseMessageId) {
            return streamOptions;
          }
          return {
            ...(streamOptions ?? {}),
            generateMessageId: () => responseMessageId,
          };
        };
        const applyResponseMessageIdToStream = (
          baseStream: AsyncIterable<VoltAgentTextStreamPart>,
        ): AsyncIterable<VoltAgentTextStreamPart> => {
          if (!responseMessageId) {
            return baseStream;
          }
          return (async function* () {
            for await (const part of baseStream) {
              if (part.type !== "start" && part.type !== "start-step") {
                yield part;
                continue;
              }
              const currentMessageId = (part as { messageId?: string }).messageId;
              if (currentMessageId === responseMessageId) {
                yield part;
                continue;
              }
              yield { ...part, messageId: responseMessageId };
            }
          })();
        };

        const createBaseFullStream = (): AsyncIterable<VoltAgentTextStreamPart> => {
          // Wrap the base stream with abort handling
          const wrapWithAbortHandling = async function* (
            baseStream: AsyncIterable<VoltAgentTextStreamPart>,
          ): AsyncIterable<VoltAgentTextStreamPart> {
            const iterator = baseStream[Symbol.asyncIterator]();

            try {
              while (true) {
                // Check if aborted before reading next chunk
                if (oc.abortController.signal.aborted) {
                  // Clean exit - stream is done
                  return;
                }

                // Try to read next chunk - may throw if stream is aborted
                let iterResult: IteratorResult<VoltAgentTextStreamPart>;
                try {
                  iterResult = await iterator.next();
                } catch (error) {
                  // If aborted, reader.read() may throw AbortError - treat as clean exit
                  if (oc.abortController.signal.aborted) {
                    return; // Clean exit, no error propagation
                  }
                  // Other errors should propagate to user code
                  throw error;
                }

                const { done, value } = iterResult;

                if (done) {
                  return;
                }

                yield value;
              }
            } finally {
              // No manual cleanup needed - AI SDK's AsyncIterableStream handles
              // its own cleanup when the generator returns. Calling iterator.return()
              // would cause ERR_INVALID_STATE since the reader is already detached.
            }
          };

          const parentStream = applyResponseMessageIdToStream(
            normalizeFinishUsageStream(wrapWithAbortHandling(result.stream)),
          );

          if (stateSubAgentManager.hasSubAgents()) {
            const createMergedFullStream =
              async function* (): AsyncIterable<VoltAgentTextStreamPart> {
                const { readable, writable } = new TransformStream<VoltAgentTextStreamPart>();
                const writer = writable.getWriter();

                oc.systemContext.set("fullStreamWriter", writer);

                const writeParentStream = async () => {
                  try {
                    for await (const part of parentStream) {
                      // No manual abort check needed - wrapper handles it
                      await writer.write(part as VoltAgentTextStreamPart);
                    }
                  } finally {
                    // Ensure the merged stream is closed when the parent stream finishes.
                    // This allows the reader loop below to exit with done=true and lets
                    // callers (e.g., SSE) observe completion.
                    try {
                      await writer.close();
                    } catch (_) {
                      // Ignore double-close or stream state errors
                    }
                  }
                };

                const parentPromise = writeParentStream();
                const reader = readable.getReader();

                try {
                  while (true) {
                    // Check abort before reading
                    if (oc.abortController.signal.aborted) {
                      break;
                    }

                    const { done, value } = await reader.read();
                    if (done) break;
                    if (value !== undefined) {
                      yield value;
                    }
                  }
                } finally {
                  reader.releaseLock();
                  await parentPromise;
                  // writeParentStream() already closes the writer in its own
                  // finally block. By the time we reach here the stream is
                  // typically already closed, so guard against the "Invalid
                  // state: WritableStream is closed" error.
                  try {
                    await writer.close();
                  } catch {
                    // Already closed – safe to ignore.
                  }
                }
              };

            return createMergedFullStream();
          }

          // For non-subagent case, wrap the stream with abort handling and usage normalization
          return parentStream;
        };

        const guardrailContext = guardrailStreamingEnabled
          ? {
              guardrails: guardrailSet.output,
              agent: runtimeAgent,
              operationContext: oc,
              operation: "streamText" as AgentEvalOperationType,
            }
          : null;

        const baseFullStreamForPipeline = guardrailStreamingEnabled
          ? createBaseFullStream()
          : undefined;

        const createSanitizedTextPromise = (): Promise<string> => {
          if (speculativeInputGuardrail) {
            return speculativeInputGuardrail.wait().then((decision) => {
              if (decision.status === "blocked") {
                return decision.message;
              }
              return createSanitizedTextPromiseWithoutInputGate();
            });
          }

          return createSanitizedTextPromiseWithoutInputGate();
        };

        const createSanitizedTextPromiseWithoutInputGate = (): Promise<string> => {
          if (guardrailPipeline) {
            return guardrailPipeline.finalizePromise.then(async () => {
              const sanitized = guardrailPipeline?.runner?.getSanitizedText();
              if (typeof sanitized === "string") {
                return sanitized;
              }
              // Wait for AI SDK text first (stream must complete)
              const aiSdkText = await result.text;

              // NOW check for bailed result (set during stream processing)
              const bailedResult = oc.systemContext.get("bailedResult") as
                | { agentName: string; response: string }
                | undefined;
              return bailedResult?.response || aiSdkText;
            });
          }

          // Wrap result.text with a bail check
          // IMPORTANT: Wait for AI SDK text first (stream must complete/abort)
          // This ensures createStepHandler has processed tool results and set bailedResult
          return Promise.resolve(result.text).then((aiSdkText) => {
            // NOW check if bailed (set by createStepHandler during stream processing)
            const bailedResult = oc.systemContext.get("bailedResult") as
              | { agentName: string; response: string }
              | undefined;

            // Return bailed subagent's result instead of supervisor's (if bailed)
            return bailedResult?.response || aiSdkText;
          });
        };

        const getSanitizedTextPromise = (): Promise<string> => {
          sanitizedTextPromise ??= createSanitizedTextPromise();
          return sanitizedTextPromise;
        };

        if (guardrailStreamingEnabled) {
          guardrailPipeline = createGuardrailPipeline(
            baseFullStreamForPipeline as AsyncIterable<VoltAgentTextStreamPart>,
            result.textStream,
            guardrailContext,
            undefined,
            () => result.text,
          );
          void guardrailPipeline.finalizePromise.catch(() => {
            // The guarded streams surface this error to their consumers. Keep the
            // internal finalizer promise from leaking when text is never requested.
          });
        }

        const getGuardrailAwareFullStream = replayableStream<VoltAgentTextStreamPart>(() => {
          if (guardrailPipeline) {
            return applySpeculativeInputGuardrailToFullStream({
              baseStream: guardrailPipeline.fullStream,
              guardrail: speculativeInputGuardrail,
              responseMessageId: responseMessageId ?? undefined,
            });
          }
          return applySpeculativeInputGuardrailToFullStream({
            baseStream: createBaseFullStream(),
            guardrail: speculativeInputGuardrail,
            responseMessageId: responseMessageId ?? undefined,
          });
        });

        const getGuardrailAwareTextStream = replayableStream<string>(() => {
          if (guardrailPipeline) {
            return applySpeculativeInputGuardrailToTextStream({
              baseStream: guardrailPipeline.textStream,
              guardrail: speculativeInputGuardrail,
            });
          }
          return applySpeculativeInputGuardrailToTextStream({
            baseStream: result.textStream,
            guardrail: speculativeInputGuardrail,
          });
        });

        const getGuardrailAwareUIStream = (
          streamOptions?: ToUIMessageStreamOptions,
        ): ToUIMessageStreamReturn => {
          if (!guardrailPipeline) {
            return applySpeculativeInputGuardrailToUIStream({
              baseStream: result.toUIMessageStream(streamOptions as any),
              guardrail: speculativeInputGuardrail,
              responseMessageId: responseMessageId ?? undefined,
            });
          }
          return applySpeculativeInputGuardrailToUIStream({
            baseStream: guardrailPipeline.createUIStream(
              streamOptions as any,
            ) as ToUIMessageStreamReturn,
            guardrail: speculativeInputGuardrail,
            responseMessageId: responseMessageId ?? undefined,
          });
        };

        const assertOutputAllowed = async (): Promise<void> => {
          const decision = await speculativeInputGuardrail?.wait();
          if (decision?.status === "blocked") throw decision.error;
          await guardrailPipeline?.finalizePromise;
        };

        const outputSpecification = output ?? Output.text();
        let guardedOutputPromise: Promise<unknown> | undefined;
        const getStructuredOutputText = async (): Promise<string> => {
          await assertOutputAllowed();
          return guardrailPipeline?.runner?.getSanitizedText() ?? (await result.text);
        };
        const getGuardedOutput = (): typeof result.output => {
          guardedOutputPromise ??= (async () => {
            await assertOutputAllowed();
            if (!output) return getSanitizedTextPromise();
            if (!guardrailPipeline) return result.output;
            const [text, step] = await Promise.all([getStructuredOutputText(), result.finalStep]);
            return outputSpecification.parseCompleteOutput(
              { text },
              { response: step.response, usage: step.usage, finishReason: step.finishReason },
            );
          })();
          return guardedOutputPromise;
        };

        // A final guardrail may replace or reject previously streamed text.
        // Structured values wait for that decision before parsing sanitized text.
        const guardedPartialOutput = async function* () {
          await getGuardedOutput();
          const parsed = await outputSpecification.parsePartialOutput({
            text: await getStructuredOutputText(),
          });
          if (parsed !== undefined) yield parsed.partial;
        };

        const getGuardrailAwarePartialOutputStream = (): typeof result.partialOutputStream => {
          if (guardrailPipeline) return readableFromIterable(guardedPartialOutput());
          const partialOutputStream = result.partialOutputStream;
          if (!partialOutputStream) {
            return partialOutputStream;
          }
          return applySpeculativeInputGuardrailToPartialOutputStream({
            baseStream: partialOutputStream,
            guardrail: speculativeInputGuardrail,
          }) as typeof result.partialOutputStream;
        };

        const getGuardrailAwareElementStream = (): typeof result.elementStream => {
          if (!guardrailPipeline) {
            return applySpeculativeInputGuardrailToPartialOutputStream({
              baseStream: result.elementStream,
              guardrail: speculativeInputGuardrail,
            });
          }
          const transform = outputSpecification.createElementStreamTransform();
          // Preserve the SDK's unsupported-output-mode error.
          if (!transform) return result.elementStream;
          return readableFromIterable(
            (async function* () {
              for await (const partialOutput of guardedPartialOutput()) {
                yield {
                  part: {
                    type: "text-delta" as const,
                    id: "guarded-output",
                    text: await getStructuredOutputText(),
                  },
                  partialOutput,
                };
              }
            })(),
          ).pipeThrough(transform) as typeof result.elementStream;
        };

        const createMergedUIStream = (
          streamOptions?: ToUIMessageStreamOptions,
        ): ToUIMessageStreamReturn => {
          const resolvedStreamOptions = applyResponseMessageId(streamOptions);
          const mergedStream = createUIMessageStream({
            execute: async ({ writer }) => {
              oc.systemContext.set("uiStreamWriter", writer);
              writer.merge(getGuardrailAwareUIStream(resolvedStreamOptions));
            },
            onError: (error) => String(error),
          });

          return createAsyncIterableReadable<UIStreamChunk>(async (controller) => {
            const reader = mergedStream.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value !== undefined) {
                  controller.enqueue(value);
                }
              }
              controller.close();
            } catch (error) {
              controller.error(error);
            } finally {
              reader.releaseLock();
            }
          });
        };

        const attachFeedbackMetadata = (
          baseStream: ToUIMessageStreamReturn,
        ): ToUIMessageStreamReturn => {
          if (!feedbackDeferred) {
            return baseStream;
          }

          return createAsyncIterableReadable<UIStreamChunk>(async (controller) => {
            const reader = (baseStream as ReadableStream<UIStreamChunk>).getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value !== undefined) {
                  controller.enqueue(value);
                }
              }
              if (feedbackDeferred) {
                await feedbackDeferred.promise;
              }
              if (feedbackResolved && feedbackMetadataValue) {
                controller.enqueue({
                  type: "message-metadata",
                  messageMetadata: {
                    feedback: feedbackMetadataValue,
                  },
                } as UIStreamChunk);
              }
              controller.close();
            } catch (error) {
              controller.error(error);
            } finally {
              reader.releaseLock();
            }
          });
        };

        const toUIMessageStreamSanitized = (
          streamOptions?: ToUIMessageStreamOptions,
        ): ToUIMessageStreamReturn => {
          const resolvedStreamOptions = applyResponseMessageId(streamOptions);
          const needsGuardedCallbacks = Boolean(guardrailPipeline || speculativeInputGuardrail);
          const lifecycleOptions = resolvedStreamOptions as
            | (ToUIMessageStreamOptions &
                Pick<Parameters<typeof createUIMessageStream>[0], "onStepEnd" | "onStepFinish">)
            | undefined;
          const baseOptions = needsGuardedCallbacks
            ? {
                ...resolvedStreamOptions,
                onEnd: undefined,
                onFinish: undefined,
                onStepEnd: undefined,
                onStepFinish: undefined,
              }
            : resolvedStreamOptions;
          const baseStream = stateSubAgentManager.hasSubAgents()
            ? createMergedUIStream(baseOptions)
            : getGuardrailAwareUIStream(baseOptions);
          const stream = attachFeedbackMetadata(baseStream);
          if (!needsGuardedCallbacks) return stream;
          // Completion callbacks must observe what the UI actually received,
          // including an input-block replacement and output redactions.
          return createUIMessageStream({
            originalMessages: lifecycleOptions?.originalMessages,
            generateId: lifecycleOptions?.generateMessageId,
            onEnd: lifecycleOptions?.onEnd ?? lifecycleOptions?.onFinish,
            onStepEnd: lifecycleOptions?.onStepEnd ?? lifecycleOptions?.onStepFinish,
            onError: lifecycleOptions?.onError,
            execute: ({ writer }) => writer.merge(stream),
          }) as ToUIMessageStreamReturn;
        };

        const toUIMessageStreamResponseSanitized = (
          options?: ToUIMessageStreamResponseOptions,
        ): ReturnType<typeof result.toUIMessageStreamResponse> => {
          const streamOptions = options as ToUIMessageStreamOptions | undefined;
          const stream = toUIMessageStreamSanitized(streamOptions);
          const responseInit = options ? { ...options } : {};
          return createUIMessageStreamResponse({
            stream,
            ...responseInit,
          });
        };

        const pipeUIMessageStreamToResponseSanitized = (
          response: Parameters<typeof result.pipeUIMessageStreamToResponse>[0],
          init?: Parameters<typeof result.pipeUIMessageStreamToResponse>[1],
        ): void => {
          const streamOptions = init as ToUIMessageStreamOptions | undefined;
          const stream = toUIMessageStreamSanitized(streamOptions);
          const initOptions = init ? { ...init } : {};
          pipeUIMessageStreamToResponse({
            response: response as any,
            stream,
            ...initOptions,
          });
        };

        // Create a wrapper that includes context and delegates to the original result
        const resultWithContext = delegateStreamResult(
          result,
          {
            get text() {
              return getSanitizedTextPromise();
            },
            get textStream() {
              return getGuardrailAwareTextStream();
            },
            get stream() {
              return getGuardrailAwareFullStream();
            },
            get fullStream() {
              return getGuardrailAwareFullStream();
            },
            get usage() {
              return result.usage;
            },
            get totalUsage() {
              return result.totalUsage;
            },
            get steps() {
              return result.steps;
            },
            get finishReason() {
              return result.finishReason;
            },
            get partialOutputStream() {
              return getGuardrailAwarePartialOutputStream();
            },
            get experimental_partialOutputStream() {
              return getGuardrailAwarePartialOutputStream();
            },
            get elementStream() {
              return getGuardrailAwareElementStream();
            },
            get output() {
              return getGuardedOutput();
            },
            consumeStream: async (consumeOptions?: Parameters<typeof result.consumeStream>[0]) => {
              await consumeStream({
                stream: getGuardrailAwareFullStream(),
                onError: consumeOptions?.onError,
              });
            },
            toUIMessageStream: toUIMessageStreamSanitized as typeof result.toUIMessageStream,
            toUIMessageStreamResponse:
              toUIMessageStreamResponseSanitized as typeof result.toUIMessageStreamResponse,
            pipeUIMessageStreamToResponse:
              pipeUIMessageStreamToResponseSanitized as typeof result.pipeUIMessageStreamToResponse,
            pipeTextStreamToResponse: (
              response: Parameters<typeof result.pipeTextStreamToResponse>[0],
              init?: Parameters<typeof result.pipeTextStreamToResponse>[1],
            ) => {
              pipeTextStreamToResponse({
                response,
                stream: getGuardrailAwareTextStream() as ReadableStream<string>,
                ...(init ?? {}),
              });
            },
            toTextStreamResponse: (init?: Parameters<typeof result.toTextStreamResponse>[0]) => {
              return createTextStreamResponse({
                stream: getGuardrailAwareTextStream() as ReadableStream<string>,
                ...(init ?? {}),
              });
            },
            context: oc.context,
            get feedback() {
              return feedbackValue;
            },
          },
          assertOutputAllowed,
        );

        return resultWithContext as unknown as StreamTextResultWithContext<
          TOOLS,
          OUTPUT,
          RUNTIME_CONTEXT
        >;
      } catch (error) {
        await agentFlushPendingMessagesOnError(oc).catch(() => {});
        // Ensure spans are exported on pre-stream errors
        await flushObservability(
          agentGetObservability(),
          oc.logger ?? stateLogger,
          stateObservabilityAuthWarningState,
          "streamText:preStreamError",
        );
        return agentHandleError(error as Error, oc, options, startTime);
      } finally {
        // No need to flush here for streams - handled in onFinish/onError
      }
    });
  }

  /**
   * Generate structured object
   * @deprecated — Use generateText with an output setting instead.
   */
  function agentGenerateObject<
    T extends z.ZodType,
    TProviderOptions extends ProviderOptions = ProviderOptions,
  >(
    originalInput: string | UIMessage[] | BaseMessage[],
    schema: T,
    ...rawOptions: TextGenerationOptionsArgs<
      GenerateObjectOptions<TProviderOptions, CONTEXT_SCHEMA>
    >
  ): Promise<GenerateObjectResultWithContext<z.infer<T>, AgentContext<CONTEXT_SCHEMA>>>;

  async function agentGenerateObject<
    T extends z.ZodType,
    TProviderOptions extends ProviderOptions = ProviderOptions,
  >(
    originalInput: string | UIMessage[] | BaseMessage[],
    schema: T,
    ...rawOptions: TextGenerationOptionsArgs<
      GenerateObjectOptions<TProviderOptions, CONTEXT_SCHEMA>
    >
  ): Promise<GenerateObjectResultWithContext<z.infer<T>>> {
    const input = originalInput;
    const normalizedOptions = normalizeVoltAgentRuntimeOptions(rawOptions[0]);
    validateGenerationInput(input, normalizedOptions);
    const options = await agentValidateInvocationContext(normalizedOptions);
    const startTime = Date.now();
    const oc = agentCreateOperationContext(input, options);
    const methodLogger = oc.logger;

    // Wrap entire execution in root span for trace context
    const rootSpan = oc.traceContext.getRootSpan();
    return await oc.traceContext.withSpan(rootSpan, async () => {
      const guardrailSet = agentResolveGuardrailSets(options);
      const middlewareSet = agentResolveMiddlewareSets(options);
      const maxMiddlewareRetries = agentResolveMiddlewareRetries(options);
      let middlewareRetryCount = 0;
      let effectiveInput: typeof input = input;
      try {
        while (true) {
          try {
            if (middlewareRetryCount > 0) {
              agentResetOperationAttemptState(oc);
            }

            effectiveInput = await runInputMiddlewares(
              input,
              oc,
              middlewareSet.input,
              "generateObject",
              runtimeAgent,
              middlewareRetryCount,
            );

            effectiveInput = await executeInputGuardrails(
              effectiveInput,
              oc,
              guardrailSet.input,
              "generateObject",
              runtimeAgent,
            );
            const { messages, uiMessages, modelName } = await agentPrepareExecution(
              effectiveInput,
              oc,
              options,
            );
            const schemaName = schema.description || "unknown";
            const objectOutput = Output.object({ schema, description: schema.description });

            // Add model attributes and all options
            addModelAttributesToSpan(
              rootSpan,
              modelName,
              options,
              stateMaxOutputTokens,
              stateTemperature,
            );

            // Add context to span
            const contextMap = Object.fromEntries(oc.context.entries());
            if (Object.keys(contextMap).length > 0) {
              rootSpan.setAttribute("agent.context", safeStringify(contextMap));
            }

            // Add messages (serialize to JSON string)
            rootSpan.setAttribute("agent.messages", safeStringify(messages));
            rootSpan.setAttribute("agent.messages.ui", safeStringify(uiMessages));

            // Add agent state snapshot for remote observability
            const agentState = runtimeAgent.getFullState();
            rootSpan.setAttribute("agent.stateSnapshot", safeStringify(agentState));

            // Log generation start (object)
            methodLogger.debug(
              buildAgentLogMessage(
                stateName,
                ActionType.GENERATION_START,
                `Starting object generation with ${modelName}`,
              ),
              {
                event: LogEvents.AGENT_GENERATION_STARTED,
                operationType: "object",
                schemaName,
                model: modelName,
                messageCount: messages?.length || 0,
                input: effectiveInput,
              },
            );

            // Call hooks
            await agentGetMergedHooks(options).onStart?.({ agent: runtimeAgent, context: oc });

            // Event tracking now handled by OpenTelemetry spans

            const {
              aiSDKOptions,
              providerOptions,
              onEnd: userOnEnd,
              onStepEnd: userOnStepEnd,
            } = extractAISDKCallOptions(options);
            agentConfigureStepModelRetries(aiSDKOptions, oc, "generateObject", options);
            const {
              instructions: explicitInstructions,
              system: explicitSystem,
              ...aiSDKCallOptions
            } = aiSDKOptions;
            const promptOptions = splitInstructionsFromMessages(
              messages,
              explicitInstructions === undefined ? explicitSystem : explicitInstructions,
              aiSDKOptions.allowSystemInMessages,
            );

            const { result, modelName: effectiveModelName } = await agentExecuteWithModelFallback({
              oc,
              operation: "generateObject",
              options,
              run: async ({ model: resolvedModel }) => {
                const response = await generateTextWithVoltAgentTools({
                  model: resolvedModel,
                  ...promptOptions,
                  // Default values
                  maxOutputTokens: stateMaxOutputTokens,
                  temperature: stateTemperature,
                  // User overrides from AI SDK options
                  ...aiSDKCallOptions,
                  maxRetries: 0,
                  // Structured output is routed through the AI SDK output API.
                  output: objectOutput,
                  // Provider-specific options
                  providerOptions,
                  // VoltAgent controlled
                  abortSignal: oc.abortController.signal,
                  onEnd: userOnEnd,
                  onStepEnd: agentCreateStepHandler(oc, options, userOnStepEnd),
                });

                await agentEnsureStructuredOutputGenerated({
                  result: response,
                  output: objectOutput,
                  tools: {},
                  maxSteps: 1,
                });

                return response;
              },
            });

            addModelAttributesToSpan(
              rootSpan,
              effectiveModelName,
              options,
              stateMaxOutputTokens,
              stateTemperature,
            );

            const providerUsage = result.usage ? await Promise.resolve(result.usage) : undefined;
            const usageForFinish = resolveFinishUsage({
              providerMetadata: (result as { providerMetadata?: unknown }).providerMetadata,
              usage: providerUsage,
              totalUsage: (result as { totalUsage?: LanguageModelUsage }).totalUsage,
            });
            agentRecordRootSpanUsageAndProviderCost(
              oc.traceContext,
              usageForFinish,
              (result as { providerMetadata?: unknown }).providerMetadata,
            );
            const usageInfo = convertUsage(usageForFinish);
            const generatedObject = result.output as z.infer<T>;
            const middlewareObject = await runOutputMiddlewares<z.infer<T>>(
              generatedObject,
              oc,
              middlewareSet.output as NormalizedOutputMiddleware<z.infer<T>>[],
              "generateObject",
              runtimeAgent,
              middlewareRetryCount,
              {
                usage: usageInfo,
                finishReason: result.finishReason ?? null,
                warnings: result.warnings ?? null,
              },
            );
            const finalObject = await executeOutputGuardrails({
              output: middlewareObject,
              operationContext: oc,
              guardrails: guardrailSet.output,
              operation: "generateObject",
              agent: runtimeAgent,
              metadata: {
                usage: usageInfo,
                finishReason: result.finishReason ?? null,
                warnings: result.warnings ?? null,
              },
            });

            // Save the object response to memory
            if (agentShouldPersistMemoryForContext(oc) && oc.userId && oc.conversationId) {
              // Create UIMessage from the object response
              const message: UIMessage = agentApplyMetadataToMessage(
                {
                  id: randomUUID(),
                  role: "assistant",
                  parts: [
                    {
                      type: "text",
                      text: safeStringify(finalObject),
                    },
                  ],
                },
                agentBuildPersistedAssistantMessageMetadata({
                  oc,
                  usage: usageInfo,
                  finishReason: result.finishReason ?? null,
                }),
              );

              // Save the message to memory
              await stateMemoryManager.saveMessage(oc, message, oc.userId, oc.conversationId);

              // Add step to history
              const step: StepWithContent = {
                id: randomUUID(),
                type: "text",
                content: safeStringify(finalObject),
                role: "assistant",
                usage: usageInfo,
              };
              agentAddStepToHistory(step, oc);
            }

            // History update removed - using OpenTelemetry only

            // Event tracking now handled by OpenTelemetry spans

            oc.traceContext.setOutput(finalObject);

            // Set output in operation context
            oc.output = finalObject as unknown as string | object;

            agentEnqueueEvalScoring({
              oc,
              output: finalObject,
              operation: "generateObject",
              metadata: {
                finishReason: result.finishReason,
                usage: usageForFinish ? JSON.parse(safeStringify(usageForFinish)) : undefined,
                schemaName,
              },
            });

            oc.traceContext.end("completed");

            // Call hooks
            await agentGetMergedHooks(options).onEnd?.({
              conversationId: oc.conversationId || "",
              agent: runtimeAgent,
              output: {
                object: finalObject,
                usage: providerUsage,
                totalUsage: (result as { totalUsage?: LanguageModelUsage }).totalUsage,
                steps: (result as { steps?: ReadonlyArray<StepResult<ToolSet>> }).steps,
                providerResponse: (result as any).response,
                finishReason: result.finishReason,
                warnings: result.warnings,
                context: oc.context,
              },
              error: undefined,
              context: oc,
            });

            // Log successful completion
            const tokenInfo = usageForFinish
              ? `${usageForFinish.totalTokens} tokens`
              : "no usage data";
            methodLogger.debug(
              buildAgentLogMessage(
                stateName,
                ActionType.GENERATION_COMPLETE,
                `Object generation completed (${tokenInfo})`,
              ),
              {
                event: LogEvents.AGENT_GENERATION_COMPLETED,
                duration: Date.now() - startTime,
                finishReason: result.finishReason,
                usage: usageForFinish,
                schemaName,
              },
            );

            // Return result with same context reference for consistency
            const finalResult = {
              ...result,
              reasoning: result.reasoningText,
              object: finalObject,
              toJsonResponse: (init?: ResponseInit) => Response.json(finalObject, init),
              context: oc.context,
            };

            return finalResult;
          } catch (error) {
            if (agentShouldRetryMiddleware(error, middlewareRetryCount, maxMiddlewareRetries)) {
              const retryError = error as {
                middlewareId?: string;
                metadata?: unknown;
                message?: string;
              };
              await agentGetMergedHooks(options).onRetry?.({
                agent: runtimeAgent,
                context: oc,
                operation: "generateObject",
                source: "middleware",
                middlewareId: retryError.middlewareId ?? null,
                retryCount: middlewareRetryCount,
                maxRetries: maxMiddlewareRetries,
                reason: retryError.message,
                metadata: retryError.metadata,
              });
              methodLogger.warn(`[Agent:${stateName}] - Middleware requested retry`, {
                operation: "generateObject",
                retryCount: middlewareRetryCount,
                maxMiddlewareRetries,
                middlewareId: retryError.middlewareId ?? null,
                reason: retryError.message ?? "middleware retry",
                metadata:
                  retryError.metadata !== undefined
                    ? safeStringify(retryError.metadata)
                    : undefined,
              });
              agentStoreMiddlewareRetryFeedback(oc, retryError.message, retryError.metadata);
              middlewareRetryCount += 1;
              continue;
            }
            throw error;
          }
        }
      } catch (error) {
        await agentFlushPendingMessagesOnError(oc).catch(() => {});
        return agentHandleError(error as Error, oc, options, startTime);
      } finally {
        // Ensure all spans are exported before returning (critical for serverless)
        // Uses waitUntil if available to avoid blocking
        await flushObservability(
          agentGetObservability(),
          oc.logger ?? stateLogger,
          stateObservabilityAuthWarningState,
          "generateObject:finally",
        );
      }
    });
  }

  /**
   * Stream structured object
   * @deprecated — Use streamText with an output setting instead.
   */
  function agentStreamObject<
    T extends z.ZodType,
    TProviderOptions extends ProviderOptions = ProviderOptions,
  >(
    originalInput: string | UIMessage[] | BaseMessage[],
    schema: T,
    ...rawOptions: TextGenerationOptionsArgs<StreamObjectOptions<TProviderOptions, CONTEXT_SCHEMA>>
  ): Promise<StreamObjectResultWithContext<z.infer<T>, AgentContext<CONTEXT_SCHEMA>>>;

  async function agentStreamObject<
    T extends z.ZodType,
    TProviderOptions extends ProviderOptions = ProviderOptions,
  >(
    originalInput: string | UIMessage[] | BaseMessage[],
    schema: T,
    ...rawOptions: TextGenerationOptionsArgs<StreamObjectOptions<TProviderOptions, CONTEXT_SCHEMA>>
  ): Promise<StreamObjectResultWithContext<z.infer<T>>> {
    const input = originalInput;
    const normalizedOptions = normalizeVoltAgentRuntimeOptions(rawOptions[0]);
    validateGenerationInput(input, normalizedOptions);
    const options = await agentValidateInvocationContext(normalizedOptions);
    const startTime = Date.now();
    const oc = agentCreateOperationContext(input, options);

    // Wrap entire execution in root span for trace context
    const rootSpan = oc.traceContext.getRootSpan();
    return await oc.traceContext.withSpan(rootSpan, async () => {
      const methodLogger = oc.logger; // Extract logger with executionId
      const guardrailSet = agentResolveGuardrailSets(options);
      const middlewareSet = agentResolveMiddlewareSets(options);
      const maxMiddlewareRetries = agentResolveMiddlewareRetries(options);
      let middlewareRetryCount = 0;
      let effectiveInput: typeof input = input;
      try {
        while (true) {
          try {
            effectiveInput = await runInputMiddlewares(
              input,
              oc,
              middlewareSet.input,
              "streamObject",
              runtimeAgent,
              middlewareRetryCount,
            );
            break;
          } catch (error) {
            if (agentShouldRetryMiddleware(error, middlewareRetryCount, maxMiddlewareRetries)) {
              const retryError = error as {
                middlewareId?: string;
                metadata?: unknown;
                message?: string;
              };
              await agentGetMergedHooks(options).onRetry?.({
                agent: runtimeAgent,
                context: oc,
                operation: "streamObject",
                source: "middleware",
                middlewareId: retryError.middlewareId ?? null,
                retryCount: middlewareRetryCount,
                maxRetries: maxMiddlewareRetries,
                reason: retryError.message,
                metadata: retryError.metadata,
              });
              methodLogger.warn(`[Agent:${stateName}] - Middleware requested retry`, {
                operation: "streamObject",
                retryCount: middlewareRetryCount,
                maxMiddlewareRetries,
                middlewareId: retryError.middlewareId ?? null,
                reason: retryError.message ?? "middleware retry",
                metadata:
                  retryError.metadata !== undefined
                    ? safeStringify(retryError.metadata)
                    : undefined,
              });
              agentStoreMiddlewareRetryFeedback(oc, retryError.message, retryError.metadata);
              middlewareRetryCount += 1;
              continue;
            }
            throw error;
          }
        }

        effectiveInput = await executeInputGuardrails(
          effectiveInput,
          oc,
          guardrailSet.input,
          "streamObject",
          runtimeAgent,
        );

        const { messages, uiMessages, modelName } = await agentPrepareExecution(
          effectiveInput,
          oc,
          options,
        );
        const schemaName = schema.description || "unknown";
        const objectOutput = Output.object({ schema, description: schema.description });

        // Add model attributes and all options
        addModelAttributesToSpan(
          rootSpan,
          modelName,
          options,
          stateMaxOutputTokens,
          stateTemperature,
        );

        // Add context to span
        const contextMap = Object.fromEntries(oc.context.entries());
        if (Object.keys(contextMap).length > 0) {
          rootSpan.setAttribute("agent.context", safeStringify(contextMap));
        }

        // Add messages (serialize to JSON string)
        rootSpan.setAttribute("agent.messages", safeStringify(messages));
        rootSpan.setAttribute("agent.messages.ui", safeStringify(uiMessages));

        // Add agent state snapshot for remote observability
        const agentState = runtimeAgent.getFullState();
        rootSpan.setAttribute("agent.stateSnapshot", safeStringify(agentState));

        // Log stream object start
        methodLogger.debug(
          buildAgentLogMessage(
            stateName,
            ActionType.STREAM_START,
            `Starting object stream generation with ${modelName}`,
          ),
          {
            event: LogEvents.AGENT_STREAM_STARTED,
            operationType: "object",
            schemaName: schemaName,
            model: modelName,
            messageCount: messages?.length || 0,
            input: effectiveInput,
          },
        );

        // Call hooks
        await agentGetMergedHooks(options).onStart?.({ agent: runtimeAgent, context: oc });

        // Event tracking now handled by OpenTelemetry spans

        const {
          aiSDKOptions,
          providerOptions,
          onEnd: userOnEnd,
          onStepEnd: userOnStepEnd,
          onError: userOnError,
        } = extractAISDKCallOptions(options);
        agentConfigureStepModelRetries(aiSDKOptions, oc, "streamObject", options);
        const {
          instructions: explicitInstructions,
          system: explicitSystem,
          ...aiSDKCallOptions
        } = aiSDKOptions;
        const promptOptions = splitInstructionsFromMessages(
          messages,
          explicitInstructions === undefined ? explicitSystem : explicitInstructions,
          aiSDKOptions.allowSystemInMessages,
        );

        let guardrailObjectPromise!: Promise<z.infer<T>>;
        let resolveGuardrailObject: ((value: z.infer<T>) => void) | undefined;
        let rejectGuardrailObject: ((reason: unknown) => void) | undefined;

        const { result, modelName: effectiveModelName } = await agentExecuteWithModelFallback({
          oc,
          operation: "streamObject",
          options,
          run: async ({ model: resolvedModel, maxRetries, attempt }) => {
            const attemptState: { hasOutput: boolean; lastError?: unknown } = {
              hasOutput: false,
            };
            const nativeStreamRetriesEnabled = options?.streamRetries !== undefined;
            const handleTerminalError = async (
              errorData: { error: unknown },
              notifyUser = true,
            ) => {
              // Handle nested error structure from OpenAI and other providers
              // The error might be directly the error or wrapped in { error: ... }
              const actualError = (errorData as any)?.error || errorData;
              attemptState.lastError = actualError;

              let userOnErrorError: unknown;
              if (notifyUser && userOnError) {
                try {
                  await userOnError(errorData as { error: unknown });
                } catch (error) {
                  userOnErrorError = error;
                }
              }

              // Log the error
              methodLogger.error("Stream object error occurred", {
                error: actualError,
                agentName: stateName,
                modelName: agentGetEffectiveModelName(oc, resolvedModel),
                schemaName: schemaName,
                attempt,
                maxRetries,
              });

              // Call error hooks if they exist
              await agentGetMergedHooks(options).onError?.({
                agent: runtimeAgent,
                error: actualError as Error,
                context: oc,
              });

              // Close OpenTelemetry span with error status
              oc.traceContext.end("error", actualError as Error);
              rejectGuardrailObject?.(actualError);

              // Let provider errors remain stream errors. If the user's
              // AI SDK onError callback throws, propagate that after
              // VoltAgent cleanup, matching the native stream callback path.
              // Ensure spans are flushed on error.
              // Uses waitUntil if available to avoid blocking
              try {
                if (userOnErrorError) {
                  throw userOnErrorError;
                }
              } finally {
                await flushObservability(
                  agentGetObservability(),
                  oc.logger ?? stateLogger,
                  stateObservabilityAuthWarningState,
                  "streamObject:onError",
                );
              }
            };
            const streamResult = streamTextWithVoltAgentTools({
              model: resolvedModel,
              ...promptOptions,
              output: objectOutput,
              // Default values
              maxOutputTokens: stateMaxOutputTokens,
              temperature: stateTemperature,
              // User overrides from AI SDK options
              ...aiSDKCallOptions,
              maxRetries: 0,
              // Provider-specific options
              providerOptions,
              // VoltAgent controlled
              abortSignal: oc.abortController.signal,
              onStepEnd: agentCreateStepHandler(oc, options, userOnStepEnd),
              onError: nativeStreamRetriesEnabled ? userOnError : handleTerminalError,
              experimental_transform: nativeStreamRetriesEnabled
                ? observeTerminalStreamErrors(aiSDKCallOptions.experimental_transform, (error) =>
                    handleTerminalError({ error }, false),
                  )
                : aiSDKCallOptions.experimental_transform,
              onEnd: async (finalResult: any) => {
                await invokeAISDKCallbackSafely(
                  userOnEnd,
                  finalResult,
                  oc.logger ?? stateLogger,
                  "onEnd",
                );

                try {
                  const providerUsage = finalResult.usage
                    ? await Promise.resolve(finalResult.usage)
                    : undefined;
                  const usageForFinish = resolveFinishUsage({
                    providerMetadata: finalResult.providerMetadata,
                    usage: providerUsage,
                    totalUsage: (finalResult as { totalUsage?: LanguageModelUsage }).totalUsage,
                  });
                  agentRecordRootSpanUsageAndProviderCost(
                    oc.traceContext,
                    usageForFinish,
                    finalResult.providerMetadata,
                  );
                  const usageInfo = convertUsage(usageForFinish);
                  let finalObject = (await streamResult.output) as z.infer<T>;
                  if (guardrailSet.output.length > 0) {
                    finalObject = await executeOutputGuardrails({
                      output: finalObject,
                      operationContext: oc,
                      guardrails: guardrailSet.output,
                      operation: "streamObject",
                      agent: runtimeAgent,
                      metadata: {
                        usage: usageInfo,
                        finishReason: finalResult.finishReason ?? null,
                        warnings: finalResult.warnings ?? null,
                      },
                    });
                    resolveGuardrailObject?.(finalObject);
                  }

                  if (agentShouldPersistMemoryForContext(oc) && oc.userId && oc.conversationId) {
                    const message: UIMessage = agentApplyMetadataToMessage(
                      {
                        id: randomUUID(),
                        role: "assistant",
                        parts: [
                          {
                            type: "text",
                            text: safeStringify(finalObject),
                          },
                        ],
                      },
                      agentBuildPersistedAssistantMessageMetadata({
                        oc,
                        usage: usageInfo,
                        finishReason: finalResult.finishReason ?? null,
                      }),
                    );

                    await stateMemoryManager.saveMessage(oc, message, oc.userId, oc.conversationId);

                    const step: StepWithContent = {
                      id: randomUUID(),
                      type: "text",
                      content: safeStringify(finalObject),
                      role: "assistant",
                      usage: usageInfo,
                    };
                    agentAddStepToHistory(step, oc);
                  }

                  oc.traceContext.setOutput(finalObject);

                  // Set output in operation context
                  oc.output =
                    typeof finalObject === "string" ||
                    (typeof finalObject === "object" && finalObject !== null)
                      ? finalObject
                      : safeStringify(finalObject);

                  await agentGetMergedHooks(options).onEnd?.({
                    conversationId: oc.conversationId || "",
                    agent: runtimeAgent,
                    output: {
                      object: finalObject,
                      usage: providerUsage,
                      totalUsage: (finalResult as { totalUsage?: LanguageModelUsage }).totalUsage,
                      steps: (finalResult as { steps?: ReadonlyArray<StepResult<ToolSet>> }).steps,
                      providerResponse: finalResult.response,
                      finishReason: finalResult.finishReason,
                      warnings: finalResult.warnings,
                      context: oc.context,
                    },
                    error: undefined,
                    context: oc,
                  });

                  const tokenInfo = usageForFinish
                    ? `${usageForFinish.totalTokens} tokens`
                    : "no usage data";
                  methodLogger.debug(
                    buildAgentLogMessage(
                      stateName,
                      ActionType.GENERATION_COMPLETE,
                      `Object generation completed (${tokenInfo})`,
                    ),
                    {
                      event: LogEvents.AGENT_GENERATION_COMPLETED,
                      duration: Date.now() - startTime,
                      finishReason: finalResult.finishReason,
                      usage: usageForFinish,
                      schemaName,
                    },
                  );

                  agentEnqueueEvalScoring({
                    oc,
                    output: finalObject,
                    operation: "streamObject",
                    metadata: {
                      finishReason: finalResult.finishReason,
                      usage: usageForFinish ? JSON.parse(safeStringify(usageForFinish)) : undefined,
                      schemaName,
                    },
                  });

                  oc.traceContext.end("completed");

                  // Ensure all spans are exported on finish
                  // Uses waitUntil if available to avoid blocking
                  await flushObservability(
                    agentGetObservability(),
                    oc.logger ?? stateLogger,
                    stateObservabilityAuthWarningState,
                    "streamObject:onFinish",
                  );
                } catch (error) {
                  rejectGuardrailObject?.(error);
                  throw error;
                }
              },
            });

            const originalFullStream = streamResult.stream;
            const probeResult = await agentProbeStreamStart(originalFullStream, attemptState);
            const streamResultForConsumption = agentWithProbedFullStream(
              streamResult,
              originalFullStream,
              probeResult.stream,
            );

            if (probeResult.status === "error") {
              agentDiscardStream(streamResultForConsumption.stream);
              throw probeResult.error;
            }

            return streamResultForConsumption;
          },
        });

        addModelAttributesToSpan(
          rootSpan,
          effectiveModelName,
          options,
          stateMaxOutputTokens,
          stateTemperature,
        );

        if (guardrailSet.output.length > 0) {
          guardrailObjectPromise = new Promise<z.infer<T>>((resolve, reject) => {
            resolveGuardrailObject = resolve;
            rejectGuardrailObject = reject;
          });
          void Promise.resolve(result.output as PromiseLike<z.infer<T>>).catch((error) => {
            rejectGuardrailObject?.(error);
          });
        } else {
          guardrailObjectPromise = Promise.resolve(result.output as PromiseLike<z.infer<T>>);
        }

        // Create a wrapper that includes context and delegates to the original result
        // Use getters for streams to avoid ReadableStream locking issues
        const resultWithContext = {
          // Delegate to original properties
          object: guardrailObjectPromise,
          // Use getter for lazy access to avoid stream locking
          get partialObjectStream() {
            return result.partialOutputStream;
          },
          get textStream() {
            return result.textStream;
          },
          warnings: Promise.resolve(result.warnings),
          usage: Promise.resolve(result.usage),
          finishReason: Promise.resolve(result.finishReason),
          // Delegate response conversion methods
          pipeTextStreamToResponse: (response, init) =>
            result.pipeTextStreamToResponse(response, init),
          toTextStreamResponse: (init) => result.toTextStreamResponse(init),
          // Add our custom context
          context: oc.context,
        } as StreamObjectResultWithContext<z.infer<T>>;

        return resultWithContext;
      } catch (error) {
        await agentFlushPendingMessagesOnError(oc).catch(() => {});
        // Ensure spans are exported on pre-stream errors
        await flushObservability(
          agentGetObservability(),
          oc.logger ?? stateLogger,
          stateObservabilityAuthWarningState,
          "streamObject:preStreamError",
        );
        return agentHandleError(error as Error, oc, options, 0);
      } finally {
        // No need to flush here for streams - handled in onFinish/onError
      }
    });
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  function agentResolveGuardrailSets(options?: {
    inputGuardrails?: InputGuardrail[];
    outputGuardrails?: OutputGuardrail<any>[];
  }): {
    input: NormalizedInputGuardrail[];
    output: NormalizedOutputGuardrail[];
  } {
    const optionInput = options?.inputGuardrails
      ? normalizeInputGuardrailList(options.inputGuardrails, stateInputGuardrails.length)
      : [];
    const optionOutput = options?.outputGuardrails
      ? normalizeOutputGuardrailList(options.outputGuardrails, stateOutputGuardrails.length)
      : [];

    return {
      input: [...stateInputGuardrails, ...optionInput],
      output: [...stateOutputGuardrails, ...optionOutput],
    };
  }

  function agentResolveMiddlewareSets(options?: {
    inputMiddlewares?: InputMiddleware[];
    outputMiddlewares?: OutputMiddleware<any>[];
  }): {
    input: NormalizedInputMiddleware[];
    output: NormalizedOutputMiddleware[];
  } {
    const optionInput = options?.inputMiddlewares
      ? normalizeInputMiddlewareList(options.inputMiddlewares, stateInputMiddlewares.length)
      : [];
    const optionOutput = options?.outputMiddlewares
      ? normalizeOutputMiddlewareList(options.outputMiddlewares, stateOutputMiddlewares.length)
      : [];

    return {
      input: [...stateInputMiddlewares, ...optionInput],
      output: [...stateOutputMiddlewares, ...optionOutput],
    };
  }

  function agentResolveMiddlewareRetries(options?: AnyBaseGenerationOptions): number {
    const optionRetries = options?.maxMiddlewareRetries;
    if (typeof optionRetries === "number" && Number.isFinite(optionRetries)) {
      return Math.max(0, optionRetries);
    }
    if (Number.isFinite(stateMaxMiddlewareRetries)) {
      return Math.max(0, stateMaxMiddlewareRetries);
    }
    return 0;
  }

  function agentStoreMiddlewareRetryFeedback(
    oc: OperationContext,
    reason?: string,
    metadata?: unknown,
  ): void {
    const trimmedReason = typeof reason === "string" ? reason.trim() : "";
    const baseReason = trimmedReason.length > 0 ? trimmedReason : "Middleware requested a retry.";
    let feedback = `[Middleware Feedback] ${baseReason} Please retry with the feedback in mind.`;
    if (metadata !== undefined) {
      feedback = `${feedback}\nMetadata: ${safeStringify(metadata)}`;
    }
    oc.systemContext.set(MIDDLEWARE_RETRY_FEEDBACK_KEY, feedback);
  }

  function agentConsumeMiddlewareRetryFeedback(oc: OperationContext): string | null {
    const feedback = oc.systemContext.get(MIDDLEWARE_RETRY_FEEDBACK_KEY);
    if (typeof feedback === "string" && feedback.trim().length > 0) {
      oc.systemContext.delete(MIDDLEWARE_RETRY_FEEDBACK_KEY);
      return feedback;
    }
    return null;
  }

  function agentShouldRetryMiddleware(
    error: unknown,
    retryCount: number,
    maxRetries: number,
  ): boolean {
    if (!isMiddlewareAbortError(error)) {
      return false;
    }
    return Boolean(error.retry) && retryCount < maxRetries;
  }

  /**
   * Common preparation for all execution methods
   */
  async function agentPrepareExecution(
    input: string | UIMessage[] | BaseMessage[],
    oc: OperationContext,
    options?: AnyBaseGenerationOptions,
  ): Promise<{
    messages: BaseMessage[];
    uiMessages: UIMessage[];
    modelName: string;
    tools: Record<string, any>;
    maxSteps: number;
  }> {
    const dynamicToolInput = await agentResolveValue(stateDynamicTools, oc);
    const dynamicTools = splitAgentToolInput(dynamicToolInput);
    const optionTools = splitAgentToolInput(options?.tools);
    const adHocTools = [...dynamicTools.items, ...optionTools.items];
    const adHocToolSets = [dynamicTools.toolSet, optionTools.toolSet].filter(
      (toolSet): toolSet is ToolSet => Boolean(toolSet),
    );
    const runtimeToolkits = agentExtractToolkits(adHocTools);

    // Prepare messages (system + memory + input) as UIMessages
    const buffer = agentGetConversationBuffer(oc);
    const uiMessages = await agentPrepareMessages(input, oc, options, buffer, runtimeToolkits);

    // Convert UIMessages to ModelMessages for the LLM
    const hooks = agentGetMergedHooks(options);
    let messages = await convertToModelMessages(uiMessages);

    if (hooks.onPrepareModelMessages) {
      const result = await hooks.onPrepareModelMessages({
        modelMessages: messages,
        uiMessages,
        agent: runtimeAgent,
        context: oc,
      });
      if (result?.modelMessages) {
        messages = result.modelMessages;
      }
    }

    messages = stripDanglingOpenAIReasoningFromModelMessages(messages);

    // Calculate maxSteps (use provided option or calculate based on subagents)
    const maxSteps = options?.maxSteps ?? agentCalculateMaxSteps();

    const modelName = runtimeAgent.getModelName(options?.model);

    // Prepare tools with execution context
    const tools = await agentPrepareTools(adHocTools, oc, maxSteps, options, adHocToolSets);

    return {
      messages,
      uiMessages,
      modelName,
      tools,
      maxSteps,
    };
  }

  function agentCollectToolDataFromResult<TOOLS extends ToolSet, OUTPUT extends OutputSpec>(
    result: GenerateTextResult<TOOLS, any, OUTPUT>,
  ): {
    toolCalls: GenerateTextResult<TOOLS, any, OUTPUT>["toolCalls"];
    toolResults: GenerateTextResult<TOOLS, any, OUTPUT>["toolResults"];
  } {
    const steps = result.steps ?? [];

    const stepToolCalls = steps.flatMap((step) => step.toolCalls ?? []);
    const stepToolResults = steps.flatMap((step) => step.toolResults ?? []);

    return {
      toolCalls: stepToolCalls.length > 0 ? stepToolCalls : (result.toolCalls ?? []),
      toolResults: stepToolResults.length > 0 ? stepToolResults : (result.toolResults ?? []),
    };
  }

  async function agentEnsureStructuredOutputGenerated<
    TOOLS extends ToolSet,
    OUTPUT extends OutputSpec,
  >(params: {
    result: GenerateTextResult<TOOLS, any, OUTPUT>;
    output: OUTPUT | undefined;
    tools: Record<string, any>;
    maxSteps: number;
  }): Promise<void> {
    const { result, output, tools, maxSteps } = params;
    if (!output) {
      return;
    }

    try {
      void result.output;
    } catch (error) {
      const isNoOutputGeneratedError =
        error instanceof NoOutputGeneratedError ||
        (error instanceof Error && error.name === "AI_NoOutputGeneratedError");

      if (!isNoOutputGeneratedError) {
        throw error;
      }

      const { toolCalls } = agentCollectToolDataFromResult(result);
      const configuredToolCount = Object.keys(tools ?? {}).length;
      const stepCount = result.steps?.length ?? 0;
      const finishReason = result.finishReason ?? "unknown";
      const reachedMaxSteps = stepCount >= maxSteps;
      const providerMetadata = (result as { providerMetadata?: unknown }).providerMetadata;
      const providerUsage = result.usage ? await Promise.resolve(result.usage) : undefined;
      const usageForFinish = resolveFinishUsage({
        providerMetadata,
        usage: providerUsage,
        totalUsage: (result as { totalUsage?: LanguageModelUsage }).totalUsage,
      });

      const guidance =
        configuredToolCount > 0 || toolCalls.length > 0
          ? "When tools are enabled, ensure the model emits a final non-tool response that matches the output schema, or split this into two calls (tools first, schema formatting second)."
          : "Ensure the model emits a final response that matches the requested output schema.";

      const maxStepHint = reachedMaxSteps
        ? ` Generation stopped after ${stepCount} steps (maxSteps=${maxSteps}).`
        : "";

      throw createVoltAgentError(
        `Structured output was requested but no final output was generated (finishReason: ${finishReason}). ${guidance}${maxStepHint}`,
        {
          stage: "response_parsing",
          code: "STRUCTURED_OUTPUT_NOT_GENERATED",
          originalError: error,
          metadata: {
            finishReason,
            stepCount,
            maxSteps,
            configuredToolCount,
            toolCallCount: toolCalls.length,
            usage: usageForFinish ? JSON.parse(safeStringify(usageForFinish)) : undefined,
            providerMetadata:
              providerMetadata !== undefined
                ? JSON.parse(safeStringify(providerMetadata))
                : undefined,
          },
        },
      );
    }
  }

  /**
   * Create execution context
   */
  // createContext removed; use createOperationContext directly

  function agentNormalizeConversationPersistenceOptions(
    options?: AgentConversationPersistenceOptions,
  ): ResolvedConversationPersistenceOptions {
    const mode = options?.mode ?? DEFAULT_CONVERSATION_PERSISTENCE_OPTIONS.mode;
    const debounceMs =
      typeof options?.debounceMs === "number" &&
      Number.isFinite(options.debounceMs) &&
      options.debounceMs >= 0
        ? options.debounceMs
        : DEFAULT_CONVERSATION_PERSISTENCE_OPTIONS.debounceMs;

    return {
      mode,
      debounceMs,
      flushOnToolResult:
        options?.flushOnToolResult ?? DEFAULT_CONVERSATION_PERSISTENCE_OPTIONS.flushOnToolResult,
    };
  }

  function agentNormalizeMessageMetadataPersistenceOptions(
    options?: AgentMessageMetadataPersistenceConfig | AgentMessageMetadataPersistenceOptions,
    defaults: ResolvedMessageMetadataPersistenceOptions = DEFAULT_MESSAGE_METADATA_PERSISTENCE_OPTIONS,
  ): ResolvedMessageMetadataPersistenceOptions {
    if (options === true) {
      return {
        usage: true,
        finishReason: true,
      };
    }

    if (options === false) {
      return {
        usage: false,
        finishReason: false,
      };
    }

    return {
      usage: options?.usage ?? defaults.usage,
      finishReason: options?.finishReason ?? defaults.finishReason,
    };
  }

  function agentResolveConversationPersistenceOptions(
    options?: AnyBaseGenerationOptions,
  ): ResolvedConversationPersistenceOptions {
    const resolvedMemory = agentResolveMemoryRuntimeOptions(options);
    if (!resolvedMemory.conversationPersistence) {
      return { ...stateConversationPersistence };
    }

    const conversationPersistence = resolvedMemory.conversationPersistence;
    return agentNormalizeConversationPersistenceOptions({
      mode: conversationPersistence.mode ?? stateConversationPersistence.mode,
      debounceMs: conversationPersistence.debounceMs ?? stateConversationPersistence.debounceMs,
      flushOnToolResult:
        conversationPersistence.flushOnToolResult ?? stateConversationPersistence.flushOnToolResult,
    });
  }

  function agentResolveMemoryRuntimeOptions(
    options?: AnyBaseGenerationOptions,
    operationContext?: OperationContext,
  ): CommonResolvedRuntimeMemoryOptions {
    const memory = options?.memory;
    const memoryOptions = memory?.options;
    const contextResolvedMemory = operationContext?.resolvedMemory;
    const parentResolvedMemory = options?.parentOperationContext?.resolvedMemory;
    const parentUserId = parentResolvedMemory?.userId ?? options?.parentOperationContext?.userId;
    const parentConversationId =
      parentResolvedMemory?.conversationId ?? options?.parentOperationContext?.conversationId;

    return {
      userId: firstNonBlank(
        contextResolvedMemory?.userId,
        operationContext?.userId,
        memory?.userId,
        options?.userId,
        parentUserId,
      ),
      conversationId: firstNonBlank(
        contextResolvedMemory?.conversationId,
        operationContext?.conversationId,
        memory?.conversationId,
        options?.conversationId,
        parentConversationId,
      ),
      contextLimit:
        contextResolvedMemory?.contextLimit ??
        memoryOptions?.contextLimit ??
        options?.contextLimit ??
        parentResolvedMemory?.contextLimit,
      semanticMemory:
        contextResolvedMemory?.semanticMemory ??
        memoryOptions?.semanticMemory ??
        options?.semanticMemory ??
        parentResolvedMemory?.semanticMemory,
      conversationPersistence:
        contextResolvedMemory?.conversationPersistence ??
        memoryOptions?.conversationPersistence ??
        options?.conversationPersistence ??
        parentResolvedMemory?.conversationPersistence,
      messageMetadataPersistence:
        contextResolvedMemory?.messageMetadataPersistence ??
        agentNormalizeMessageMetadataPersistenceOptions(
          memoryOptions?.messageMetadataPersistence ??
            options?.messageMetadataPersistence ??
            parentResolvedMemory?.messageMetadataPersistence,
          stateMessageMetadataPersistence,
        ),
      readOnly: firstDefined(
        contextResolvedMemory?.readOnly,
        memoryOptions?.readOnly,
        parentResolvedMemory?.readOnly,
      ),
    };
  }

  function agentGetConversationPersistenceOptionsForContext(
    oc: OperationContext,
  ): ResolvedConversationPersistenceOptions {
    const fromContext = oc.systemContext.get(CONVERSATION_PERSISTENCE_OPTIONS_KEY) as
      | ResolvedConversationPersistenceOptions
      | undefined;

    if (fromContext) {
      return fromContext;
    }

    const resolved = { ...stateConversationPersistence };
    oc.systemContext.set(CONVERSATION_PERSISTENCE_OPTIONS_KEY, resolved);
    return resolved;
  }

  function agentGetMessageMetadataPersistenceOptionsForContext(
    oc: OperationContext,
  ): ResolvedMessageMetadataPersistenceOptions {
    return agentNormalizeMessageMetadataPersistenceOptions(
      oc.resolvedMemory?.messageMetadataPersistence,
      stateMessageMetadataPersistence,
    );
  }

  function agentBuildPersistedAssistantMessageMetadata(params: {
    oc: OperationContext;
    usage?: UsageInfo;
    finishReason?: string | null;
  }): Record<string, unknown> | undefined {
    const persistence = agentGetMessageMetadataPersistenceOptionsForContext(params.oc);
    const metadata: Record<string, unknown> = {};

    if (persistence.usage && params.usage) {
      metadata.usage = params.usage;
    }

    if (persistence.finishReason) {
      metadata.finishReason = params.finishReason ?? null;
    }

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  function agentApplyMetadataToLastAssistantMessage(params: {
    buffer: ConversationBuffer;
    metadata?: Record<string, unknown>;
    responseMessages?: ModelMessage[];
  }): boolean {
    const { buffer, metadata, responseMessages } = params;
    if (!metadata || Object.keys(metadata).length === 0) {
      return false;
    }

    const metadataApplied = buffer.addMetadataToLastAssistantMessage(metadata, {
      requirePending: true,
    });
    if (metadataApplied) {
      return true;
    }

    if (responseMessages?.length) {
      buffer.addModelMessages(responseMessages, "response");
      return buffer.addMetadataToLastAssistantMessage(metadata, {
        requirePending: true,
      });
    }

    return false;
  }

  function agentApplyMetadataToMessage(
    message: UIMessage,
    metadata?: Record<string, unknown>,
  ): UIMessage {
    if (!metadata || Object.keys(metadata).length === 0) {
      return message;
    }

    return {
      ...message,
      metadata: {
        ...((message.metadata as Record<string, unknown> | undefined) ?? {}),
        ...metadata,
      },
    };
  }

  function agentResolveContext(
    options?: AnyBaseGenerationOptions,
    clone = false,
  ): Map<string | symbol, unknown> {
    // Prefer reusing an existing context instance to preserve reference across calls/subagents
    const runtimeContext = toContextMap(options?.context);
    const parentContext = options?.parentOperationContext?.context;

    // Determine authoritative base context reference without cloning
    let context: Map<string | symbol, unknown>;
    if (parentContext) {
      context = clone ? new Map(parentContext) : parentContext;
      // Parent context should remain authoritative; only fill in missing keys from runtime then agent
      if (runtimeContext) {
        for (const [k, v] of runtimeContext.entries()) {
          if (!context.has(k)) context.set(k, v);
        }
      }
      if (stateContext) {
        for (const [k, v] of stateContext.entries()) {
          if (!context.has(k)) context.set(k, v);
        }
      }
    } else if (runtimeContext) {
      // Use the user-provided context instance directly
      context = clone ? new Map(runtimeContext) : runtimeContext;
      // Fill defaults from agent-level context without overriding user values
      if (stateContext) {
        for (const [k, v] of stateContext.entries()) {
          if (!context.has(k)) context.set(k, v);
        }
      }
    } else if (stateContext) {
      // Fall back to agent-level default context instance
      context = clone ? new Map(stateContext) : stateContext;
    } else {
      // No context provided anywhere; create a fresh one
      context = new Map();
    }

    const activeTriggerContext = otelContext.active().getValue(TRIGGER_CONTEXT_KEY);
    if (activeTriggerContext instanceof Map) {
      for (const [key, value] of activeTriggerContext.entries()) {
        if (!context.has(key)) {
          context.set(key, value);
        }
      }
    }

    return context;
  }

  /**
   * Create only the OperationContext (sync)
   * Transitional helper to gradually adopt OperationContext across methods
   */
  function agentCreateOperationContext(
    input: string | UIMessage[] | BaseMessage[],
    options?: AnyBaseGenerationOptions,
  ): OperationContext {
    const operationId = randomUUID();
    const startTimeDate = new Date();
    const resolvedMemory = agentResolveMemoryRuntimeOptions(options);

    const context = options?.[VALIDATED_CONTEXT] ?? agentResolveContext(options);

    const logger = agentGetContextualLogger(options?.parentAgentId).child({
      operationId,
      userId: resolvedMemory.userId,
      conversationId: resolvedMemory.conversationId,
      executionId: operationId,
    });

    const observability = agentGetObservability();
    const traceContext = new AgentTraceContext(observability, stateName, {
      agentId: stateId,
      agentName: stateName,
      userId: resolvedMemory.userId,
      conversationId: resolvedMemory.conversationId,
      operationId,
      parentSpan: options?.parentSpan,
      inheritParentSpan: options?.inheritParentSpan ?? stateInheritParentSpan,
      parentAgentId: options?.parentAgentId,
      input,
    });
    traceContext.getRootSpan().setAttribute("voltagent.operation_id", operationId);

    // Use parent's AbortController if available, otherwise create new one
    const abortController =
      options?.parentOperationContext?.abortController || new AbortController();

    // Setup cascade abort only if we created a new controller
    if (!options?.parentOperationContext?.abortController && options?.abortSignal) {
      const externalSignal = options.abortSignal;
      externalSignal.addEventListener("abort", () => {
        if (!abortController.signal.aborted) {
          abortController.abort(externalSignal.reason);
        }
      });
    }

    const conversationPersistence = agentResolveConversationPersistenceOptions(options);
    const systemContext = new Map<string | symbol, unknown>();
    systemContext.set(BUFFER_CONTEXT_KEY, new ConversationBuffer(undefined, logger));
    systemContext.set(CONVERSATION_PERSISTENCE_OPTIONS_KEY, conversationPersistence);
    systemContext.set(
      QUEUE_CONTEXT_KEY,
      new MemoryPersistQueue(stateMemoryManager, {
        debounceMs: conversationPersistence.debounceMs,
        logger,
      }),
    );
    systemContext.set(AGENT_METADATA_CONTEXT_KEY, {
      agentId: stateId,
      agentName: stateName,
    });
    systemContext.set(AGENT_REF_CONTEXT_KEY, runtimeAgent);

    const elicitationHandler = options?.elicitation ?? options?.parentOperationContext?.elicitation;

    return {
      operationId,
      context,
      requestHeaders: options?.requestHeaders ?? options?.parentOperationContext?.requestHeaders,
      systemContext,
      isActive: true,
      logger,
      conversationSteps: options?.parentOperationContext?.conversationSteps || [],
      abortController,
      userId: resolvedMemory.userId,
      conversationId: resolvedMemory.conversationId,
      resolvedMemory: { ...resolvedMemory },
      workspace: stateWorkspace,
      parentAgentId: options?.parentAgentId,
      traceContext,
      startTime: startTimeDate,
      elicitation: elicitationHandler,
      input,
      output: undefined,
    };
  }

  function agentResetOperationAttemptState(oc: OperationContext): void {
    const conversationPersistence = agentGetConversationPersistenceOptionsForContext(oc);
    oc.systemContext.set(BUFFER_CONTEXT_KEY, new ConversationBuffer(undefined, oc.logger));
    oc.systemContext.set(
      QUEUE_CONTEXT_KEY,
      new MemoryPersistQueue(stateMemoryManager, {
        debounceMs: conversationPersistence.debounceMs,
        logger: oc.logger,
      }),
    );
    oc.systemContext.delete(STEP_PERSIST_COUNT_KEY);
    oc.systemContext.delete("conversationSteps");
    oc.systemContext.delete("bailedResult");
    oc.systemContext.delete(STREAM_RESPONSE_MESSAGE_ID_KEY);
    oc.systemContext.delete(STEP_RESPONSE_MESSAGE_FINGERPRINTS_KEY);
    oc.conversationSteps = [];
    oc.output = undefined;
  }

  function agentGetConversationBuffer(oc: OperationContext): ConversationBuffer {
    let buffer = oc.systemContext.get(BUFFER_CONTEXT_KEY) as ConversationBuffer | undefined;
    if (!buffer) {
      buffer = new ConversationBuffer();
      oc.systemContext.set(BUFFER_CONTEXT_KEY, buffer);
    }
    return buffer;
  }

  function agentGetMemoryPersistQueue(oc: OperationContext): MemoryPersistQueue {
    let queue = oc.systemContext.get(QUEUE_CONTEXT_KEY) as MemoryPersistQueue | undefined;
    if (!queue) {
      const conversationPersistence = agentGetConversationPersistenceOptionsForContext(oc);
      queue = new MemoryPersistQueue(stateMemoryManager, {
        debounceMs: conversationPersistence.debounceMs,
        logger: oc.logger,
      });
      oc.systemContext.set(QUEUE_CONTEXT_KEY, queue);
    }
    return queue;
  }

  function agentIsReadOnlyMemoryForContext(oc: OperationContext): boolean {
    return oc.resolvedMemory?.readOnly === true;
  }

  function agentShouldPersistMemoryForContext(oc: OperationContext): boolean {
    return !agentIsReadOnlyMemoryForContext(oc);
  }

  async function agentEnsureStreamingResponseMessageId(
    oc: OperationContext,
    buffer: ConversationBuffer,
  ): Promise<string | null> {
    const messageId = agentGetOrCreateStepResponseMessageId(oc);
    const placeholder: UIMessage = {
      id: messageId,
      role: "assistant",
      parts: [],
    };

    buffer.ingestUIMessages([placeholder], false);
    return messageId;
  }

  function agentGetOrCreateStepResponseMessageId(oc: OperationContext): string {
    const existing = oc.systemContext.get(STREAM_RESPONSE_MESSAGE_ID_KEY);
    if (typeof existing === "string" && existing.trim().length > 0) {
      return existing;
    }

    const messageId = generateId();
    oc.systemContext.set(STREAM_RESPONSE_MESSAGE_ID_KEY, messageId);
    return messageId;
  }

  function agentGetStepResponseMessageFingerprints(oc: OperationContext): Set<string> {
    const existing = oc.systemContext.get(STEP_RESPONSE_MESSAGE_FINGERPRINTS_KEY);
    if (existing instanceof Set) {
      return existing as Set<string>;
    }

    const fingerprints = new Set<string>();
    oc.systemContext.set(STEP_RESPONSE_MESSAGE_FINGERPRINTS_KEY, fingerprints);
    return fingerprints;
  }

  function agentNormalizeStepResponseMessages(
    oc: OperationContext,
    responseMessages: ModelMessage[] | undefined,
  ): ModelMessage[] | undefined {
    if (!responseMessages?.length) {
      return undefined;
    }

    const fallbackAssistantMessageId = agentGetOrCreateStepResponseMessageId(oc);
    const fingerprints = agentGetStepResponseMessageFingerprints(oc);
    const normalized: ModelMessage[] = [];

    for (const responseMessage of responseMessages) {
      const normalizedMessage =
        responseMessage.role === "assistant"
          ? ({ ...responseMessage, id: fallbackAssistantMessageId } as ModelMessage)
          : responseMessage;

      const fingerprintMessageId =
        normalizedMessage.role === "assistant"
          ? fallbackAssistantMessageId
          : ((normalizedMessage as { id?: unknown }).id ?? null);

      const fingerprint = safeStringify({
        role: normalizedMessage.role,
        id: fingerprintMessageId,
        content: normalizedMessage.content,
      });

      if (fingerprints.has(fingerprint)) {
        continue;
      }

      fingerprints.add(fingerprint);
      normalized.push(normalizedMessage);
    }

    return normalized.length > 0 ? normalized : undefined;
  }

  async function agentFlushPendingMessagesOnError(oc: OperationContext): Promise<void> {
    if (!agentShouldPersistMemoryForContext(oc)) {
      return;
    }

    const buffer = agentGetConversationBuffer(oc);
    const queue = agentGetMemoryPersistQueue(oc);

    if (!buffer || !queue) {
      return;
    }

    try {
      await queue.flush(buffer, oc);
    } catch (error) {
      oc.logger.debug("Failed to flush pending conversation messages after error", {
        error,
        conversationId: oc.conversationId,
        userId: oc.userId,
      });
      throw error;
    }
  }

  /**
   * Get contextual logger with parent tracking
   */
  function agentGetContextualLogger(parentAgentId?: string): Logger {
    if (parentAgentId) {
      const parentAgent = AgentRegistry.getInstance().getAgent(parentAgentId);
      if (parentAgent) {
        return stateLogger.child({
          parentAgentId,
          isSubAgent: true,
          delegationDepth: agentCalculateDelegationDepth(parentAgentId),
        });
      }
    }
    return stateLogger;
  }

  /**
   * Calculate delegation depth
   */
  function agentCalculateDelegationDepth(parentAgentId: string | undefined): number {
    if (!parentAgentId) return 0;

    let depth = 1;
    let currentParentId = parentAgentId;
    const visited = new Set<string>();

    while (currentParentId) {
      if (visited.has(currentParentId)) break;
      visited.add(currentParentId);

      const parentIds = AgentRegistry.getInstance().getParentAgentIds(currentParentId);
      if (parentIds.length > 0) {
        depth++;
        currentParentId = parentIds[0];
      } else {
        break;
      }
    }

    return depth;
  }

  function agentEnqueueEvalScoring(args: EnqueueEvalScoringArgs): void {
    enqueueEvalScoringHelper(agentCreateEvalHost(), args);
  }

  function agentCreateLLMSpan(
    oc: OperationContext,
    params: {
      operation: LLMOperation;
      modelName: string;
      isStreaming: boolean;
      messages?: Array<{ role: string; content: unknown }>;
      tools?: ToolSet;
      providerOptions?: ProviderOptions;
      callOptions?: Record<string, unknown>;
      label?: string;
    },
  ): Span {
    const { label, ...spanParams } = params;
    const promptContextUsageEstimate = estimatePromptContextUsage({
      messages: params.messages,
      tools: params.tools,
    });
    const attributes = {
      ...agentBuildLLMSpanAttributes(spanParams),
      ...(promptContextUsageEstimate
        ? promptContextUsageEstimateToAttributes(promptContextUsageEstimate)
        : {}),
    };
    const span = oc.traceContext.createChildSpan(`llm:${params.operation}`, "llm", {
      kind: SpanKind.CLIENT,
      label,
      attributes,
    });
    return span;
  }

  function agentCreateLLMSpanFinalizer(span: Span) {
    let ended = false;
    return (
      status: SpanStatusCode,
      details?: {
        message?: string;
        usage?: LanguageModelUsage | UsageInfo | null;
        finishReason?: FinishReason | string | null;
        providerMetadata?: unknown;
      },
    ) => {
      if (ended) {
        return;
      }
      if (details?.usage) {
        agentRecordLLMUsage(span, details.usage);
      }
      if (details?.providerMetadata !== undefined) {
        agentRecordProviderCost(span, details.providerMetadata);
      }
      if (details?.finishReason) {
        span.setAttribute("llm.finish_reason", String(details.finishReason));
      }
      if (details?.message) {
        span.setStatus({ code: status, message: details.message });
      } else {
        span.setStatus({ code: status });
      }
      span.end();
      ended = true;
    };
  }

  function agentBuildLLMSpanAttributes(params: {
    operation: LLMOperation;
    modelName: string;
    isStreaming: boolean;
    messages?: Array<{ role: string; content: unknown }>;
    tools?: ToolSet;
    providerOptions?: ProviderOptions;
    callOptions?: Record<string, unknown>;
  }): Record<string, any> {
    const attrs: Record<string, any> = {
      "llm.operation": params.operation,
      "llm.model": params.modelName,
      "llm.stream": params.isStreaming,
    };
    const provider = params.modelName?.includes("/") ? params.modelName.split("/")[0] : undefined;
    if (provider) {
      attrs["llm.provider"] = provider;
    }

    const callOptions = params.callOptions ?? {};
    const maybeNumber = (value: unknown): number | undefined => {
      if (typeof value === "number") {
        return Number.isFinite(value) ? value : undefined;
      }
      if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
      }
      return undefined;
    };

    const temperature = maybeNumber(callOptions.temperature ?? callOptions.temp ?? undefined);
    if (temperature !== undefined) {
      attrs["llm.temperature"] = temperature;
    }
    const maxOutputTokens = maybeNumber(callOptions.maxOutputTokens);
    if (maxOutputTokens !== undefined) {
      attrs["llm.max_output_tokens"] = maxOutputTokens;
    }
    const maxRetries = maybeNumber(callOptions.maxRetries ?? callOptions.max_retries);
    if (maxRetries !== undefined) {
      attrs["llm.max_retries"] = maxRetries;
    }
    const modelId = callOptions.modelId ?? callOptions.model_id;
    if (typeof modelId === "string" && modelId.length > 0) {
      attrs["llm.model_id"] = modelId;
    }
    const attempt = maybeNumber(callOptions.attempt ?? callOptions.attempt_index);
    if (attempt !== undefined) {
      attrs["llm.attempt"] = attempt;
    }
    const modelIndex = maybeNumber(callOptions.modelIndex ?? callOptions.model_index);
    if (modelIndex !== undefined) {
      attrs["llm.model_index"] = modelIndex;
    }
    const topP = maybeNumber(callOptions.topP);
    if (topP !== undefined) {
      attrs["llm.top_p"] = topP;
    }
    if (callOptions.stop !== undefined) {
      attrs["llm.stop_condition"] = safeStringify(callOptions.stop);
    }
    if (params.messages && params.messages.length > 0) {
      attrs["llm.messages.count"] = params.messages.length;
      const trimmedMessages = params.messages.slice(-10);
      attrs["llm.messages"] = safeStringify(
        trimmedMessages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      );
    }
    if (params.tools) {
      const toolNames = Object.keys(params.tools);
      attrs["llm.tools.count"] = toolNames.length;
      if (toolNames.length > 0) {
        attrs["llm.tools"] = toolNames.join(",");
      }
    }
    if (params.providerOptions) {
      attrs["llm.provider_options"] = safeStringify(params.providerOptions);
    }
    return attrs;
  }

  function agentRecordLLMUsage(span: Span, usage?: LanguageModelUsage | UsageInfo | null): void {
    if (!usage) {
      return;
    }

    const normalizedUsage =
      "promptTokens" in usage ? (usage as UsageInfo) : convertUsage(usage as LanguageModelUsage);

    if (!normalizedUsage) {
      return;
    }

    const { promptTokens, completionTokens, totalTokens, cachedInputTokens, reasoningTokens } =
      normalizedUsage;

    if (promptTokens !== undefined) {
      span.setAttribute("llm.usage.prompt_tokens", promptTokens);
    }
    if (completionTokens !== undefined) {
      span.setAttribute("llm.usage.completion_tokens", completionTokens);
    }
    if (totalTokens !== undefined) {
      span.setAttribute("llm.usage.total_tokens", totalTokens);
    }
    if (cachedInputTokens !== undefined && cachedInputTokens > 0) {
      span.setAttribute("llm.usage.cached_tokens", cachedInputTokens);
    }
    if (reasoningTokens !== undefined && reasoningTokens > 0) {
      span.setAttribute("llm.usage.reasoning_tokens", reasoningTokens);
    }
  }

  function agentRecordProviderCost(span: Span, providerMetadata?: unknown): void {
    const openRouterUsageCost = extractOpenRouterUsageCost(providerMetadata);
    if (!openRouterUsageCost) {
      return;
    }

    if (openRouterUsageCost.cost !== undefined) {
      span.setAttribute("usage.cost", openRouterUsageCost.cost);
    }
    if (openRouterUsageCost.isByok !== undefined) {
      span.setAttribute("usage.is_byok", openRouterUsageCost.isByok);
    }
    if (openRouterUsageCost.upstreamInferenceCost !== undefined) {
      span.setAttribute(
        "usage.cost_details.upstream_inference_cost",
        openRouterUsageCost.upstreamInferenceCost,
      );
    }
    if (openRouterUsageCost.upstreamInferenceInputCost !== undefined) {
      span.setAttribute(
        "usage.cost_details.upstream_inference_input_cost",
        openRouterUsageCost.upstreamInferenceInputCost,
      );
    }
    if (openRouterUsageCost.upstreamInferenceOutputCost !== undefined) {
      span.setAttribute(
        "usage.cost_details.upstream_inference_output_cost",
        openRouterUsageCost.upstreamInferenceOutputCost,
      );
    }
  }

  function agentCreateEvalHost(): AgentEvalHost {
    return {
      id: stateId,
      name: stateName,
      logger: stateLogger,
      evalConfig: stateEvalConfig,
      getObservability: () => agentGetObservability(),
      getVoltOpsClient: () => {
        const client = stateVoltOpsClient || AgentRegistry.getInstance().getGlobalVoltOpsClient();
        if (!client || typeof client.hasValidKeys !== "function") {
          return undefined;
        }
        if (!client.hasValidKeys()) {
          return undefined;
        }
        return client;
      },
    };
  }

  /**
   * Get observability instance (lazy initialization)
   */
  /**
   * Get observability instance - checks global registry on every call
   * This ensures agents can use global observability when available
   * but still work standalone with their own instance
   */
  function agentGetObservability(): VoltAgentObservability {
    const registry = AgentRegistry.getInstance();

    // Always check global registry first (it might have been set after agent creation)
    const globalObservability = registry.getGlobalObservability();
    if (globalObservability) {
      return globalObservability;
    }

    if (!stateDefaultObservability) {
      stateDefaultObservability = createVoltAgentObservability({
        serviceName: `agent-${stateName}`,
      });
    }

    return stateDefaultObservability;
  }

  function agentResolveFeedbackOptions(
    options?: AnyBaseGenerationOptions,
  ): AgentFeedbackOptions | undefined {
    const raw = options?.feedback ?? stateFeedbackOptions;
    if (!raw) {
      return undefined;
    }
    if (raw === true) {
      return {};
    }
    return raw;
  }

  function agentGetFeedbackTraceId(oc: OperationContext): string | undefined {
    try {
      return oc.traceContext.getRootSpan().spanContext().traceId;
    } catch {
      return undefined;
    }
  }

  function agentGetFeedbackClient(): VoltOpsClient | undefined {
    const voltOpsClient =
      stateVoltOpsClient || AgentRegistry.getInstance().getGlobalVoltOpsClient();
    if (!voltOpsClient || typeof voltOpsClient.hasValidKeys !== "function") {
      return undefined;
    }
    if (!voltOpsClient.hasValidKeys()) {
      return undefined;
    }
    return voltOpsClient;
  }

  async function agentCreateFeedbackMetadata(
    oc: OperationContext,
    options?: AnyBaseGenerationOptions,
  ): Promise<AgentFeedbackMetadata | null> {
    const feedbackOptions = agentResolveFeedbackOptions(options);
    if (!feedbackOptions) {
      return null;
    }

    const voltOpsClient = agentGetFeedbackClient();
    if (!voltOpsClient) {
      return null;
    }

    const traceId = agentGetFeedbackTraceId(oc);
    if (!traceId) {
      return null;
    }

    const key = feedbackOptions.key?.trim() || DEFAULT_FEEDBACK_KEY;

    try {
      const token = await voltOpsClient.createFeedbackToken({
        traceId,
        key,
        feedbackConfig: feedbackOptions.feedbackConfig ?? null,
        expiresAt: feedbackOptions.expiresAt,
        expiresIn: feedbackOptions.expiresIn,
      });

      return {
        traceId,
        key,
        url: token.url,
        tokenId: token.id,
        expiresAt: token.expiresAt,
        feedbackConfig: token.feedbackConfig ?? feedbackOptions.feedbackConfig ?? null,
      };
    } catch (error) {
      oc.logger.debug("Failed to create feedback token", {
        traceId,
        key,
        error,
      });
      return null;
    }
  }

  /**
   * Check if semantic search is supported
   */
  function agentHasSemanticSearchSupport(): boolean {
    // Check if MemoryManager has vector support
    const memory = stateMemoryManager.getMemory();
    if (memory) {
      return memory?.hasVectorSupport?.() ?? false;
    }
    return false;
  }

  function agentCreateConversationTitleGenerator(
    memory?: Memory,
  ): ConversationTitleGenerator | undefined {
    const rawConfig = memory?.getTitleGenerationConfig?.();
    if (!rawConfig) {
      return undefined;
    }

    const normalized: ConversationTitleConfig =
      typeof rawConfig === "boolean" ? { enabled: rawConfig } : { ...rawConfig };
    const enabled = normalized.enabled ?? true;
    if (!enabled) {
      return undefined;
    }

    const systemPrompt =
      normalized.systemPrompt === undefined
        ? DEFAULT_CONVERSATION_TITLE_PROMPT
        : (normalized.systemPrompt ?? "");
    const maxOutputTokens =
      typeof normalized.maxOutputTokens === "number" && Number.isFinite(normalized.maxOutputTokens)
        ? Math.max(1, normalized.maxOutputTokens)
        : DEFAULT_CONVERSATION_TITLE_MAX_OUTPUT_TOKENS;
    const maxLength =
      typeof normalized.maxLength === "number" && Number.isFinite(normalized.maxLength)
        ? Math.max(1, normalized.maxLength)
        : DEFAULT_CONVERSATION_TITLE_MAX_CHARS;
    const temperature =
      normalized.temperature === null
        ? undefined
        : typeof normalized.temperature === "number" && Number.isFinite(normalized.temperature)
          ? normalized.temperature
          : 0;

    const modelOverride = normalized.model;

    return async ({ input, context }) => {
      const inputForQuery = typeof input === "string" || Array.isArray(input) ? input : [input];
      const query = agentExtractUserQuery(inputForQuery as string | UIMessage[] | BaseMessage[]);
      const trimmed = query?.trim();
      if (!trimmed) {
        return null;
      }

      const limitedInput =
        trimmed.length > CONVERSATION_TITLE_INPUT_MAX_CHARS
          ? trimmed.slice(0, CONVERSATION_TITLE_INPUT_MAX_CHARS)
          : trimmed;

      try {
        const resolvedModel = await agentResolveModel(modelOverride ?? stateModel, context);
        const messages: Array<{ role: "system" | "user"; content: string }> = [];
        if (systemPrompt.trim()) {
          messages.push({ role: "system", content: systemPrompt });
        }
        messages.push({ role: "user", content: limitedInput });
        const promptOptions = splitInstructionsFromMessages(messages as ModelMessage[]);
        const modelName = runtimeAgent.getModelName(resolvedModel);
        const llmSpan = agentCreateLLMSpan(context, {
          operation: "generateTitle",
          modelName,
          isStreaming: false,
          messages,
          callOptions: {
            ...(temperature !== undefined ? { temperature } : {}),
            maxOutputTokens,
          },
          label: "Generate Conversation Title",
        });
        llmSpan.setAttribute("input", limitedInput);
        const finalizeLLMSpan = agentCreateLLMSpanFinalizer(llmSpan);

        try {
          const result = await context.traceContext.withSpan(llmSpan, () =>
            generateText({
              model: resolvedModel,
              ...promptOptions,
              ...(temperature !== undefined ? { temperature } : {}),
              maxOutputTokens,
              abortSignal: context.abortController.signal,
            }),
          );

          const temperatureWarning = result.warnings?.find(isTemperatureWarning);
          if (temperatureWarning) {
            context.logger.warn(
              "[Memory] Conversation title generation model does not support temperature",
              {
                warning: safeStringify(temperatureWarning),
                hint: "Set generateTitle.temperature to null to omit temperature for title generation.",
              },
            );
          }

          const resolvedUsage = result.usage ? await Promise.resolve(result.usage) : undefined;
          const title = sanitizeConversationTitle(result.text ?? "", maxLength);
          if (title) {
            llmSpan.setAttribute("output", title);
          } else {
            context.logger.warn("[Memory] Conversation title generation returned an empty title", {
              text: result.text ?? "",
              finishReason: result.finishReason,
            });
          }
          finalizeLLMSpan(SpanStatusCode.OK, {
            usage: resolvedUsage,
            finishReason: result.finishReason,
            providerMetadata: (result as { providerMetadata?: unknown }).providerMetadata,
          });

          return title || null;
        } catch (error) {
          finalizeLLMSpan(SpanStatusCode.ERROR, { message: (error as Error).message });
          throw error;
        }
      } catch (error) {
        context.logger.warn("[Memory] Failed to generate conversation title", {
          message: error instanceof Error ? error.message : undefined,
          hint: "If your title generation model does not support temperature, set generateTitle.temperature to null.",
        });
        context.logger.debug("[Memory] Full error for title generation", {
          error: safeStringify(error),
        });
        return null;
      }
    };
  }

  /**
   * Prepare messages with system prompt and memory
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: legacy message preparation pipeline
  async function agentPrepareMessages(
    input: string | UIMessage[] | BaseMessage[],
    oc: OperationContext,
    options: AnyBaseGenerationOptions | undefined,
    buffer: ConversationBuffer,
    runtimeToolkits: Toolkit[] = [],
  ): Promise<UIMessage[]> {
    const resolvedInput = await agentValidateIncomingUIMessages(input, oc);
    const messages: UIMessage[] = [];
    const resolvedMemory = agentResolveMemoryRuntimeOptions(options, oc);
    const canIUseMemory = Boolean(resolvedMemory.userId);
    const shouldPersistMemory = resolvedMemory.readOnly !== true;
    const speculativeInputGuardrail = agentGetSpeculativeInputGuardrail(oc);
    const shouldPersistInputImmediately =
      shouldPersistMemory && (!speculativeInputGuardrail || speculativeInputGuardrail.hasPassed());
    const memoryContextMessages: UIMessage[] = [];

    // Load memory context if available (already returns UIMessages)
    if (canIUseMemory) {
      // Check if we should use semantic search
      // Default to true if vector support is available
      const useSemanticSearch =
        resolvedMemory.semanticMemory?.enabled ?? agentHasSemanticSearchSupport();

      // Extract user query for semantic search if enabled
      const currentQuery = useSemanticSearch ? agentExtractUserQuery(resolvedInput) : undefined;

      // Prepare memory read parameters
      const semanticLimit = resolvedMemory.semanticMemory?.semanticLimit ?? 5;
      const semanticThreshold = resolvedMemory.semanticMemory?.semanticThreshold ?? 0.7;
      const mergeStrategy = resolvedMemory.semanticMemory?.mergeStrategy ?? "append";
      const isSemanticSearch = useSemanticSearch && currentQuery;

      const traceContext = oc.traceContext;

      if (traceContext) {
        // Create unified memory read span

        const spanInput = {
          query: isSemanticSearch ? currentQuery : resolvedInput,
          userId: resolvedMemory.userId,
          conversationId: resolvedMemory.conversationId,
        };
        const memoryReadSpan = traceContext.createChildSpan("memory.read", "memory", {
          label: isSemanticSearch ? "Semantic Memory Read" : "Memory Context Read",
          attributes: {
            "memory.operation": "read",
            "memory.semantic": isSemanticSearch,
            input: safeStringify(spanInput),
            ...(isSemanticSearch && {
              "memory.semantic.limit": semanticLimit,
              "memory.semantic.threshold": semanticThreshold,
              "memory.semantic.merge_strategy": mergeStrategy,
            }),
          },
        });

        try {
          const memoryResult = await traceContext.withSpan(memoryReadSpan, async () => {
            if (isSemanticSearch) {
              // Semantic search
              const memMessages = await stateMemoryManager.getMessages(
                oc,
                oc.userId,
                oc.conversationId,
                resolvedMemory.contextLimit,
                {
                  useSemanticSearch: true,
                  currentQuery,
                  semanticLimit,
                  semanticThreshold,
                  mergeStrategy,
                  traceContext: traceContext,
                  parentMemorySpan: memoryReadSpan,
                },
              );
              buffer.ingestUIMessages(memMessages, true);
              return memMessages;
            }
            // Regular memory context
            // Convert model messages to UI for memory context if needed
            const inputForMemory =
              typeof resolvedInput === "string"
                ? resolvedInput
                : Array.isArray(resolvedInput) && (resolvedInput as any[])[0]?.parts
                  ? (resolvedInput as UIMessage[])
                  : convertModelMessagesToUIMessages(resolvedInput as BaseMessage[]);

            const result = await stateMemoryManager.prepareConversationContext(
              oc,
              inputForMemory,
              oc.userId,
              oc.conversationId,
              resolvedMemory.contextLimit,
              { persistInput: shouldPersistInputImmediately },
            );

            // Update conversation ID
            oc.conversationId = result.conversationId;
            if (oc.resolvedMemory) {
              oc.resolvedMemory.conversationId = result.conversationId;
            }

            buffer.ingestUIMessages(result.messages, true);

            if (
              shouldPersistMemory &&
              speculativeInputGuardrail &&
              !shouldPersistInputImmediately
            ) {
              agentQueueSaveInputWhenSpeculativeInputGuardrailPasses(
                speculativeInputGuardrail,
                oc,
                inputForMemory,
              );
            }

            return result.messages;
          });

          const retrievedMessagesCount = Array.isArray(memoryResult) ? memoryResult.length : 0;

          traceContext.endChildSpan(memoryReadSpan, "completed", {
            output: memoryResult,
            attributes: {
              "memory.message_count": retrievedMessagesCount,
            },
          });

          // Ensure conversation ID exists for semantic search
          if (isSemanticSearch && !oc.conversationId) {
            oc.conversationId = randomUUID();
            if (oc.resolvedMemory) {
              oc.resolvedMemory.conversationId = oc.conversationId;
            }
          }

          memoryContextMessages.push(...memoryResult);

          // When using semantic search, also persist the current input in background
          // so user messages are stored and embedded consistently.
          if (isSemanticSearch && shouldPersistMemory && oc.userId && oc.conversationId) {
            try {
              const inputForMemory =
                typeof resolvedInput === "string"
                  ? resolvedInput
                  : Array.isArray(resolvedInput) && (resolvedInput as any[])[0]?.parts
                    ? (resolvedInput as UIMessage[])
                    : convertModelMessagesToUIMessages(resolvedInput as BaseMessage[]);
              if (!speculativeInputGuardrail || speculativeInputGuardrail.hasPassed()) {
                stateMemoryManager.queueSaveInput(oc, inputForMemory, oc.userId, oc.conversationId);
              } else {
                agentQueueSaveInputWhenSpeculativeInputGuardrailPasses(
                  speculativeInputGuardrail,
                  oc,
                  inputForMemory,
                );
              }
            } catch (_e) {
              // Non-fatal: background persistence should not block message preparation
            }
          }
        } catch (error) {
          traceContext.endChildSpan(memoryReadSpan, "error", {
            error: error as Error,
          });
          throw error;
        }
      }
    }

    // Get system message with retriever context and working memory
    const systemMessage = await agentGetSystemMessage(resolvedInput, oc, options, runtimeToolkits);
    if (systemMessage) {
      const systemMessagesAsUI: UIMessage[] = (() => {
        if (typeof systemMessage === "string") {
          return [
            {
              id: randomUUID(),
              role: "system",
              parts: [
                {
                  type: "text",
                  text: systemMessage,
                },
              ],
            },
          ];
        }

        if (Array.isArray(systemMessage)) {
          return convertModelMessagesToUIMessages(systemMessage);
        }

        return convertModelMessagesToUIMessages([systemMessage]);
      })();

      for (const systemUIMessage of systemMessagesAsUI) {
        messages.push(systemUIMessage);
      }

      const instructionText = systemMessagesAsUI
        .flatMap((msg) =>
          msg.parts.flatMap((part) =>
            part.type === "text" && typeof (part as any).text === "string"
              ? [(part as any).text as string]
              : [],
          ),
        )
        .join("\n\n");

      if (instructionText) {
        oc.traceContext.setInstructions(instructionText);
      }
    }

    const middlewareRetryFeedback = agentConsumeMiddlewareRetryFeedback(oc);
    if (middlewareRetryFeedback) {
      messages.push({
        id: randomUUID(),
        role: "system",
        parts: [{ type: "text", text: middlewareRetryFeedback }],
      });
    }

    if (memoryContextMessages.length > 0) {
      messages.push(...memoryContextMessages);
    }

    // Add current input
    if (typeof resolvedInput === "string") {
      messages.push({
        id: randomUUID(),
        role: "user",
        parts: [{ type: "text", text: resolvedInput }],
      });
    } else if (Array.isArray(resolvedInput)) {
      const first = (resolvedInput as any[])[0];
      if (first && Array.isArray(first.parts)) {
        const inputMessages = resolvedInput as UIMessage[];
        const idsToReplace = new Set(
          inputMessages
            .map((message) => message.id)
            .filter((id): id is string => typeof id === "string" && id.trim().length > 0),
        );

        if (idsToReplace.size > 0) {
          for (let index = messages.length - 1; index >= 0; index--) {
            if (idsToReplace.has(messages[index].id)) {
              messages.splice(index, 1);
            }
          }
        }

        messages.push(...inputMessages);
      } else {
        messages.push(...convertModelMessagesToUIMessages(resolvedInput as BaseMessage[]));
      }
    }

    // Sanitize messages before passing them to the model-layer hooks
    const sanitizedMessages = sanitizeMessagesForModel(messages);
    const summarizedMessages = await applySummarization({
      messages: sanitizedMessages,
      operationContext: oc,
      summarization: stateSummarization,
      model: stateModel,
      resolveModel: agentResolveModel.bind(runtimeAgent),
      agent: runtimeAgent,
    });

    // Allow hooks to modify sanitized messages (while exposing the raw set when needed)
    const hooks = agentGetMergedHooks(options);
    if (hooks.onPrepareMessages) {
      const result = await hooks.onPrepareMessages({
        messages: summarizedMessages,
        rawMessages: messages,
        agent: runtimeAgent,
        context: oc,
      });
      const preparedMessages = result?.messages || summarizedMessages;
      return await validateUIMessages({ messages: preparedMessages });
    }

    return await validateUIMessages({ messages: summarizedMessages });
  }

  async function agentValidateIncomingUIMessages(
    input: string | UIMessage[] | BaseMessage[],
    oc: OperationContext,
  ): Promise<string | UIMessage[] | BaseMessage[]> {
    if (!Array.isArray(input) || input.length === 0) {
      return input;
    }

    const first = (input as any[])[0];
    if (!first || !Array.isArray((first as { parts?: unknown }).parts)) {
      return input;
    }

    try {
      return await validateUIMessages({ messages: input as UIMessage[] });
    } catch (error) {
      oc.logger?.error?.("Invalid UI messages", { error });
      throw error;
    }
  }

  function agentQueueSaveInputWhenSpeculativeInputGuardrailPasses(
    guardrail: SpeculativeInputGuardrailRun,
    oc: OperationContext,
    inputForMemory: string | UIMessage[],
  ): void {
    void guardrail
      .wait()
      .then((decision) => {
        if (decision.status !== "passed" || !oc.userId || !oc.conversationId) {
          return;
        }
        stateMemoryManager.queueSaveInput(oc, inputForMemory, oc.userId, oc.conversationId);
      })
      .catch((error) => {
        oc.logger?.debug?.("Failed to persist input after speculative guardrail", { error });
      });
  }

  /**
   * Get system message with dynamic instructions and retriever context
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: legacy system message assembly
  async function agentGetSystemMessage(
    input: string | UIMessage[] | BaseMessage[],
    oc: OperationContext,
    options?: AnyBaseGenerationOptions,
    runtimeToolkits: Toolkit[] = [],
  ): Promise<BaseMessage | BaseMessage[]> {
    const resolvedMemory = agentResolveMemoryRuntimeOptions(options, oc);
    const workingMemoryConversationId = oc.conversationId ?? resolvedMemory.conversationId;
    const workingMemoryUserId = oc.userId ?? resolvedMemory.userId;

    // Resolve dynamic instructions
    const promptHelper = VoltOpsClientClass.createPromptHelperWithFallback(
      stateId,
      stateName,
      typeof stateInstructions === "function" ? "" : stateInstructions,
      stateVoltOpsClient,
    );

    const dynamicValueOptions: DynamicValueOptions = {
      context: oc.context,
      headers: oc.requestHeaders,
      prompts: promptHelper,
    };

    const resolvedInstructions = await agentResolveValue(
      stateInstructions,
      oc,
      dynamicValueOptions,
    );

    // Add VoltOps prompt metadata to OpenTelemetry trace if available
    if (
      typeof resolvedInstructions === "object" &&
      "type" in resolvedInstructions &&
      "metadata" in resolvedInstructions
    ) {
      const promptContent = resolvedInstructions as PromptContent;
      if (promptContent.metadata && oc.traceContext) {
        const rootSpan = oc.traceContext.getRootSpan();
        const metadata = promptContent.metadata;

        // Add each metadata field as a separate attribute
        if (metadata.prompt_id) {
          rootSpan.setAttribute("prompt.id", metadata.prompt_id);
        }
        if (metadata.prompt_version_id) {
          rootSpan.setAttribute("prompt.version_id", metadata.prompt_version_id);
        }
        if (metadata.name) {
          rootSpan.setAttribute("prompt.name", metadata.name);
        }
        if (metadata.version !== undefined) {
          rootSpan.setAttribute("prompt.version", metadata.version);
        }
        if (metadata.labels && metadata.labels.length > 0) {
          rootSpan.setAttribute("prompt.labels", safeStringify(metadata.labels));
        }
        if (metadata.tags && metadata.tags.length > 0) {
          rootSpan.setAttribute("prompt.tags", safeStringify(metadata.tags));
        }
        if (metadata.source) {
          rootSpan.setAttribute("prompt.source", metadata.source);
        }
        if (metadata.latest_version !== undefined) {
          rootSpan.setAttribute("prompt.latest_version", metadata.latest_version);
        }
        if (metadata.outdated !== undefined) {
          rootSpan.setAttribute("prompt.outdated", metadata.outdated);
        }
        if (metadata.config) {
          rootSpan.setAttribute("prompt.config", safeStringify(metadata.config));
        }
      }
    }

    // Get retriever context if available
    let retrieverContext: string | null = null;
    if (stateRetriever && input) {
      retrieverContext = await agentGetRetrieverContext(input, oc);
    }

    // Get working memory instructions if available.
    // Prefer conversation scope when conversationId exists; otherwise fall back to user scope.
    let workingMemoryContext: string | null = null;
    const workingMemoryLookup =
      workingMemoryConversationId || workingMemoryUserId
        ? {
            ...(workingMemoryConversationId ? { conversationId: workingMemoryConversationId } : {}),
            ...(workingMemoryUserId ? { userId: workingMemoryUserId } : {}),
          }
        : undefined;
    if (agentHasWorkingMemorySupport() && workingMemoryLookup) {
      const memory = stateMemoryManager.getMemory();

      if (memory) {
        // Get full working memory instructions with current data
        const workingMemoryInstructions =
          await memory.getWorkingMemoryInstructions(workingMemoryLookup);

        if (workingMemoryInstructions) {
          workingMemoryContext = `\n\n${workingMemoryInstructions}`;
        }

        // Add working memory attributes to span for observability
        if (oc.traceContext) {
          const rootSpan = oc.traceContext.getRootSpan();

          // Get the raw working memory content
          const workingMemoryContent = await memory.getWorkingMemory(workingMemoryLookup);

          if (workingMemoryContent) {
            rootSpan.setAttribute("agent.workingMemory.content", workingMemoryContent);
            rootSpan.setAttribute("agent.workingMemory.enabled", true);

            // Detect format
            const format = memory.getWorkingMemoryFormat ? memory.getWorkingMemoryFormat() : null;
            rootSpan.setAttribute("agent.workingMemory.format", format || "text");

            // Add timestamp
            rootSpan.setAttribute("agent.workingMemory.lastUpdated", new Date().toISOString());
          } else {
            rootSpan.setAttribute("agent.workingMemory.enabled", true);
          }
        }
      }
    } else if (oc.traceContext) {
      // Working memory not supported/configured
      const rootSpan = oc.traceContext.getRootSpan();
      rootSpan.setAttribute("agent.workingMemory.enabled", false);
    }

    // Handle different instruction types
    if (typeof resolvedInstructions === "object" && "type" in resolvedInstructions) {
      const promptContent = resolvedInstructions as PromptContent;

      if (promptContent.type === "chat" && promptContent.messages) {
        const messages = [...promptContent.messages];

        // Add retriever context and working memory to last system message if available
        const additionalContext = [
          retrieverContext ? `Relevant Context:\n${retrieverContext}` : null,
          workingMemoryContext,
        ]
          .filter(Boolean)
          .join("\n\n");

        if (additionalContext) {
          const lastSystemIndex = messages
            .map((m, i) => ({ message: m, index: i }))
            .filter(({ message }) => message.role === "system")
            .pop()?.index;

          if (lastSystemIndex !== undefined) {
            const existingMessage = messages[lastSystemIndex];
            messages[lastSystemIndex] = {
              ...existingMessage,
              content: `${existingMessage.content}\n\n${additionalContext}`,
            } as typeof existingMessage;
          } else {
            messages.push({
              role: "system",
              content: additionalContext,
            } as SystemModelMessage);
          }
        }

        return messages;
      }

      if (promptContent.type === "text") {
        const baseContent = promptContent.text || "";
        const content = await agentEnrichInstructions(
          baseContent,
          retrieverContext,
          workingMemoryContext,
          oc,
          runtimeToolkits,
        );

        return {
          role: "system",
          content: `${content}`,
        };
      }
    }

    // Default string instructions
    const baseContent = typeof resolvedInstructions === "string" ? resolvedInstructions : "";
    const content = await agentEnrichInstructions(
      baseContent,
      retrieverContext,
      workingMemoryContext,
      oc,
      runtimeToolkits,
    );

    return {
      role: "system",
      content: `${content}`,
    };
  }

  /**
   * Add toolkit instructions
   */
  function agentAddToolkitInstructions(
    baseInstructions: string,
    runtimeToolkits: Toolkit[] = [],
  ): string {
    type ToolkitInstructionSource = {
      name: string;
      instructions?: string;
      addInstructions?: boolean;
    };

    const toolkits: ToolkitInstructionSource[] = stateToolManager.getToolkits().map((toolkit) => ({
      name: toolkit.name,
      instructions: toolkit.instructions,
      addInstructions: toolkit.addInstructions,
    }));
    const toolkitIndexByName = new Map<string, number>();

    for (const [index, toolkit] of toolkits.entries()) {
      toolkitIndexByName.set(toolkit.name, index);
    }

    for (const runtimeToolkit of runtimeToolkits) {
      const runtimeToolkitSource: ToolkitInstructionSource = {
        name: runtimeToolkit.name,
        instructions: runtimeToolkit.instructions,
        addInstructions: runtimeToolkit.addInstructions,
      };
      const existingIndex = toolkitIndexByName.get(runtimeToolkit.name);
      if (existingIndex === undefined) {
        toolkitIndexByName.set(runtimeToolkit.name, toolkits.length);
        toolkits.push(runtimeToolkitSource);
        continue;
      }

      // Keep static ordering, but prefer runtime toolkit definitions on name collisions.
      toolkits[existingIndex] = runtimeToolkitSource;
    }

    let toolInstructions = "";

    for (const toolkit of toolkits) {
      if (toolkit.addInstructions && toolkit.instructions) {
        toolInstructions += `\n\n${toolkit.instructions}`;
      }
    }

    return baseInstructions + toolInstructions;
  }

  /**
   * Enrich instructions with additional context and modifiers
   */
  async function agentEnrichInstructions(
    baseContent: string,
    retrieverContext: string | null,
    workingMemoryContext: string | null,
    oc: OperationContext,
    runtimeToolkits: Toolkit[] = [],
  ): Promise<string> {
    let content = baseContent;

    // Add toolkit instructions
    content = agentAddToolkitInstructions(content, runtimeToolkits);

    // Add markdown instruction
    if (stateMarkdown) {
      content = `${content}\n\nUse markdown to format your answers.`;
    }

    // Add retriever context
    if (retrieverContext) {
      content = `${content}\n\nRelevant Context:\n${retrieverContext}`;
    }

    // Add working memory context
    if (workingMemoryContext) {
      content = `${content}${workingMemoryContext}`;
    }

    // Add supervisor instructions if needed
    if (stateSubAgentManager.hasSubAgents()) {
      const agentsMemory = await agentPrepareAgentsMemory(oc);
      content = stateSubAgentManager.generateSupervisorSystemMessage(
        content,
        agentsMemory,
        stateSupervisorConfig,
      );
    }

    return content;
  }

  function agentExtractToolkits(items: LegacyToolInputItem[]): Toolkit[] {
    return items.filter(
      (item): item is Toolkit =>
        typeof item === "object" &&
        item !== null &&
        "tools" in item &&
        Array.isArray((item as Toolkit).tools),
    );
  }

  /**
   * Prepare agents memory for supervisor
   */
  async function agentPrepareAgentsMemory(oc: OperationContext): Promise<string> {
    try {
      const subAgents = stateSubAgentManager.getSubAgents();
      if (subAgents.length === 0) return "";

      // Get recent conversation steps
      const steps = oc.conversationSteps || [];
      const formattedMemory = steps
        .filter((step) => step.role !== "system" && step.role === "assistant")
        .map((step) => `${step.role}: ${step.content}`)
        .join("\n\n");

      return formattedMemory || "No previous agent interactions found.";
    } catch (error) {
      stateLogger.warn("Error preparing agents memory", { error });
      return "Error retrieving agent history.";
    }
  }

  /**
   * Get retriever context
   */
  async function agentGetRetrieverContext(
    input: string | UIMessage[] | BaseMessage[],
    oc: OperationContext,
  ): Promise<string | null> {
    if (!stateRetriever) return null;

    const startTime = Date.now();
    const retrieverLogger = oc.logger.child({
      operation: "retriever",
      retrieverId: stateRetriever.tool.name,
    });

    retrieverLogger.debug(buildAgentLogMessage(stateName, ActionType.START, "Retrieving context"), {
      event: LogEvents.RETRIEVER_SEARCH_STARTED,
      input,
    });

    // Create OpenTelemetry span for retriever using TraceContext
    const retrieverSpan = oc.traceContext.createChildSpan("retriever.search", "retriever", {
      label: stateRetriever.tool.name || "Retriever",
      attributes: {
        "retriever.name": stateRetriever.tool.name || "Retriever",
        input: typeof input === "string" ? input : safeStringify(input),
        ...agentGetRetrieverObservabilityAttributes(),
      },
    });

    // Event tracking now handled by OpenTelemetry spans

    try {
      // Prepare retriever input: pass through if ModelMessages, convert if UIMessage, or string
      const retrieverInput =
        typeof input === "string"
          ? input
          : Array.isArray(input) && (input as any[])[0]?.content !== undefined
            ? (input as BaseMessage[])
            : await convertToModelMessages(input as UIMessage[]);

      // Execute retriever with the span context
      const retrievedContent = await oc.traceContext.withSpan(retrieverSpan, async () => {
        if (!stateRetriever) return null;
        return await stateRetriever.retrieve(retrieverInput, {
          ...oc,
          logger: retrieverLogger,
        });
      });

      if (retrievedContent?.trim()) {
        const documentCount = retrievedContent
          .split("\n")
          .filter((line: string) => line.trim()).length;
        const durationMs = Date.now() - startTime;

        retrieverLogger.debug(
          buildAgentLogMessage(
            stateName,
            ActionType.COMPLETE,
            `Retrieved ${documentCount} documents`,
          ),
          {
            event: LogEvents.RETRIEVER_SEARCH_COMPLETED,
            documentCount,
            duration: durationMs,
          },
        );

        // Event tracking now handled by OpenTelemetry spans

        // End OpenTelemetry span successfully
        oc.traceContext?.endChildSpan(retrieverSpan, "completed", {
          output: retrievedContent,
          attributes: {
            "retriever.document_count": documentCount,
            ...agentGetRetrieverObservabilityAttributes(),
          },
        });

        return retrievedContent;
      }

      // End span if no content retrieved
      oc.traceContext?.endChildSpan(retrieverSpan, "completed", {
        output: null,
        attributes: {
          "retriever.document_count": 0,
          ...agentGetRetrieverObservabilityAttributes(),
        },
      });

      return null;
    } catch (error) {
      // Event tracking now handled by OpenTelemetry spans

      // End OpenTelemetry span with error
      const durationMs = Date.now() - startTime;

      oc.traceContext.endChildSpan(retrieverSpan, "error", {
        error: error as Error,
        attributes: {
          ...agentGetRetrieverObservabilityAttributes(),
        },
      });

      retrieverLogger.error(
        buildAgentLogMessage(
          stateName,
          ActionType.ERROR,
          `Retriever failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
        {
          event: LogEvents.RETRIEVER_SEARCH_FAILED,
          error: error instanceof Error ? error.message : String(error),
          duration: durationMs,
        },
      );

      stateLogger.warn("Failed to retrieve context", { error, agentId: stateId });
      return null;
    }
  }

  function agentGetRetrieverObservabilityAttributes(): Record<string, unknown> {
    const candidate = stateRetriever as
      | {
          getObservabilityAttributes?: () => Record<string, unknown>;
        }
      | undefined;

    if (candidate && typeof candidate.getObservabilityAttributes === "function") {
      return candidate.getObservabilityAttributes();
    }

    return {};
  }

  /**
   * Resolve dynamic value
   */
  async function agentResolveValue<T>(
    value: T | DynamicValue<T>,
    oc: OperationContext,
    options?: DynamicValueOptions,
  ): Promise<T> {
    if (typeof value === "function") {
      const dynamicValue = value as DynamicValue<T>;
      const resolveOptions: DynamicValueOptions =
        options ||
        (statePrompts
          ? {
              context: oc.context,
              headers: oc.requestHeaders,
              prompts: statePrompts,
            }
          : {
              context: oc.context,
              headers: oc.requestHeaders,
              prompts: {
                getPrompt: async () => ({ type: "text" as const, text: "" }),
              },
            });
      return await dynamicValue(resolveOptions);
    }
    return value;
  }

  function agentGetModelCandidates(model: AgentModelValue = stateModel): AgentModelConfig[] {
    if (Array.isArray(model)) {
      if (model.length === 0) {
        throw createVoltAgentError("Model list is empty", { code: "MODEL_LIST_EMPTY" });
      }

      return model.map((entry) => ({
        id: entry.id,
        model: entry.model,
        maxRetries: entry.maxRetries,
        enabled: entry.enabled ?? true,
      }));
    }

    return [
      {
        model,
        maxRetries: stateMaxRetries,
        enabled: true,
      },
    ];
  }

  async function agentResolveModelReference(
    value: AgentModelConfig["model"],
    oc: OperationContext,
  ): Promise<LanguageModel> {
    const resolved = await agentResolveValue(value, oc);
    if (typeof resolved === "string") {
      return await ModelProviderRegistry.getInstance().resolveLanguageModel(resolved);
    }
    return resolved;
  }

  /**
   * Resolve agent model value (LanguageModel or provider/model string)
   */
  async function agentResolveModel(
    value: AgentModelValue,
    oc: OperationContext,
  ): Promise<LanguageModel> {
    if (Array.isArray(value)) {
      const enabledModels = value.filter((entry) => entry.enabled !== false);
      if (enabledModels.length === 0) {
        throw createVoltAgentError("No enabled models configured", { code: "MODEL_LIST_EMPTY" });
      }
      return await agentResolveModelReference(enabledModels[0].model, oc);
    }

    return await agentResolveModelReference(value, oc);
  }

  function agentResolveCallMaxRetries(
    candidate: AgentModelConfig,
    options?: AnyBaseGenerationOptions,
  ): number {
    const maxRetries =
      options?.maxRetries ?? candidate.maxRetries ?? stateMaxRetries ?? DEFAULT_LLM_MAX_RETRIES;
    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new InvalidArgumentError({
        parameter: "maxRetries",
        value: maxRetries,
        message: "maxRetries must be a non-negative integer",
      });
    }
    return maxRetries;
  }

  function agentShouldFallbackOnError(error: unknown): boolean {
    if (isBailError(error)) {
      return false;
    }

    if (error instanceof Error && error.name === "AbortError") {
      return false;
    }

    if (isVoltAgentError(error)) {
      if (error.code === "GUARDRAIL_INPUT_BLOCKED" || error.code === "GUARDRAIL_OUTPUT_BLOCKED") {
        return false;
      }
      if (error.stage === "tool_execution") {
        return false;
      }
    }

    return true;
  }

  function agentIsRetryableError(error: unknown): boolean {
    const retryable = (error as { isRetryable?: boolean } | undefined)?.isRetryable;
    if (typeof retryable === "boolean") {
      return retryable;
    }
    return true;
  }

  function agentGetEffectiveModelName(oc: OperationContext, model: LanguageModel): string {
    return (
      (oc.systemContext.get(EFFECTIVE_MODEL_NAME_CONTEXT_KEY) as string | undefined) ??
      runtimeAgent.getModelName(model)
    );
  }

  function agentConfigureStepModelRetries<
    TOOLS extends ToolSet,
    RUNTIME_CONTEXT extends AISDKContext,
    OUTPUT extends OutputSpec,
  >(
    sdkOptions: AITextCallOptions<TOOLS, RUNTIME_CONTEXT, OUTPUT>,
    oc: OperationContext,
    operation: LLMOperation,
    options?: AnyBaseGenerationOptions,
  ): void {
    const prepareStep = sdkOptions.prepareStep;
    if (!prepareStep) return;
    sdkOptions.prepareStep = async (step) => {
      const settings = await prepareStep(step);
      if (!settings?.model || isRetryingLanguageModel(settings.model)) return settings;
      const { result: model } = await agentExecuteWithModelFallback({
        oc,
        operation,
        options,
        candidates: [{ model: settings.model }],
        run: async ({ model }) => model,
      });
      return { ...settings, model };
    };
  }

  /** Run the SDK loop once; retry only its individual provider calls. */
  async function agentExecuteWithModelFallback<T>({
    oc,
    operation,
    options,
    run,
    candidates,
  }: {
    oc: OperationContext;
    operation: LLMOperation;
    options?: AnyBaseGenerationOptions;
    candidates?: AgentModelConfig[];
    run: (args: ModelAttempt) => Promise<T>;
  }): Promise<{ result: T; modelName: string; modelIndex: number; maxRetries: number }> {
    const state: ModelRetryState = {
      candidates: (candidates ?? agentGetModelCandidates(options?.model)).filter(
        (entry) => entry.enabled !== false,
      ),
      resolved: new Map(),
      modelIndex: 0,
    };
    const initial = await agentExecuteModelAttempts({
      oc,
      operation,
      options,
      state,
      run: async (attempt) => attempt,
    });
    if (typeof initial.result.model === "string") {
      throw new Error("Model resolution must return a provider model");
    }
    const model = createRetryingLanguageModel(
      initial.result.model,
      async (invoke, params, streaming) => {
        const signal = params.abortSignal
          ? AbortSignal.any([oc.abortController.signal, params.abortSignal])
          : oc.abortController.signal;
        const attemptResult = await agentExecuteModelAttempts({
          oc,
          operation,
          options,
          state,
          signal,
          run: async (attempt) => {
            if (typeof attempt.model === "string") throw new Error("Unresolved provider model");
            oc.systemContext.set(EFFECTIVE_MODEL_NAME_CONTEXT_KEY, attempt.modelName);
            addModelAttributesToSpan(
              oc.traceContext.getRootSpan(),
              attempt.modelName,
              options,
              stateMaxOutputTokens,
              stateTemperature,
            );
            const span = agentCreateLLMSpan(oc, {
              operation,
              modelName: attempt.modelName,
              isStreaming: streaming,
              messages: params.prompt,
              providerOptions: params.providerOptions,
              callOptions: { ...params, ...attempt, model: undefined },
              label: "Model attempt",
            });
            span.setAttribute("llm.provider_attempt", true);
            const finalize = agentCreateLLMSpanFinalizer(span);
            try {
              const response = await oc.traceContext.withSpan(span, () =>
                invoke(attempt.model as Exclude<LanguageModel, string>),
              );
              if ("stream" in response) {
                const reader = response.stream.getReader();
                const stream = new ReadableStream(
                  {
                    pull: async (controller) => {
                      try {
                        const next = await oc.traceContext.withSpan(span, () => reader.read());
                        if (next.done) {
                          finalize(SpanStatusCode.OK);
                          reader.releaseLock();
                          controller.close();
                        } else {
                          if (next.value.type === "error")
                            finalize(SpanStatusCode.ERROR, { message: String(next.value.error) });
                          if (next.value.type === "finish")
                            finalize(SpanStatusCode.OK, {
                              finishReason: next.value.finishReason.unified,
                            });
                          controller.enqueue(next.value);
                        }
                      } catch (error) {
                        finalize(SpanStatusCode.ERROR, { message: String(error) });
                        reader.releaseLock();
                        controller.error(error);
                      }
                    },
                    cancel: async (reason) => {
                      finalize(SpanStatusCode.ERROR, { message: "Model stream cancelled" });
                      try {
                        await reader.cancel(reason);
                      } finally {
                        reader.releaseLock();
                      }
                    },
                  },
                  { highWaterMark: 0 },
                );
                return { ...response, stream };
              }
              finalize(SpanStatusCode.OK, { finishReason: response.finishReason.unified });
              return response;
            } catch (error) {
              finalize(SpanStatusCode.ERROR, { message: String(error) });
              throw error;
            }
          },
        });
        return attemptResult.result;
      },
    );
    const result = await run({ ...initial.result, model, isLastAttempt: true, isLastModel: true });
    return {
      result,
      modelName: agentGetEffectiveModelName(oc, model),
      modelIndex: state.modelIndex,
      maxRetries: agentResolveCallMaxRetries(state.candidates[state.modelIndex], options),
    };
  }

  async function agentExecuteModelAttempts<T>({
    oc,
    operation,
    options,
    run,
    state,
    signal = oc.abortController.signal,
  }: {
    oc: OperationContext;
    operation: LLMOperation;
    options?: AnyBaseGenerationOptions;
    run: (args: ModelAttempt) => Promise<T>;
    state: ModelRetryState;
    signal?: AbortSignal;
  }): Promise<{
    result: T;
    modelName: string;
    modelIndex: number;
    maxRetries: number;
  }> {
    const logger = oc.logger ?? stateLogger;
    const hooks = agentGetMergedHooks(options);
    const candidates = state.candidates;

    if (candidates.length === 0) {
      throw createVoltAgentError("No enabled models configured", { code: "MODEL_LIST_EMPTY" });
    }

    logger.debug(`[Agent:${stateName}] - Model fallback candidates`, {
      operation,
      candidates: candidates.map((candidate, index) => ({
        index,
        id: candidate.id ?? null,
        enabled: candidate.enabled ?? true,
        model:
          typeof candidate.model === "string"
            ? candidate.model
            : typeof candidate.model === "function"
              ? "dynamic"
              : candidate.model?.modelId || "unknown",
        maxRetries: candidate.maxRetries ?? null,
      })),
    });

    let lastError: unknown;
    const startModelIndex = state.modelIndex;

    for (let index = startModelIndex; index < candidates.length; index++) {
      state.modelIndex = index;
      const candidate = candidates[index];
      const isLastModel = index === candidates.length - 1;
      let resolvedModel: LanguageModel;
      let modelName = "unknown";

      try {
        resolvedModel =
          state.resolved.get(index) ?? (await agentResolveModelReference(candidate.model, oc));
        state.resolved.set(index, resolvedModel);
        modelName = runtimeAgent.getModelName(resolvedModel);
      } catch (error) {
        lastError = error;
        if (signal.aborted) {
          throw error;
        }
        const candidateModelName =
          typeof candidate.model === "string"
            ? candidate.model
            : typeof candidate.model === "function"
              ? (candidate.id ?? "dynamic")
              : (candidate.model?.modelId ?? candidate.id ?? "unknown");
        const modelMaxRetries = agentResolveCallMaxRetries(candidate, options);
        const resolveSpan = agentCreateLLMSpan(oc, {
          operation,
          modelName: candidateModelName,
          isStreaming: operation === "streamText" || operation === "streamObject",
          callOptions: {
            maxRetries: modelMaxRetries,
            modelIndex: index,
            attempt: 1,
            modelId: candidate.id,
          },
        });
        resolveSpan.setAttribute("llm.model_resolution_failed", true);
        const resolveError = error instanceof Error ? error : new Error(String(error));
        resolveSpan.recordException(resolveError);
        resolveSpan.setStatus({ code: SpanStatusCode.ERROR, message: resolveError.message });
        resolveSpan.end();
        if (!agentShouldFallbackOnError(error) || isLastModel) {
          throw error;
        }
        const nextCandidate = candidates[index + 1];
        const nextCandidateName =
          typeof nextCandidate?.model === "string"
            ? nextCandidate.model
            : typeof nextCandidate?.model === "function"
              ? (nextCandidate?.id ?? "dynamic")
              : (nextCandidate?.model?.modelId ?? nextCandidate?.id ?? null);
        await hooks.onFallback?.({
          agent: runtimeAgent,
          context: oc,
          operation,
          stage: "resolve",
          fromModel: candidateModelName,
          fromModelIndex: index,
          maxRetries: modelMaxRetries,
          error,
          nextModel: nextCandidateName,
          nextModelIndex: nextCandidate ? index + 1 : undefined,
        });
        signal.throwIfAborted();
        logger.warn(`[Agent:${stateName}] - Failed to resolve model, falling back`, {
          error: safeStringify(error),
          modelIndex: index,
          operation,
        });
        continue;
      }

      const maxRetries = agentResolveCallMaxRetries(candidate, options);
      let attemptIndex = 0;

      while (attemptIndex <= maxRetries) {
        // Match SDK retry semantics: the first provider invocation receives the
        // abort signal; cancellation must prevent any recovery invocation.
        if (attemptIndex > 0 || index > startModelIndex) signal.throwIfAborted();
        const attempt = attemptIndex + 1;
        const isLastAttempt = attemptIndex === maxRetries;

        try {
          const result = await run({
            model: resolvedModel,
            modelName,
            modelId: candidate.id,
            maxRetries,
            modelIndex: index,
            isLastModel,
            attempt,
            isLastAttempt,
          });
          return { result, modelName, modelIndex: index, maxRetries };
        } catch (error) {
          lastError = error;
          if (signal.aborted) {
            throw error;
          }
          const fallbackEligible = agentShouldFallbackOnError(error);
          const retryEligible = fallbackEligible && agentIsRetryableError(error);
          const canRetry = retryEligible && !isLastAttempt;

          if (canRetry) {
            const retryDelayMs = computeRetryDelayMs(error, attemptIndex);
            logger.debug(`[Agent:${stateName}] - Model attempt failed, retrying`, {
              operation,
              modelName,
              modelIndex: index,
              attempt,
              nextAttempt: attempt + 1,
              maxRetries,
              retryDelayMs,
              fallbackEligible,
              retryEligible,
              isRetryable: (error as any)?.isRetryable,
              statusCode: (error as any)?.statusCode,
              error: safeStringify(error),
            });

            await hooks.onRetry?.({
              agent: runtimeAgent,
              context: oc,
              operation,
              source: "llm",
              modelName,
              modelIndex: index,
              attempt,
              nextAttempt: attempt + 1,
              maxRetries,
              error,
              isRetryable: (error as any)?.isRetryable,
              statusCode: (error as any)?.statusCode,
            });

            attemptIndex += 1;
            if (retryDelayMs > 0) {
              await waitForModelRetry(retryDelayMs, signal);
            }
            continue;
          }

          if (!fallbackEligible || isLastModel) {
            logger.debug(`[Agent:${stateName}] - Fallback skipped`, {
              operation,
              modelName,
              modelIndex: index,
              attempt,
              maxRetries,
              fallbackEligible,
              retryEligible,
              isLastModel,
              error: safeStringify(error),
            });
            throw error;
          }

          const nextCandidate = candidates[index + 1];
          const nextCandidateName =
            typeof nextCandidate?.model === "string"
              ? nextCandidate.model
              : typeof nextCandidate?.model === "function"
                ? (nextCandidate?.id ?? "dynamic")
                : (nextCandidate?.model?.modelId ?? nextCandidate?.id ?? null);
          await hooks.onFallback?.({
            agent: runtimeAgent,
            context: oc,
            operation,
            stage: "execute",
            fromModel: modelName,
            fromModelIndex: index,
            maxRetries,
            attempt,
            error,
            nextModel: nextCandidateName,
            nextModelIndex: nextCandidate ? index + 1 : undefined,
          });
          signal.throwIfAborted();
          logger.warn(`[Agent:${stateName}] - Model failed, trying fallback`, {
            error: safeStringify(error),
            modelName,
            modelIndex: index,
            operation,
            attempt,
            maxRetries,
          });
          break;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Model execution failed");
  }

  async function agentProbeStreamStart<PART extends { type?: string }>(
    stream: AsyncIterableStream<PART>,
    state: { hasOutput: boolean; lastError?: unknown },
  ): Promise<
    | { status: "ok"; stream: AsyncIterableStream<PART> }
    | { status: "error"; error: unknown; stream: AsyncIterableStream<PART> }
  > {
    const readableStream = stream as ReadableStream<PART>;
    const canTee =
      readableStream &&
      typeof readableStream.getReader === "function" &&
      typeof readableStream.tee === "function";

    if (!canTee) {
      return { status: "ok", stream };
    }

    const [probeReadable, passthroughReadable] = readableStream.tee();
    const passthroughStream = agentToAsyncIterableStream(passthroughReadable);
    const reader = probeReadable.getReader();

    let sawNonStart = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (!value) {
          continue;
        }
        const partType = (value as { type?: string }).type;
        if (partType === "start") {
          continue;
        }
        sawNonStart = true;
        if (partType === "error") {
          const error =
            (value as { error?: unknown }).error ??
            state.lastError ??
            new Error("Stream error before output");
          return { status: "error", error, stream: passthroughStream };
        }
        state.hasOutput = true;
        return { status: "ok", stream: passthroughStream };
      }
    } catch (error) {
      return {
        status: "error",
        error: state.lastError ?? error,
        stream: passthroughStream,
      };
    } finally {
      void reader.cancel().catch(() => {
        // Ignore probe cancellation errors.
      });

      try {
        reader.releaseLock();
      } catch (_) {
        // Ignore lock release errors.
      }
    }

    const error = state.lastError ?? new Error("Stream ended before output");
    return sawNonStart
      ? { status: "ok", stream: passthroughStream }
      : { status: "error", error, stream: passthroughStream };
  }

  function agentCloneResultWithStream<
    TResult extends {
      stream: AsyncIterableStream<unknown>;
    },
  >(result: TResult, stream: TResult["stream"]): TResult {
    const prototype = Object.getPrototypeOf(result);
    const clone = Object.create(prototype) as TResult;
    const descriptors = Object.getOwnPropertyDescriptors(result);
    Object.defineProperties(clone, descriptors);
    Object.defineProperty(clone, "stream", {
      value: stream,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    return clone;
  }

  function agentWithProbedFullStream<
    TResult extends {
      stream: AsyncIterableStream<unknown>;
    },
  >(
    result: TResult,
    originalFullStream: TResult["stream"],
    probedFullStream: TResult["stream"],
  ): TResult {
    if (probedFullStream === originalFullStream) {
      return result;
    }

    if (agentUsesGetterBasedTeeingFullStream(result)) {
      // AI SDK stream results expose fullStream via a teeing getter.
      // Preserving the original instance keeps that multi-consumer behavior intact.
      return result;
    }

    return agentCloneResultWithStream(result, probedFullStream);
  }

  function agentUsesGetterBasedTeeingFullStream(result: {
    stream: AsyncIterableStream<unknown>;
  }): boolean {
    const descriptor = agentFindPropertyDescriptor(result, "stream");
    return (
      typeof descriptor?.get === "function" &&
      typeof (result as { teeStream?: unknown }).teeStream === "function"
    );
  }

  function agentFindPropertyDescriptor(
    target: object,
    propertyName: string,
  ): PropertyDescriptor | undefined {
    let current: object | null = target;
    while (current) {
      const descriptor = Object.getOwnPropertyDescriptor(current, propertyName);
      if (descriptor) {
        return descriptor;
      }
      current = Object.getPrototypeOf(current);
    }
    return undefined;
  }

  function agentToAsyncIterableStream<T>(stream: ReadableStream<T>): AsyncIterableStream<T> {
    const asyncStream = stream as AsyncIterableStream<T>;

    if (!asyncStream[Symbol.asyncIterator]) {
      asyncStream[Symbol.asyncIterator] = async function* () {
        const reader = stream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            if (value !== undefined) {
              yield value;
            }
          }
        } finally {
          reader.releaseLock();
        }
      };
    }

    return asyncStream;
  }

  function agentDiscardStream(stream: AsyncIterableStream<unknown>): void {
    void consumeStream({ stream, onError: () => {} }).catch(() => {});
  }

  /**
   * Prepare tools with execution context
   */
  async function agentPrepareTools(
    adHocTools: LegacyToolInputItem[],
    oc: OperationContext,
    maxSteps: number,
    options?: AnyBaseGenerationOptions,
    adHocToolSets: ToolSet[] = [],
  ): Promise<Record<string, any>> {
    const resolvedMemory = agentResolveMemoryRuntimeOptions(options, oc);
    const hooks = agentGetMergedHooks(options);
    const createToolExecuteFunction = agentCreateToolExecutionFactory(oc, hooks);
    const createAiSdkToolExecuteFunction = agentCreateAiSdkToolExecutionFactory(oc, hooks);
    if (options?.toolApproval !== undefined) {
      oc.systemContext.set(TOOL_APPROVAL_CONTEXT_KEY, options.toolApproval);
    }
    if (options?.toolsContext !== undefined) {
      oc.systemContext.set(AI_SDK_TOOLS_CONTEXT_KEY, options.toolsContext);
    }
    if ((options as { runtimeContext?: unknown } | undefined)?.runtimeContext !== undefined) {
      oc.systemContext.set(
        AI_SDK_RUNTIME_CONTEXT_KEY,
        (options as { runtimeContext?: unknown }).runtimeContext,
      );
    }

    const runtimeTools: LegacyToolInputItem[] = [...adHocTools];

    // Add delegate tool if we have subagents
    if (stateSubAgentManager.hasSubAgents()) {
      const delegateTool = stateSubAgentManager.createDelegateTool({
        sourceAgent: runtimeAgent,
        currentHistoryEntryId: oc.operationId,
        operationContext: oc,
        maxSteps: maxSteps,
        conversationId: resolvedMemory.conversationId,
        userId: resolvedMemory.userId,
      });
      runtimeTools.push(delegateTool);
    }
    // Add working memory tools if Memory V2 with working memory is configured
    const workingMemoryTools = agentCreateWorkingMemoryTools(options, oc);
    if (workingMemoryTools.length > 0) {
      runtimeTools.push(...workingMemoryTools);
    }

    const tempManager = new ToolManager(runtimeTools, stateLogger);
    for (const toolSet of adHocToolSets) {
      tempManager.addToolSet(toolSet);
    }

    const preparedDynamicTools = tempManager.prepareToolsForExecution(
      createToolExecuteFunction,
      createAiSdkToolExecuteFunction,
    );
    const preparedStaticTools = stateToolManager.prepareToolsForExecution(
      createToolExecuteFunction,
      createAiSdkToolExecuteFunction,
    );
    const allPreparedTools = { ...preparedStaticTools, ...preparedDynamicTools };
    const finalizePreparedTools = (tools: Record<string, any>) => {
      oc.systemContext.set(AI_SDK_TOOLS_KEY, allPreparedTools);
      return tools;
    };

    const toolRouting = agentResolveToolRouting(options);
    oc.systemContext.set(TOOL_ROUTING_CONTEXT_KEY, toolRouting);
    if (toolRouting === false) {
      const conflicts = new Set<string>();
      for (const tool of [...stateToolManager.getAllTools(), ...tempManager.getAllTools()]) {
        if (agentIsToolRoutingSupportTool(tool)) {
          conflicts.add(tool.name);
        }
      }
      if (conflicts.size > 0) {
        throw new Error(
          [
            "toolRouting is disabled but internal routing support tools are in use:",
            Array.from(conflicts).join(", "),
            "Enable toolRouting or remove internal routing tools before disabling it for this request.",
          ].join(" "),
        );
      }

      return finalizePreparedTools(allPreparedTools);
    }

    if (!toolRouting) {
      return finalizePreparedTools(allPreparedTools);
    }

    const exposedNames = agentGetToolRoutingExposedNames(toolRouting);
    const filteredStaticTools = Object.fromEntries(
      Object.entries(preparedStaticTools).filter(([name]) => exposedNames.has(name)),
    );

    return finalizePreparedTools({ ...filteredStaticTools, ...preparedDynamicTools });
  }

  /**
   * Validate tool output against optional output schema.
   */
  async function agentValidateToolOutput(result: any, tool: Tool<any, any>): Promise<any> {
    if (!tool.outputSchema?.safeParse) {
      return result;
    }

    // Validate output if schema provided
    const parseResult = tool.outputSchema.safeParse(result);
    if (!parseResult.success) {
      const error = new Error(`Output validation failed: ${parseResult.error.message}`);
      Object.assign(error, {
        validationErrors: getValidationIssues(parseResult.error),
        actualOutput: result,
      });

      throw error;
    }

    return parseResult.data;
  }

  function agentConfigureNativeToolExecution<
    TOOLS extends ToolSet,
    RUNTIME_CONTEXT extends AISDKContext,
    OUTPUT extends OutputSpec,
  >(options: AITextCallOptions<TOOLS, RUNTIME_CONTEXT, OUTPUT>, oc: OperationContext): void {
    // Tools are resolved dynamically at the SDK boundary, as in the generation
    // call adapters. Keep the concrete callback typing local to this boundary.
    const sdkOptions = options as unknown as AITextCallOptions;
    const getExecute = (name: string) => {
      const tools = oc.systemContext.get(AI_SDK_TOOLS_KEY) as ToolSet | undefined;
      return tools?.[name]?.execute;
    };
    const onStart = sdkOptions.onToolExecutionStart;
    sdkOptions.onToolExecutionStart = async (event) => {
      await Promise.all([
        prepareNativeToolExecution(getExecute(event.toolCall.toolName), event.toolCall.input, {
          toolCallId: event.toolCall.toolCallId,
          messages: event.messages,
          abortSignal: oc.abortController.signal,
          context: event.toolContext,
        }),
        invokeAISDKCallbackSafely(onStart, event, oc.logger, "onToolExecutionStart"),
      ]);
    };
    const onEnd = sdkOptions.onToolExecutionEnd;
    sdkOptions.onToolExecutionEnd = async (event) => {
      // Also release preparation if another SDK execution integration failed
      // before it called our tool. Normal executions dispose themselves.
      disposeNativeToolExecution(
        getExecute(event.toolCall.toolName),
        event.toolCall.toolCallId,
        event.toolOutput.type === "tool-error" ? { error: event.toolOutput.error } : undefined,
      );
      await invokeAISDKCallbackSafely(onEnd, event, oc.logger, "onToolExecutionEnd");
    };

    const prepareStep = options.prepareStep;
    options.prepareStep = async (step) => {
      const settings = await prepareStep?.(step);
      // callTool executes hidden tools itself. Use the same current-step context
      // that the SDK passes to directly exposed tools, including carried values.
      oc.systemContext.set(AI_SDK_TOOLS_CONTEXT_KEY, settings?.toolsContext ?? step.toolsContext);
      oc.systemContext.set(
        AI_SDK_RUNTIME_CONTEXT_KEY,
        settings?.runtimeContext ?? step.runtimeContext,
      );
      return settings;
    };
  }

  function agentCreateAiSdkToolExecutionFactory(
    oc: OperationContext,
    hooks: AgentHooks,
  ): (
    name: string,
    tool: AITool<any, any, any>,
    metadata?: VoltAgentToolMetadata,
  ) => (args: any, options?: ToolExecutionOptions<any>) => ToolExecutionResult<any> {
    return (name, tool, metadata) => {
      const execute = tool.execute;
      const toolDisplayName =
        typeof metadata?.name === "string" && metadata.name.trim().length > 0
          ? metadata.name.trim()
          : undefined;
      const toolPurpose =
        typeof metadata?.purpose === "string" && metadata.purpose.trim().length > 0
          ? metadata.purpose.trim()
          : undefined;
      const toolInfo = {
        name,
        displayName: toolDisplayName,
        purpose: toolPurpose,
        description:
          typeof (tool as { description?: unknown }).description === "string"
            ? (tool as { description: string }).description
            : "",
        parameters:
          (tool as { inputSchema?: unknown; args?: unknown }).inputSchema ??
          (tool as { args?: unknown }).args,
        outputSchema: (tool as { outputSchema?: unknown }).outputSchema,
        tags: metadata?.tags,
        needsApproval:
          metadata?.needsApproval ??
          (tool as { needsApproval?: Tool<any, any>["needsApproval"] }).needsApproval,
        providerOptions: (tool as { providerOptions?: unknown }).providerOptions,
        toModelOutput: (tool as { toModelOutput?: unknown }).toModelOutput,
        hooks: metadata?.hooks,
        execute,
        isClientSide: () => typeof execute !== "function",
      } as unknown as Tool<any, any>;

      return createNativeToolExecutor((args, options) => {
        const toolCallId = options?.toolCallId ?? randomUUID();
        const messages = options?.messages ?? [];
        const abortSignal = options?.abortSignal;
        const executionOptions: ToolExecuteOptions = {
          ...oc,
          toolContext: {
            name,
            callId: toolCallId,
            messages,
            abortSignal,
          },
        };
        executionOptions.hooks = hooks;

        const toolTags = metadata?.tags;
        const toolSpan = oc.traceContext.createChildSpan(`tool.execution:${name}`, "tool", {
          label: name,
          attributes: {
            "tool.name": name,
            ...(toolDisplayName ? { "tool.display_name": toolDisplayName } : {}),
            ...(toolPurpose ? { "tool.purpose": toolPurpose } : {}),
            "tool.call.id": toolCallId,
            "tool.description": toolInfo.description,
            ...(toolTags && toolTags.length > 0 ? { "tool.tags": safeStringify(toolTags) } : {}),
            "tool.parameters": safeStringify(toolInfo.parameters),
            input: args ? safeStringify(args) : undefined,
          },
          kind: SpanKind.CLIENT,
        });

        oc.systemContext.set("agentId", stateId);
        oc.systemContext.set("historyEntryId", oc.operationId);
        executionOptions.parentToolSpan = toolSpan;

        const hasOutputOverride = (
          value: unknown,
        ): value is {
          output?: unknown;
        } => {
          if (!value || typeof value !== "object") {
            return false;
          }
          return Object.prototype.hasOwnProperty.call(value, "output");
        };

        const runToolStartHooks = async () => {
          await metadata?.hooks?.onStart?.({
            tool: toolInfo,
            args,
            options: executionOptions,
          });
          await hooks.onToolStart?.({
            agent: runtimeAgent,
            tool: toolInfo,
            context: oc,
            args,
            options: executionOptions,
          });
        };

        let spanOutcome:
          | { status: "completed"; output?: unknown }
          | { status: "error"; error?: Error | any }
          | null = null;

        const finalizeToolSpan = () => {
          const shouldEnd =
            typeof toolSpan.isRecording === "function" ? toolSpan.isRecording() : true;
          if (!shouldEnd) {
            return;
          }
          const status = spanOutcome?.status ?? "completed";
          oc.traceContext.endChildSpan(toolSpan, status, {
            output: spanOutcome?.status === "completed" ? spanOutcome.output : undefined,
            error: spanOutcome?.status === "error" ? spanOutcome.error : undefined,
          });
        };

        const validateOutput = async (output: unknown): Promise<unknown> => {
          if (!metadata?.validateOutput || !tool.outputSchema) {
            return output;
          }
          return validateTypes({
            value: output,
            schema: tool.outputSchema,
            context: { field: "tool output", entityName: name },
          });
        };

        const resolveToolEndOutput = async (currentOutput: any) => {
          let output = currentOutput;
          let overrideProvided = false;

          const toolHookResult = await metadata?.hooks?.onEnd?.({
            tool: toolInfo,
            args,
            output,
            error: undefined,
            options: executionOptions,
          });
          if (hasOutputOverride(toolHookResult)) {
            output = toolHookResult.output;
            overrideProvided = true;
          }

          const agentHookResult = await hooks.onToolEnd?.({
            agent: runtimeAgent,
            tool: toolInfo,
            output,
            error: undefined,
            context: oc,
            options: executionOptions,
          });
          if (hasOutputOverride(agentHookResult)) {
            output = agentHookResult.output;
            overrideProvided = true;
          }

          if (overrideProvided) {
            output = await validateOutput(output);
          }

          return output;
        };

        const handleToolSuccess = async (_result: any, validatedResult: any) => {
          const finalOutput = await resolveToolEndOutput(validatedResult);
          spanOutcome = { status: "completed", output: finalOutput };
          return finalOutput;
        };

        const handleToolError = async (errorValue: unknown) => {
          const error = errorValue instanceof Error ? errorValue : new Error(String(errorValue));
          const voltAgentError = createVoltAgentError(error, {
            stage: "tool_execution",
            toolError: {
              toolCallId,
              toolName: name,
              toolExecutionError: error,
              toolArguments: args,
            },
          });
          let errorOutputOverride: unknown;
          let hasErrorOutputOverride = false;

          spanOutcome = { status: "error", error: voltAgentError };

          await metadata?.hooks?.onEnd?.({
            tool: toolInfo,
            args,
            output: undefined,
            error: voltAgentError,
            options: executionOptions,
          });

          const onToolErrorResult = await hooks.onToolError?.({
            agent: runtimeAgent,
            tool: toolInfo,
            args,
            error: voltAgentError,
            originalError: error,
            context: oc,
            options: executionOptions,
          });
          if (hasOutputOverride(onToolErrorResult)) {
            errorOutputOverride = onToolErrorResult.output;
            hasErrorOutputOverride = true;
          }

          await hooks.onToolEnd?.({
            agent: runtimeAgent,
            tool: toolInfo,
            output: undefined,
            error: voltAgentError,
            context: oc,
            options: executionOptions,
          });

          if (isToolDeniedError(errorValue)) {
            oc.abortController.abort(errorValue);
          }

          if (hasErrorOutputOverride) {
            return await validateOutput(errorOutputOverride);
          }

          throw errorValue;
        };

        let preparationFailed = false;
        let preparationError: unknown;
        // End hooks can replace the last value. Only that explicit extension (or
        // final-output validation) needs one-value lookahead; tracing alone does not.
        const bufferFinalOutput = Boolean(
          metadata?.hooks?.onEnd ||
            hooks.onToolEnd ||
            (metadata?.validateOutput && tool.outputSchema),
        );

        const streamOutputs = async function* (result: AsyncIterable<unknown>) {
          const iterator = result[Symbol.asyncIterator]();
          let done = false;
          let hasOutput = false;
          let lastOutput: unknown;
          try {
            while (true) {
              const next = await oc.traceContext.withSpan(toolSpan, () => iterator.next());
              if (next.done) {
                done = true;
                break;
              }
              if (bufferFinalOutput) {
                if (hasOutput) yield lastOutput;
              } else {
                yield next.value;
              }
              lastOutput = next.value;
              hasOutput = true;
            }

            const finalOutput = await oc.traceContext.withSpan(toolSpan, async () =>
              handleToolSuccess(lastOutput, await validateOutput(lastOutput)),
            );
            if (bufferFinalOutput && (hasOutput || finalOutput !== undefined)) {
              yield finalOutput;
            }
          } catch (error) {
            yield await oc.traceContext.withSpan(toolSpan, () => handleToolError(error));
          } finally {
            try {
              if (!done) {
                await oc.traceContext.withSpan(toolSpan, () => iterator.return?.());
              }
            } finally {
              finalizeToolSpan();
            }
          }
        };

        return {
          async prepare() {
            try {
              await agentWaitForSpeculativeInputGuardrail(oc);
              await oc.traceContext.withSpan(toolSpan, runToolStartHooks);
            } catch (error) {
              // SDK notification callbacks swallow errors. Save this failure so
              // execute can report it without ever invoking the user's tool.
              preparationFailed = true;
              preparationError = error;
            }
          },
          execute(nativeOptions) {
            // The SDK creates its per-tool timeout signal after start callbacks.
            // Preserve all native options for execute, including future fields.
            if (executionOptions.toolContext) {
              executionOptions.toolContext.abortSignal = nativeOptions?.abortSignal;
            }
            try {
              if (preparationFailed) throw preparationError;
              if (!execute) throw new Error(`Tool ${name} does not have "execute" method`);
              const result = oc.traceContext.withSpanSync(toolSpan, () =>
                execute(
                  args,
                  nativeOptions ?? { toolCallId, messages, abortSignal, context: undefined },
                ),
              );
              if (isAsyncIterable(result)) {
                return streamOutputs(result);
              }
              return oc.traceContext.withSpan(toolSpan, async () => {
                try {
                  const output = await result;
                  return await handleToolSuccess(output, await validateOutput(output));
                } catch (error) {
                  return await handleToolError(error);
                } finally {
                  finalizeToolSpan();
                }
              });
            } catch (error) {
              return oc.traceContext.withSpan(toolSpan, async () => {
                try {
                  return await handleToolError(error);
                } finally {
                  finalizeToolSpan();
                }
              });
            }
          },
          dispose(failure) {
            if (failure) spanOutcome = { status: "error", error: failure.error };
            finalizeToolSpan();
          },
        };
      });
    };
  }

  function agentCreateToolExecutionFactory(
    oc: OperationContext,
    hooks: AgentHooks,
  ): (
    tool: BaseTool,
  ) => (args: any, options?: ToolExecutionOptions<any>) => ToolExecutionResult<any> {
    return (tool: BaseTool) => (args: any, options?: ToolExecutionOptions<any>) => {
      // AI SDK passes ToolExecutionOptions with fields: toolCallId, messages, abortSignal
      const toolCallId = options?.toolCallId ?? randomUUID();
      const messages = options?.messages ?? [];
      const abortSignal = options?.abortSignal;

      // Convert ToolExecutionOptions to ToolExecuteOptions by merging with OperationContext
      const executionOptions: ToolExecuteOptions = {
        ...oc,
        toolContext: {
          name: tool.name,
          callId: toolCallId,
          messages: messages,
          abortSignal: abortSignal,
        },
      };
      executionOptions.hooks = hooks;

      // Event tracking now handled by OpenTelemetry spans
      const toolTags = (tool as { tags?: string[] | undefined }).tags;
      const toolSpan = oc.traceContext.createChildSpan(`tool.execution:${tool.name}`, "tool", {
        label: tool.name,
        attributes: {
          "tool.name": tool.name,
          "tool.call.id": toolCallId,
          "tool.description": tool.description,
          ...(toolTags && toolTags.length > 0 ? { "tool.tags": safeStringify(toolTags) } : {}),
          "tool.parameters": safeStringify(tool.parameters),
          input: args ? safeStringify(args) : undefined,
        },
        kind: SpanKind.CLIENT,
      });

      // Push execution metadata into systemContext for tools to consume
      oc.systemContext.set("agentId", stateId);
      oc.systemContext.set("historyEntryId", oc.operationId);

      executionOptions.parentToolSpan = toolSpan;

      const hasOutputOverride = (
        value: unknown,
      ): value is {
        output?: unknown;
      } => {
        if (!value || typeof value !== "object") {
          return false;
        }
        return Object.prototype.hasOwnProperty.call(value, "output");
      };

      const runToolStartHooks = async () => {
        await tool.hooks?.onStart?.({
          tool,
          args,
          options: executionOptions,
        });
        await hooks.onToolStart?.({
          agent: runtimeAgent,
          tool,
          context: oc,
          args,
          options: executionOptions,
        });
      };

      let spanOutcome:
        | { status: "completed"; output?: unknown }
        | { status: "error"; error?: Error | any }
        | null = null;

      const finalizeToolSpan = () => {
        const shouldEnd =
          typeof toolSpan.isRecording === "function" ? toolSpan.isRecording() : true;
        if (!shouldEnd) {
          return;
        }
        const status = spanOutcome?.status ?? "completed";
        oc.traceContext.endChildSpan(toolSpan, status, {
          output: spanOutcome?.status === "completed" ? spanOutcome.output : undefined,
          error: spanOutcome?.status === "error" ? spanOutcome.error : undefined,
        });
      };

      const resolveToolEndOutput = async (currentOutput: any) => {
        let output = currentOutput;
        let overrideProvided = false;

        const toolHookResult = await tool.hooks?.onEnd?.({
          tool,
          args,
          output,
          error: undefined,
          options: executionOptions,
        });
        if (hasOutputOverride(toolHookResult)) {
          output = toolHookResult.output;
          overrideProvided = true;
        }

        const agentHookResult = await hooks.onToolEnd?.({
          agent: runtimeAgent,
          tool,
          output,
          error: undefined,
          context: oc,
          options: executionOptions,
        });
        if (hasOutputOverride(agentHookResult)) {
          output = agentHookResult.output;
          overrideProvided = true;
        }

        if (overrideProvided) {
          output = await agentValidateToolOutput(output, tool);
        }

        return output;
      };

      const handleToolSuccess = async (_result: any, validatedResult: any) => {
        const finalOutput = await resolveToolEndOutput(validatedResult);
        spanOutcome = { status: "completed", output: finalOutput };

        return finalOutput;
      };

      const handleToolError = async (errorValue: unknown) => {
        const error = errorValue instanceof Error ? errorValue : new Error(String(errorValue));
        const voltAgentError = createVoltAgentError(error, {
          stage: "tool_execution",
          toolError: {
            toolCallId,
            toolName: tool.name,
            toolExecutionError: error,
            toolArguments: args,
          },
        });
        let errorOutputOverride: unknown;
        let hasErrorOutputOverride = false;

        spanOutcome = { status: "error", error: voltAgentError };

        await tool.hooks?.onEnd?.({
          tool,
          args,
          output: undefined,
          error: voltAgentError,
          options: executionOptions,
        });

        await tool.hooks?.onEnd?.({
          tool,
          args,
          output: undefined,
          error: voltAgentError,
          options: executionOptions,
        });

        const onToolErrorResult = await hooks.onToolError?.({
          agent: runtimeAgent,
          tool,
          args,
          error: voltAgentError,
          originalError: error,
          context: oc,
          options: executionOptions,
        });
        if (hasOutputOverride(onToolErrorResult)) {
          errorOutputOverride = onToolErrorResult.output;
          hasErrorOutputOverride = true;
        }

        await hooks.onToolEnd?.({
          agent: runtimeAgent,
          tool,
          output: undefined,
          error: voltAgentError,
          context: oc,
          options: executionOptions,
        });

        if (isToolDeniedError(errorValue)) {
          oc.abortController.abort(errorValue);
        }

        if (hasErrorOutputOverride) {
          return errorOutputOverride;
        }

        return buildToolErrorResult(error, toolCallId, tool.name);
      };

      const execute = tool.execute;
      if (execute && isAsyncGeneratorFunction(execute)) {
        return async function* (this: Agent): AsyncGenerator<any, void, void> {
          try {
            await agentWaitForSpeculativeInputGuardrail(oc);
            await oc.traceContext.withSpan(toolSpan, async () => {
              await runToolStartHooks();
            });

            const result = execute(args, executionOptions);

            if (!isAsyncIterable(result)) {
              const resolved = await result;
              const validatedResult = await agentValidateToolOutput(resolved, tool);
              const finalOutput = await oc.traceContext.withSpan(toolSpan, async () => {
                return await handleToolSuccess(resolved, validatedResult);
              });
              yield finalOutput;
              return;
            }

            const iterator = result[Symbol.asyncIterator]();
            let pendingOutput: any = undefined;
            let validatedResult: any = undefined;
            let hasOutput = false;

            while (true) {
              const next = await oc.traceContext.withSpan(toolSpan, () => iterator.next());
              if (next.done) {
                break;
              }

              if (hasOutput) {
                yield pendingOutput;
              }

              pendingOutput = next.value;
              hasOutput = true;
              validatedResult = await agentValidateToolOutput(pendingOutput, tool);
            }

            if (!hasOutput) {
              validatedResult = await agentValidateToolOutput(pendingOutput, tool);
            }

            const finalOutput = await oc.traceContext.withSpan(toolSpan, async () => {
              return await handleToolSuccess(pendingOutput, validatedResult);
            });

            if (hasOutput || finalOutput !== undefined) {
              yield finalOutput;
            }
          } catch (e) {
            const errorResult = await oc.traceContext.withSpan(toolSpan, async () => {
              return await handleToolError(e);
            });
            yield errorResult;
          } finally {
            finalizeToolSpan();
          }
        }.call(runtimeAgent);
      }

      return oc.traceContext.withSpan(toolSpan, async () => {
        try {
          await agentWaitForSpeculativeInputGuardrail(oc);
          // Call tool start hook - can throw ToolDeniedError
          await runToolStartHooks();

          // Execute tool with merged options
          if (!tool.execute) {
            throw new Error(`Tool ${tool.name} does not have "execute" method`);
          }
          let result = await tool.execute(args, executionOptions);

          if (isAsyncIterable(result)) {
            let lastOutput: any = undefined;
            for await (const output of result) {
              lastOutput = output;
            }
            result = lastOutput;
          }

          const validatedResult = await agentValidateToolOutput(result, tool);

          const finalOutput = await handleToolSuccess(result, validatedResult);

          return finalOutput;
        } catch (e) {
          return await handleToolError(e);
        } finally {
          finalizeToolSpan();
        }
      });
    };
  }

  function agentGetToolRoutingSupportToolNames(): Set<string> {
    return new Set([TOOL_ROUTING_SEARCH_TOOL_NAME, TOOL_ROUTING_CALL_TOOL_NAME]);
  }

  function agentIsToolRoutingSupportTool(tool: ManagedToolInfo): boolean {
    if (!tool || typeof tool !== "object") {
      return false;
    }
    return Object.prototype.hasOwnProperty.call(tool, TOOL_ROUTING_INTERNAL_TOOL_SYMBOL);
  }

  function agentIsToolExecutableForRouting(tool: ManagedToolInfo): boolean {
    if (isProviderTool(tool)) {
      const callableFlag = (tool as { callable?: boolean }).callable;
      if (callableFlag === false) {
        return false;
      }
      const callFn = (tool as { call?: unknown }).call;
      if (callFn !== undefined) {
        return typeof callFn === "function";
      }
      return true;
    }

    if ((tool as Tool<any, any>).isClientSide?.()) {
      return false;
    }

    return typeof (tool as Tool<any, any>).execute === "function";
  }

  function agentGetToolRoutingFromContext(
    options?: ToolExecuteOptions,
  ): ToolRoutingConfig | undefined {
    const contextValue =
      options?.systemContext?.get(TOOL_ROUTING_CONTEXT_KEY) ??
      options?.context?.get(TOOL_ROUTING_CONTEXT_KEY);
    if (contextValue === false) {
      return undefined;
    }
    if (contextValue && typeof contextValue === "object") {
      return contextValue as ToolRoutingConfig;
    }
    if (stateToolRouting && typeof stateToolRouting === "object") {
      return stateToolRouting;
    }
    return undefined;
  }

  function agentGetToolSearchStrategy(
    toolRouting?: ToolRoutingConfig,
  ): ToolSearchStrategy | undefined {
    if (!toolRouting?.embedding) {
      return undefined;
    }
    if (toolRouting === stateToolRouting && stateToolRoutingSearchStrategy) {
      return stateToolRoutingSearchStrategy;
    }
    return createEmbeddingToolSearchStrategy(toolRouting.embedding);
  }

  function agentBuildToolSearchCandidates(): ToolSearchCandidate[] {
    return stateToolPoolManager
      .getAllTools()
      .filter((tool) => !agentIsToolRoutingSupportTool(tool))
      .filter((tool) => agentIsToolExecutableForRouting(tool))
      .map((tool) => {
        const tags = "tags" in tool ? (tool as { tags?: string[] }).tags : undefined;
        const parameters = isProviderTool(tool) ? tool.args : (tool as Tool<any, any>).parameters;
        const outputSchema = !isProviderTool(tool)
          ? (tool as Tool<any, any>).outputSchema
          : undefined;
        return {
          name: tool.name,
          description: tool.description || "",
          tags,
          parameters,
          outputSchema,
          tool,
        };
      });
  }

  function agentRankToolSearchCandidates(
    query: string,
    candidates: ToolSearchCandidate[],
    topK: number,
  ): ToolSearchSelection[] {
    if (candidates.length === 0) {
      return [];
    }

    const normalized = query.trim().toLowerCase();
    const tokens = normalized.length > 0 ? normalized.split(/\s+/).filter(Boolean) : [];

    const scored = candidates.map((candidate) => {
      const name = candidate.name.toLowerCase();
      const description = (candidate.description ?? "").toLowerCase();
      const tags = (candidate.tags ?? []).map((tag) => tag.toLowerCase());
      let score = 0;

      if (normalized.length > 0 && name.includes(normalized)) {
        score += 4;
      }
      if (normalized.length > 0 && description.includes(normalized)) {
        score += 2;
      }

      for (const token of tokens) {
        if (name.includes(token)) {
          score += 2;
        }
        if (description.includes(token)) {
          score += 1;
        }
        if (tags.includes(token)) {
          score += 1;
        }
      }

      return { name: candidate.name, score };
    });

    scored.sort((a, b) => {
      const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      return a.name.localeCompare(b.name);
    });

    const hasMatches = scored.some((entry) => (entry.score ?? 0) > 0);
    const filtered = hasMatches ? scored.filter((entry) => (entry.score ?? 0) > 0) : scored;
    return filtered.slice(0, Math.max(0, topK));
  }

  async function agentSelectToolSearchCandidates(params: {
    query: string;
    topK: number;
    candidates: ToolSearchCandidate[];
    oc: OperationContext;
    parentSpan?: Span;
    toolRouting?: ToolRoutingConfig;
  }): Promise<ToolSearchSelection[]> {
    const { query, topK, candidates, oc, parentSpan, toolRouting } = params;
    const strategy = agentGetToolSearchStrategy(toolRouting);

    if (!strategy) {
      return agentRankToolSearchCandidates(query, candidates, topK);
    }

    return await strategy.select({
      query,
      tools: candidates,
      topK,
      context: {
        agentId: stateId,
        agentName: stateName,
        operationContext: oc,
        searchToolName: TOOL_ROUTING_SEARCH_TOOL_NAME,
        parentSpan,
      },
    });
  }

  function agentToToolSearchResultItem(
    candidate: ToolSearchCandidate,
    selection: ToolSearchSelection,
  ): ToolSearchResultItem {
    const parametersSchema = isProviderTool(candidate.tool)
      ? (candidate.tool.args ?? null)
      : zodSchemaToJsonUI((candidate.tool as Tool<any, any>).parameters);
    const outputSchema =
      !isProviderTool(candidate.tool) && (candidate.tool as Tool<any, any>).outputSchema
        ? zodSchemaToJsonUI((candidate.tool as Tool<any, any>).outputSchema)
        : null;

    return {
      name: candidate.name,
      description: candidate.description || null,
      tags: candidate.tags ?? null,
      parametersSchema,
      outputSchema,
      score: selection.score,
      reason: selection.reason,
    };
  }

  function agentRecordSearchedTools(
    options: ToolExecuteOptions | undefined,
    toolNames: string[],
  ): void {
    const context = options?.systemContext ?? options?.context;
    if (!context || toolNames.length === 0) {
      return;
    }

    const existing = context.get(TOOL_ROUTING_SEARCHED_TOOLS_CONTEXT_KEY);
    const searched =
      existing instanceof Set
        ? new Set(existing)
        : Array.isArray(existing)
          ? new Set(existing.filter((value) => typeof value === "string"))
          : new Set<string>();

    for (const name of toolNames) {
      searched.add(name);
    }

    context.set(TOOL_ROUTING_SEARCHED_TOOLS_CONTEXT_KEY, searched);
  }

  function agentGetSearchedTools(options: ToolExecuteOptions | undefined): Set<string> {
    const context = options?.systemContext ?? options?.context;
    if (!context) {
      return new Set();
    }

    const existing = context.get(TOOL_ROUTING_SEARCHED_TOOLS_CONTEXT_KEY);
    if (existing instanceof Set) {
      return existing;
    }
    if (Array.isArray(existing)) {
      return new Set(existing.filter((value) => typeof value === "string"));
    }
    return new Set();
  }

  function agentCreateToolRoutingSearchTool(): Tool<any, any> {
    const tool = createTool({
      name: TOOL_ROUTING_SEARCH_TOOL_NAME,
      description:
        "Search available tools and inspect their schemas. Always call this before callTool when tool routing is enabled.",
      parameters: searchToolsParameters,
      outputSchema: searchToolsOutputSchema,
      execute: async ({ query, topK }, options) => {
        if (!options) {
          throw new Error("searchTools requires tool execution options.");
        }

        const oc = options as OperationContext;
        const toolRouting = agentGetToolRoutingFromContext(options);
        const embeddingTopK =
          toolRouting?.embedding &&
          typeof toolRouting.embedding === "object" &&
          toolRouting.embedding !== null &&
          "topK" in toolRouting.embedding
            ? (toolRouting.embedding as { topK?: number }).topK
            : undefined;
        const effectiveTopK = Math.max(
          1,
          topK ?? toolRouting?.topK ?? embeddingTopK ?? DEFAULT_TOOL_SEARCH_TOP_K,
        );
        const candidates = agentBuildToolSearchCandidates();
        // Check both options and systemContext for backward compatibility, prefer options
        const parentToolSpan =
          ((options as any).parentToolSpan as Span | undefined) ||
          (oc.systemContext.get("parentToolSpan") as Span | undefined);
        const selectionSpanAttributes = {
          "tool.name": TOOL_ROUTING_SEARCH_TOOL_NAME,
          "tool.search.name": TOOL_ROUTING_SEARCH_TOOL_NAME,
          "tool.search.query": query,
          "tool.search.candidates": candidates.length,
          "tool.search.top_k": effectiveTopK,
          input: query,
        };
        const selectionSpan = parentToolSpan
          ? oc.traceContext.createChildSpanWithParent(
              parentToolSpan,
              `tool.search.selection:${TOOL_ROUTING_SEARCH_TOOL_NAME}`,
              "tool",
              {
                label: `Tool Search Selection: ${TOOL_ROUTING_SEARCH_TOOL_NAME}`,
                attributes: selectionSpanAttributes,
              },
            )
          : oc.traceContext.createChildSpan(
              `tool.search.selection:${TOOL_ROUTING_SEARCH_TOOL_NAME}`,
              "tool",
              {
                label: `Tool Search Selection: ${TOOL_ROUTING_SEARCH_TOOL_NAME}`,
                attributes: selectionSpanAttributes,
              },
            );

        let selections: ToolSearchSelection[] = [];
        try {
          selections = await oc.traceContext.withSpan(selectionSpan, () =>
            agentSelectToolSearchCandidates({
              query,
              topK: effectiveTopK,
              candidates,
              oc,
              parentSpan: selectionSpan,
              toolRouting,
            }),
          );
          if (selections.length > 1) {
            const seen = new Set<string>();
            selections = selections.filter((selection) => {
              if (seen.has(selection.name)) {
                return false;
              }
              seen.add(selection.name);
              return true;
            });
          }
          oc.traceContext.endChildSpan(selectionSpan, "completed", {
            output: selections,
            attributes: {
              "tool.search.selection.count": selections.length,
              "tool.search.selection.names": safeStringify(
                selections.map((selection) => selection.name),
              ),
            },
          });
          oc.logger.debug("Tool search selections computed", {
            tool: TOOL_ROUTING_SEARCH_TOOL_NAME,
            query,
            selections: safeStringify(selections),
          });
        } catch (error) {
          oc.traceContext.endChildSpan(selectionSpan, "error", {
            output: { error: error instanceof Error ? error.message : String(error) },
          });
          throw error;
        }

        const candidateByName = new Map(candidates.map((candidate) => [candidate.name, candidate]));
        const tools = selections
          .map((selection) => {
            const candidate = candidateByName.get(selection.name);
            return candidate ? agentToToolSearchResultItem(candidate, selection) : null;
          })
          .filter((item): item is ToolSearchResultItem => Boolean(item));

        agentRecordSearchedTools(
          options,
          tools.map((toolItem) => toolItem.name),
        );

        return {
          query,
          selections,
          tools,
        } satisfies ToolSearchResult;
      },
    });

    (tool as any)[TOOL_ROUTING_INTERNAL_TOOL_SYMBOL] = "search";
    return tool;
  }

  function agentCreateToolRoutingCallTool(): Tool<any, any> {
    const tool = createTool({
      name: TOOL_ROUTING_CALL_TOOL_NAME,
      description:
        "Call a tool by name with validated arguments. Always call searchTools first and follow the returned schema.",
      parameters: callToolParameters,
      execute: async ({ name, args }, options) => {
        if (!options) {
          throw new Error("callTool requires tool execution options.");
        }

        if (name === TOOL_ROUTING_CALL_TOOL_NAME || name === TOOL_ROUTING_SEARCH_TOOL_NAME) {
          throw new Error(
            `Tool "${name}" cannot be called via callTool to avoid recursion. Use it directly instead.`,
          );
        }

        const oc = options as OperationContext;
        const toolRouting = agentGetToolRoutingFromContext(options);
        const enforceSearch = toolRouting?.enforceSearchBeforeCall ?? true;
        const rawArgs = args ?? {};

        const target = stateToolPoolManager.getToolByName(name);
        if (!target || agentIsToolRoutingSupportTool(target)) {
          throw new Error(`Tool not found in pool: ${name}`);
        }

        if (enforceSearch) {
          const searchedTools = agentGetSearchedTools(options);
          if (!searchedTools.has(name)) {
            throw new Error(
              `Tool "${name}" must be searched via ${TOOL_ROUTING_SEARCH_TOOL_NAME} before calling.`,
            );
          }
        }

        const hooks =
          ((options as { hooks?: AgentHooks }).hooks as AgentHooks | undefined) ??
          agentGetMergedHooks();
        const toolCallId = randomUUID();
        const executionOptions: ToolExecuteOptions = {
          ...oc,
          toolContext: {
            name: target.name,
            callId: toolCallId,
            messages: options.toolContext?.messages ?? [],
            abortSignal: oc.abortController.signal,
          },
        };
        executionOptions.hooks = hooks;

        if (isProviderTool(target)) {
          return await agentExecuteProviderToolViaCallTool({
            tool: target,
            args: rawArgs,
            oc,
            hooks,
            executionOptions,
          });
        }

        if (!target.execute || target.isClientSide?.()) {
          throw new Error(
            `Tool "${target.name}" cannot be executed on the server or has no execute handler.`,
          );
        }

        let parsedArgs: Record<string, unknown> = rawArgs;
        const schema = (target as Tool<any, any>).parameters;
        if (schema && typeof schema.safeParse === "function") {
          const parsed = schema.safeParse(rawArgs);
          if (!parsed.success) {
            const issues = getValidationIssues(parsed.error);
            const coercedArgs = coerceStringifiedJsonToolArgs(rawArgs, issues);

            if (coercedArgs) {
              const reparsed = schema.safeParse(coercedArgs);
              if (reparsed.success) {
                parsedArgs = reparsed.data as Record<string, unknown>;
              } else {
                const error = new Error(
                  `Invalid arguments for tool "${name}": ${reparsed.error.message}`,
                );
                Object.assign(error, { validationErrors: getValidationIssues(reparsed.error) });
                throw error;
              }
            } else {
              const error = new Error(
                `Invalid arguments for tool "${name}": ${parsed.error.message}`,
              );
              Object.assign(error, { validationErrors: issues });
              throw error;
            }
          } else {
            parsedArgs = parsed.data as Record<string, unknown>;
          }
        }

        if (isNamedAiSdkTool(target)) {
          await agentEnsureToolApproval(target as any, parsedArgs, executionOptions, toolCallId);
          const toolContext = await agentResolveAISDKToolContext(target, executionOptions);

          const execute = agentCreateAiSdkToolExecutionFactory(oc, hooks)(
            target.name,
            getRawAiSdkTool(target),
            getVoltAgentToolMetadata(target),
          );

          return await execute(parsedArgs, {
            toolCallId,
            messages: executionOptions.toolContext?.messages ?? [],
            abortSignal: executionOptions.toolContext?.abortSignal,
            context: toolContext as any,
          });
        }

        await agentEnsureToolApproval(
          target as Tool<any, any>,
          parsedArgs,
          executionOptions,
          toolCallId,
        );

        const execute = agentCreateToolExecutionFactory(oc, hooks)(target as Tool<any, any>);
        return await execute(parsedArgs, {
          toolCallId,
          messages: executionOptions.toolContext?.messages ?? [],
          abortSignal: executionOptions.toolContext?.abortSignal,
          context: undefined,
        });
      },
    });

    (tool as any)[TOOL_ROUTING_INTERNAL_TOOL_SYMBOL] = "call";
    return tool;
  }

  async function agentExecuteProviderToolViaCallTool(params: {
    tool: ProviderTool;
    args: Record<string, unknown>;
    oc: OperationContext;
    hooks: AgentHooks;
    executionOptions: ToolExecuteOptions;
  }): Promise<unknown> {
    const { tool, args, oc, hooks, executionOptions } = params;
    oc.logger.info("Tool routing executing provider tool via callTool", {
      toolName: tool.name,
    });

    await agentEnsureToolApproval(
      tool,
      args,
      executionOptions,
      executionOptions.toolContext?.callId ?? randomUUID(),
    );

    const tools: Record<string, any> = {
      [tool.name]: tool,
    };

    const argsInstruction = `Use these tool arguments exactly: ${safeStringify(args)}`;
    const result = await agentRunInternalGenerateText({
      oc,
      messages: [
        {
          role: "system",
          content: [
            "Call the required tool with the provided arguments.",
            "Return only the tool call.",
          ].join("\n"),
        },
        { role: "user", content: argsInstruction },
      ],
      tools,
      toolChoice: { type: "tool", toolName: tool.name },
      temperature: stateTemperature ?? 0,
    });

    const { toolCalls, toolResults } = agentCollectToolDataFromResult(result);
    const toolCall = toolCalls.find((call) => call.toolName === tool.name);
    const toolResult = toolResults.find(
      (res) => res.toolName === tool.name && (!toolCall || res.toolCallId === toolCall.toolCallId),
    );

    if (toolCall?.toolCallId && executionOptions.toolContext) {
      executionOptions.toolContext.callId = toolCall.toolCallId;
    }

    if (toolCall) {
      const callInput = toolCall.input ?? {};
      if (!isDeepStrictEqual(args, callInput)) {
        throw new Error(
          `Provider tool "${tool.name}" received arguments that do not match callTool input.`,
        );
      }
      await hooks.onToolStart?.({
        agent: runtimeAgent,
        tool: tool as any,
        args: callInput,
        context: oc,
        options: executionOptions,
      });
    }

    if (!toolResult) {
      throw new Error("Provider tool did not return a result.");
    }

    const hasOutputOverride = (
      value: unknown,
    ): value is {
      output?: unknown;
    } => {
      if (!value || typeof value !== "object") {
        return false;
      }
      return Object.prototype.hasOwnProperty.call(value, "output");
    };

    const toolError =
      toolResult.output && typeof toolResult.output === "object" && "error" in toolResult.output
        ? String((toolResult.output as { error?: unknown }).error ?? "Tool error")
        : undefined;
    const hookError = toolError
      ? createVoltAgentError(toolError, { stage: "tool_execution" })
      : undefined;
    let errorOutputOverride: unknown;
    let hasErrorOutputOverride = false;

    if (toolError && hookError) {
      const onToolErrorResult = await hooks.onToolError?.({
        agent: runtimeAgent,
        tool: tool as any,
        args,
        error: hookError,
        originalError: new Error(toolError),
        context: oc,
        options: executionOptions,
      });
      if (hasOutputOverride(onToolErrorResult)) {
        errorOutputOverride = onToolErrorResult.output;
        hasErrorOutputOverride = true;
      }
    }

    await hooks.onToolEnd?.({
      agent: runtimeAgent,
      tool: tool as any,
      output: toolError ? undefined : toolResult.output,
      error: hookError,
      context: oc,
      options: executionOptions,
    });

    if (toolError) {
      if (hasErrorOutputOverride) {
        return errorOutputOverride;
      }
      throw new Error(toolError);
    }

    return toolResult.output;
  }

  function agentGetToolApprovalFromContext(
    options?: ToolExecuteOptions,
  ): ToolApprovalConfiguration<ToolSet, any> | undefined {
    const contextValue =
      options?.systemContext?.get(TOOL_APPROVAL_CONTEXT_KEY) ??
      options?.context?.get(TOOL_APPROVAL_CONTEXT_KEY);
    return contextValue as ToolApprovalConfiguration<ToolSet, any> | undefined;
  }

  function agentGetAISDKToolsFromContext(options?: ToolExecuteOptions): ToolSet | undefined {
    const contextValue =
      options?.systemContext?.get(AI_SDK_TOOLS_KEY) ?? options?.context?.get(AI_SDK_TOOLS_KEY);
    return contextValue as ToolSet | undefined;
  }

  function agentGetAISDKToolsContextFromContext(
    options?: ToolExecuteOptions,
  ): Record<string, unknown> {
    const contextValue =
      options?.systemContext?.get(AI_SDK_TOOLS_CONTEXT_KEY) ??
      options?.context?.get(AI_SDK_TOOLS_CONTEXT_KEY);
    return (contextValue ?? {}) as Record<string, unknown>;
  }

  function agentGetAISDKRuntimeContextFromContext(options?: ToolExecuteOptions): unknown {
    return (
      options?.systemContext?.get(AI_SDK_RUNTIME_CONTEXT_KEY) ??
      options?.context?.get(AI_SDK_RUNTIME_CONTEXT_KEY)
    );
  }

  async function agentResolveAISDKToolContext(
    tool: Tool<any, any> | ProviderTool | NamedAiSdkTool,
    options?: ToolExecuteOptions,
  ): Promise<unknown> {
    const toolsContext = agentGetAISDKToolsContextFromContext(options);
    const context = toolsContext[tool.name];
    const contextSchema = (tool as { contextSchema?: unknown }).contextSchema;

    if (contextSchema == null) {
      return context;
    }

    return await validateTypes({
      value: context,
      schema: contextSchema as any,
      context: {
        field: "tool context",
        entityName: tool.name,
      },
    });
  }

  function agentNormalizeToolApprovalStatus(status: ToolApprovalStatus): {
    type: "not-applicable" | "approved" | "denied" | "user-approval";
    reason?: string;
  } {
    if (!status) {
      return { type: "not-applicable" };
    }

    if (typeof status === "string") {
      return { type: status };
    }

    return {
      type: status.type,
      reason: "reason" in status ? status.reason : undefined,
    };
  }

  async function agentResolveToolApprovalStatus(params: {
    toolApproval: ToolApprovalConfiguration<ToolSet, any>;
    tool: Tool<any, any> | ProviderTool | NamedAiSdkTool;
    args: Record<string, unknown>;
    options: ToolExecuteOptions;
    toolCallId: string;
  }): Promise<ToolApprovalStatus> {
    const { toolApproval, tool, args, options, toolCallId } = params;
    const messages = (options.toolContext?.messages ?? []) as ModelMessage[];
    const tools = agentGetAISDKToolsFromContext(options);
    const toolsContext = agentGetAISDKToolsContextFromContext(options);
    const runtimeContext = agentGetAISDKRuntimeContextFromContext(options);

    if (typeof toolApproval === "function") {
      return await (toolApproval as any)({
        toolCall: {
          type: "tool-call",
          toolCallId,
          toolName: tool.name,
          input: args,
          dynamic: true,
        },
        tools,
        toolsContext,
        runtimeContext,
        messages,
      });
    }

    const approvalForTool = (toolApproval as Record<string, unknown>)[tool.name];
    if (typeof approvalForTool === "function") {
      return await (approvalForTool as any)(args, {
        toolCallId,
        messages,
        toolContext: await agentResolveAISDKToolContext(tool, options),
        runtimeContext,
      });
    }

    return approvalForTool as ToolApprovalStatus;
  }

  function agentThrowToolApprovalError(
    tool: Tool<any, any> | ProviderTool | NamedAiSdkTool,
    status: ReturnType<typeof agentNormalizeToolApprovalStatus>,
  ): never {
    if (status.type === "denied") {
      throw new ToolDeniedError({
        toolName: tool.name,
        message: status.reason ?? `Tool ${tool.name} was denied by tool approval policy.`,
        code: "TOOL_FORBIDDEN",
        httpStatus: 403,
      });
    }

    throw new ToolDeniedError({
      toolName: tool.name,
      message: `Tool ${tool.name} requires user approval.`,
      code: "TOOL_APPROVAL_REQUIRED",
      httpStatus: 403,
    });
  }

  async function agentEnsureToolApproval(
    tool: Tool<any, any> | ProviderTool | NamedAiSdkTool,
    args: Record<string, unknown>,
    options: ToolExecuteOptions,
    toolCallId: string,
  ): Promise<void> {
    const toolApproval = agentGetToolApprovalFromContext(options);
    if (toolApproval !== undefined) {
      const approvalStatus = await agentResolveToolApprovalStatus({
        toolApproval,
        tool,
        args,
        options,
        toolCallId,
      });
      const normalizedStatus = agentNormalizeToolApprovalStatus(approvalStatus);
      if (normalizedStatus.type === "approved" || normalizedStatus.type === "not-applicable") {
        return;
      }
      agentThrowToolApprovalError(tool, normalizedStatus);
    }

    const needsApproval = (tool as { needsApproval?: Tool<any, any>["needsApproval"] })
      .needsApproval;
    if (!needsApproval) {
      return;
    }

    const requiresApproval =
      typeof needsApproval === "function"
        ? await needsApproval(args as any, {
            toolCallId,
            messages: (options.toolContext?.messages ?? []) as ModelMessage[],
            context: await agentResolveAISDKToolContext(tool, options),
          })
        : needsApproval;

    if (requiresApproval) {
      throw new ToolDeniedError({
        toolName: tool.name,
        message: `Tool ${tool.name} requires approval.`,
        code: "TOOL_FORBIDDEN",
        httpStatus: 403,
      });
    }
  }

  async function agentRunInternalGenerateText(params: {
    oc: OperationContext;
    modelValue?: AgentModelValue;
    messages: ModelMessage[];
    tools?: ToolSet;
    output?: OutputSpec;
    toolChoice?: ToolChoice<Record<string, unknown>>;
    temperature?: number;
  }): Promise<GenerateTextResult<ToolSet, any, OutputSpec>> {
    const { oc, modelValue, messages, tools, output, toolChoice, temperature } = params;
    const model = await agentResolveModel(modelValue ?? stateModel, oc);
    const modelName = runtimeAgent.getModelName(model);

    const llmSpan = agentCreateLLMSpan(oc, {
      operation: "generateText",
      modelName,
      isStreaming: false,
      messages: messages.map((msg) => ({ role: msg.role, content: msg.content })),
      tools,
      callOptions: {
        temperature,
      },
    });
    const finalizeLLMSpan = agentCreateLLMSpanFinalizer(llmSpan);
    const promptOptions = splitInstructionsFromMessages(messages);

    try {
      const response = await oc.traceContext.withSpan(llmSpan, () =>
        generateText({
          model,
          ...promptOptions,
          tools,
          output,
          toolChoice,
          temperature,
          maxRetries: 0,
          stopWhen: isStepCount(1),
          abortSignal: oc.abortController.signal,
        }),
      );

      const resolvedUsage = response.usage ? await Promise.resolve(response.usage) : undefined;
      finalizeLLMSpan(SpanStatusCode.OK, {
        usage: resolvedUsage,
        finishReason: response.finishReason,
        providerMetadata: (response as { providerMetadata?: unknown }).providerMetadata,
      });

      return response;
    } catch (error) {
      finalizeLLMSpan(SpanStatusCode.ERROR, { message: (error as Error).message });
      throw error;
    }
  }

  function agentGetSpeculativeInputGuardrail(
    oc: OperationContext,
  ): SpeculativeInputGuardrailRun | null {
    return (
      (oc.systemContext.get(SPECULATIVE_INPUT_GUARDRAIL_CONTEXT_KEY) as
        | SpeculativeInputGuardrailRun
        | undefined) ?? null
    );
  }

  async function agentWaitForSpeculativeInputGuardrail(oc: OperationContext): Promise<void> {
    const guardrail = agentGetSpeculativeInputGuardrail(oc);
    if (!guardrail) {
      return;
    }

    const decision = await guardrail.wait();
    if (decision.status === "blocked") {
      throw decision.error;
    }
  }

  /**
   * Create step handler for memory and hooks
   */
  function agentCreateStepHandler<
    TOOLS extends ToolSet = ToolSet,
    RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  >(
    oc: OperationContext,
    options?: AnyBaseGenerationOptions,
    userOnStepEnd?: GenerationStepEndCallback<TOOLS, RUNTIME_CONTEXT>,
  ) {
    const buffer = agentGetConversationBuffer(oc);
    const shouldPersistMemory = agentShouldPersistMemoryForContext(oc);
    const persistQueue = shouldPersistMemory ? agentGetMemoryPersistQueue(oc) : null;
    const conversationPersistence = agentGetConversationPersistenceOptionsForContext(oc);

    return async (event: StepResult<TOOLS, RUNTIME_CONTEXT>) => {
      await invokeAISDKCallbackSafely(userOnStepEnd, event, oc.logger ?? stateLogger, "onStepEnd");

      const broadEvent = event as unknown as StepResult<ToolSet>;
      const speculativeInputGuardrail = agentGetSpeculativeInputGuardrail(oc);
      const { shouldFlushForToolCompletion, bailedResult } = agentProcessStepContent(
        oc,
        broadEvent,
      );

      const responseMessages = agentNormalizeStepResponseMessages(
        oc,
        filterResponseMessages(broadEvent.response?.messages),
      );
      const hasResponseMessages = Boolean(responseMessages && responseMessages.length > 0);
      if (hasResponseMessages && responseMessages) {
        buffer.addModelMessages(responseMessages, "response");
      }

      const shouldFlushStepPersistence =
        conversationPersistence.mode === "step" &&
        conversationPersistence.flushOnToolResult &&
        (shouldFlushForToolCompletion || Boolean(bailedResult));

      if (
        conversationPersistence.mode === "step" &&
        (!speculativeInputGuardrail || speculativeInputGuardrail.hasPassed())
      ) {
        await agentRecordStepResults(undefined, oc, {
          awaitPersistence: shouldFlushStepPersistence,
        });
      }

      if (
        shouldPersistMemory &&
        persistQueue &&
        (!speculativeInputGuardrail || speculativeInputGuardrail.hasPassed()) &&
        conversationPersistence.mode === "step" &&
        (hasResponseMessages || shouldFlushStepPersistence)
      ) {
        try {
          if (shouldFlushStepPersistence) {
            await persistQueue.flush(buffer, oc);
          } else {
            persistQueue.scheduleSave(buffer, oc);
          }
        } catch (error) {
          oc.logger.debug("Failed to persist step checkpoint", {
            error,
            conversationId: oc.conversationId,
            userId: oc.userId,
          });
        }
      }

      if (bailedResult) {
        oc.abortController.abort(createBailError(bailedResult.agentName, bailedResult.response));
        return;
      }

      // Call hooks
      const hooks = agentGetMergedHooks(options);
      await hooks.onStepEnd?.({ agent: runtimeAgent, step: event, context: oc });
    };
  }

  function agentProcessStepContent(
    oc: OperationContext,
    event: StepResult<ToolSet>,
  ): {
    shouldFlushForToolCompletion: boolean;
    bailedResult?: { agentName: string; response: string };
  } {
    if (!event.content || !Array.isArray(event.content)) {
      return { shouldFlushForToolCompletion: false };
    }

    if (!oc.systemContext.has("conversationSteps")) {
      oc.systemContext.set("conversationSteps", []);
    }

    const conversationSteps = oc.systemContext.get("conversationSteps") as StepResult<ToolSet>[];
    conversationSteps.push(event);

    let shouldFlushForToolCompletion = false;
    let bailedResult: { agentName: string; response: string } | undefined;

    for (const part of event.content) {
      if (part.type === "text" || part.type === "reasoning") {
        oc.logger.debug("Step: Text generated", {
          event: LogEvents.AGENT_STEP_TEXT,
          textPreview: part.text.substring(0, 100),
          length: part.text.length,
        });
        continue;
      }

      if (part.type === "tool-call") {
        oc.logger.debug(`Step: Calling tool '${part.toolName}'`, {
          event: LogEvents.AGENT_STEP_TOOL_CALL,
          toolName: part.toolName,
          toolCallId: part.toolCallId,
          arguments: part.input,
        });

        oc.logger.debug(
          buildAgentLogMessage(stateName, ActionType.TOOL_CALL, `Executing ${part.toolName}`),
          {
            event: LogEvents.TOOL_EXECUTION_STARTED,
            toolName: part.toolName,
            toolCallId: part.toolCallId,
            args: part.input,
          },
        );
        continue;
      }

      if (part.type === "tool-result") {
        shouldFlushForToolCompletion = true;
        oc.logger.debug(`Step: Tool '${part.toolName}' completed`, {
          event: LogEvents.AGENT_STEP_TOOL_RESULT,
          toolName: part.toolName,
          toolCallId: part.toolCallId,
          result: part.output,
          hasError: Boolean(
            part.output && typeof part.output === "object" && "error" in part.output,
          ),
        });

        const bailFromToolResult = agentResolveBailedResultFromToolOutput(part.output);
        if (bailFromToolResult) {
          oc.logger.info("Subagent bailed during stream - aborting supervisor stream", {
            event: LogEvents.AGENT_STEP_TOOL_RESULT,
            agentName: bailFromToolResult.agentName,
            bailed: true,
          });
          oc.systemContext.set("bailedResult", bailFromToolResult);
          bailedResult = bailFromToolResult;
        }
        continue;
      }

      if (part.type === "tool-error") {
        shouldFlushForToolCompletion = true;
        oc.logger.debug(`Step: Tool '${part.toolName}' error`, {
          event: LogEvents.AGENT_STEP_TOOL_RESULT,
          toolName: part.toolName,
          toolCallId: part.toolCallId,
          error: part.error,
          hasError: true,
        });
      }
    }

    return {
      shouldFlushForToolCompletion,
      bailedResult,
    };
  }

  function agentResolveBailedResultFromToolOutput(
    toolOutput: unknown,
  ): { agentName: string; response: string } | undefined {
    if (!Array.isArray(toolOutput)) {
      return undefined;
    }

    const bailedToolResult = toolOutput.find((result: any) => result?.bailed === true);
    if (!bailedToolResult) {
      return undefined;
    }

    return {
      agentName: String(bailedToolResult.agentName || "unknown"),
      response: String(bailedToolResult.response || ""),
    };
  }

  function agentRecordStepResults(
    steps: ReadonlyArray<StepResult<ToolSet>> | undefined,
    oc: OperationContext,
    options?: { awaitPersistence?: boolean },
  ): Promise<void> {
    const storedSteps =
      (steps && steps.length > 0 ? steps : undefined) ||
      (oc.systemContext.get("conversationSteps") as StepResult<ToolSet>[] | undefined);

    if (!storedSteps?.length) {
      return Promise.resolve();
    }

    if (!oc.conversationSteps) {
      oc.conversationSteps = [];
    }

    const previouslyPersistedCount =
      (oc.systemContext.get(STEP_PERSIST_COUNT_KEY) as number | undefined) ?? 0;
    const newSteps = storedSteps.slice(previouslyPersistedCount);

    if (!newSteps.length) {
      return Promise.resolve();
    }

    oc.systemContext.set(STEP_PERSIST_COUNT_KEY, previouslyPersistedCount + newSteps.length);

    if (oc.conversationId) {
      const rootSpan = oc.traceContext.getRootSpan();
      rootSpan.setAttribute("conversation.id", oc.conversationId);
      rootSpan.setAttribute("voltagent.conversation_id", oc.conversationId);
    }

    const agentMetadata = oc.systemContext.get(AGENT_METADATA_CONTEXT_KEY) as
      | AgentMetadataContextValue
      | undefined;
    const subAgentMetadata =
      oc.parentAgentId && agentMetadata
        ? {
            subAgentId: agentMetadata.agentId,
            subAgentName: agentMetadata.agentName,
          }
        : undefined;

    const stepRecords: ConversationStepRecord[] = [];
    let recordTimestamp = new Date().toISOString();

    newSteps.forEach((step, offset) => {
      const usage = convertUsage(step.usage);
      const stepIndex = previouslyPersistedCount + offset;

      const trimmedText = step.text?.trim();
      if (trimmedText) {
        oc.conversationSteps?.push({
          id: randomUUID(),
          type: "text",
          content: trimmedText,
          role: "assistant",
          usage,
          ...(subAgentMetadata ?? {}),
        });

        if (oc.userId && oc.conversationId) {
          stepRecords.push({
            id: randomUUID(),
            conversationId: oc.conversationId,
            userId: oc.userId,
            agentId: stateId,
            agentName: stateName,
            operationId: oc.operationId,
            stepIndex,
            type: "text",
            role: "assistant",
            content: trimmedText,
            usage,
            subAgentId: subAgentMetadata?.subAgentId,
            subAgentName: subAgentMetadata?.subAgentName,
            createdAt: recordTimestamp,
          });
        }
      }

      if (step.toolCalls?.length) {
        for (const toolCall of step.toolCalls) {
          oc.conversationSteps?.push({
            id: toolCall.toolCallId || randomUUID(),
            type: "tool_call",
            content: safeStringify(toolCall.input ?? {}),
            role: "assistant",
            name: toolCall.toolName,
            arguments: (toolCall as { input?: Record<string, unknown> }).input || {},
            usage,
            ...(subAgentMetadata ?? {}),
          });

          if (oc.userId && oc.conversationId) {
            stepRecords.push({
              id: toolCall.toolCallId || randomUUID(),
              conversationId: oc.conversationId,
              userId: oc.userId,
              agentId: stateId,
              agentName: stateName,
              operationId: oc.operationId,
              stepIndex,
              type: "tool_call",
              role: "assistant",
              arguments: (toolCall as { input?: Record<string, unknown> }).input || {},
              usage,
              subAgentId: subAgentMetadata?.subAgentId,
              subAgentName: subAgentMetadata?.subAgentName,
              createdAt: recordTimestamp,
            });
          }
        }
      }

      // Native SDK errors are not in toolResults. Keep them in the persisted
      // execution history without turning them into successful SDK results.
      const toolResults = [
        ...(step.toolResults ?? []),
        ...(step.content ?? []).flatMap((part) =>
          part.type === "tool-error"
            ? [
                {
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  output: buildToolErrorResult(
                    part.error instanceof Error ? part.error : new Error(String(part.error)),
                    part.toolCallId,
                    part.toolName,
                  ),
                },
              ]
            : [],
        ),
      ];
      if (toolResults.length) {
        for (const toolResult of toolResults) {
          oc.conversationSteps?.push({
            id: toolResult.toolCallId || randomUUID(),
            type: "tool_result",
            content: safeStringify(toolResult.output),
            role: "assistant",
            name: toolResult.toolName,
            result: toolResult.output,
            usage,
            ...(subAgentMetadata ?? {}),
          });

          if (oc.userId && oc.conversationId) {
            stepRecords.push({
              id: toolResult.toolCallId || randomUUID(),
              conversationId: oc.conversationId,
              userId: oc.userId,
              agentId: stateId,
              agentName: stateName,
              operationId: oc.operationId,
              stepIndex,
              type: "tool_result",
              role: "assistant",
              result: toolResult.output ?? null,
              usage,
              subAgentId: subAgentMetadata?.subAgentId,
              subAgentName: subAgentMetadata?.subAgentName,
              createdAt: recordTimestamp,
            });
          }
        }
      }

      // Refresh timestamp for multi-step batches to maintain ordering while avoiding identical references
      recordTimestamp = new Date().toISOString();
    });

    if (
      agentShouldPersistMemoryForContext(oc) &&
      stepRecords.length > 0 &&
      oc.userId &&
      oc.conversationId
    ) {
      const persistStepsPromise = stateMemoryManager
        .saveConversationSteps(oc, stepRecords, oc.userId, oc.conversationId)
        .catch((error) => {
          oc.logger.debug("Failed to persist conversation steps", {
            error,
            conversationId: oc.conversationId,
            userId: oc.userId,
          });
        });

      if (options?.awaitPersistence) {
        return persistStepsPromise;
      }

      void persistStepsPromise;
    }

    return Promise.resolve();
  }

  /**
   * Add step to history - now only tracks in conversation steps
   */
  async function agentAddStepToHistory(step: StepWithContent, oc: OperationContext): Promise<void> {
    // Track in conversation steps
    if (oc.conversationSteps) {
      oc.conversationSteps.push(step);
    }
  }

  /**
   * Merge agent hooks with options hooks
   */
  function agentGetMergedHooks(options?: { hooks?: AgentHooks }): AgentHooks {
    if (!options?.hooks) {
      return stateHooks;
    }

    return {
      onStart: async (...args) => {
        await options.hooks?.onStart?.(...args);
        await stateHooks.onStart?.(...args);
      },
      onEnd: async (...args) => {
        await options.hooks?.onEnd?.(...args);
        await stateHooks.onEnd?.(...args);
      },
      onError: async (...args) => {
        await options.hooks?.onError?.(...args);
        await stateHooks.onError?.(...args);
      },
      onHandoff: async (...args) => {
        await options.hooks?.onHandoff?.(...args);
        await stateHooks.onHandoff?.(...args);
      },
      onHandoffComplete: async (...args) => {
        await options.hooks?.onHandoffComplete?.(...args);
        await stateHooks.onHandoffComplete?.(...args);
      },
      onToolStart: async (...args) => {
        await options.hooks?.onToolStart?.(...args);
        await stateHooks.onToolStart?.(...args);
      },
      onToolEnd:
        options.hooks.onToolEnd || stateHooks.onToolEnd
          ? async (...args) => {
              const resOptions = await options.hooks?.onToolEnd?.(...args);
              const resThis = await stateHooks.onToolEnd?.(...args);
              if (resThis && typeof resThis === "object") {
                return resThis as OnToolEndHookResult;
              }
              if (resOptions && typeof resOptions === "object") {
                return resOptions as OnToolEndHookResult;
              }
              return undefined;
            }
          : undefined,
      onToolError: async (...args) => {
        const resOptions = await options.hooks?.onToolError?.(...args);
        const resThis = await stateHooks.onToolError?.(...args);
        if (resThis && typeof resThis === "object") {
          return resThis as OnToolErrorHookResult;
        }
        if (resOptions && typeof resOptions === "object") {
          return resOptions as OnToolErrorHookResult;
        }
        return undefined;
      },
      onStepEnd: async (...args) => {
        await options.hooks?.onStepEnd?.(...args);
        await stateHooks.onStepEnd?.(...args);
      },
      onRetry: async (...args) => {
        await options.hooks?.onRetry?.(...args);
        await stateHooks.onRetry?.(...args);
      },
      onFallback: async (...args) => {
        await options.hooks?.onFallback?.(...args);
        await stateHooks.onFallback?.(...args);
      },
      onPrepareMessages: options.hooks?.onPrepareMessages || stateHooks.onPrepareMessages,
      onPrepareModelMessages:
        options.hooks?.onPrepareModelMessages || stateHooks.onPrepareModelMessages,
    };
  }

  /**
   * Setup abort signal listener
   */
  function agentSetupAbortSignalListener(oc: OperationContext): void {
    if (!oc.abortController) return;
    if (oc.systemContext.get(ABORT_LISTENER_ATTACHED_KEY)) {
      return;
    }
    oc.systemContext.set(ABORT_LISTENER_ATTACHED_KEY, true);

    const signal = oc.abortController.signal;
    signal.addEventListener("abort", async () => {
      // Mark operation as inactive
      oc.isActive = false;

      // Check if this is a bail (early termination from subagent)
      const isBail = isBailError(signal.reason as Error);

      if (isBail) {
        // Bail is not an error - it's a successful early termination
        // Get the bailed result from systemContext
        const bailedResult = oc.systemContext.get("bailedResult") as
          | { agentName: string; response: string }
          | undefined;

        if (oc.traceContext && bailedResult) {
          const rootSpan = oc.traceContext.getRootSpan();
          // Mark as completed, not cancelled
          rootSpan.setAttribute("agent.state", "completed");
          rootSpan.setAttribute("bailed", true);
          rootSpan.setAttribute("bail.subagent", bailedResult.agentName);
          // Set output so it appears in observability UI
          rootSpan.setAttribute("output", bailedResult.response);
          // Set finish reason
          rootSpan.setAttribute("ai.response.finish_reason", "bail");
          // Span status is OK (success), not ERROR
          rootSpan.setStatus({ code: SpanStatusCode.OK });
          rootSpan.end();
        }
      } else {
        // Normal abort/cancellation - treat as error
        if (isClientHTTPError(signal.reason)) {
          oc.cancellationError = signal.reason;
        } else {
          const abortReason = match(signal.reason)
            .with(P.string, (reason) => reason)
            .with({ message: P.string }, (reason) => reason.message)
            .otherwise(() => "Operation cancelled");
          oc.cancellationError = createAbortError(abortReason);
        }

        // Track cancellation in OpenTelemetry
        if (oc.traceContext) {
          const rootSpan = oc.traceContext.getRootSpan();
          rootSpan.setAttribute("agent.state", "cancelled");
          rootSpan.setAttribute("cancelled", true);
          rootSpan.setAttribute("cancellation.reason", oc.cancellationError.message);
          rootSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: oc.cancellationError.message,
          });
          rootSpan.recordException(oc.cancellationError);
          rootSpan.end();
        }

        // Call onEnd hook with cancellation error
        const hooks = agentGetMergedHooks();
        await hooks.onEnd?.({
          conversationId: oc.conversationId || "",
          agent: runtimeAgent,
          output: undefined,
          error: oc.cancellationError,
          context: oc,
        });
      }
    });
  }

  /**
   * Handle errors
   */
  async function agentHandleError(
    error: Error,
    oc: OperationContext,
    options?: AnyBaseGenerationOptions,
    startTime?: number,
  ): Promise<never> {
    // Check if this is a BailError (subagent early termination)
    // This should be handled gracefully, not as an error
    if (isBailError(error)) {
      // BailError should have been handled in onFinish/onError callbacks
      // If we reach here, something went wrong - log and re-throw
      oc.logger.warn("BailError reached handleError - this should not happen", {
        agentName: error.agentName,
        event: LogEvents.AGENT_GENERATION_FAILED,
      });
      throw error;
    }

    // Check if cancelled
    if (!oc.isActive && oc.cancellationError) {
      throw oc.cancellationError;
    }

    const voltagentError = isVoltAgentError(error) ? error : createVoltAgentError(error);
    const errorDetails = extractGenerationErrorDetails(voltagentError);

    if (errorDetails.usage || errorDetails.providerMetadata !== undefined) {
      agentRecordRootSpanUsageAndProviderCost(
        oc.traceContext,
        errorDetails.usage,
        errorDetails.providerMetadata,
      );
    }
    if (errorDetails.finishReason) {
      oc.traceContext.setFinishReason(errorDetails.finishReason);
    }

    oc.traceContext.end("error", error);

    // Call hooks
    const hooks = agentGetMergedHooks(options);
    await hooks.onEnd?.({
      conversationId: oc.conversationId || "",
      agent: runtimeAgent,
      output: undefined,
      error: voltagentError,
      context: oc,
    });
    await hooks.onError?.({ agent: runtimeAgent, error: voltagentError, context: oc });

    // Log error
    oc.logger.error("Generation failed", {
      event: LogEvents.AGENT_GENERATION_FAILED,
      duration: startTime ? Date.now() - startTime : undefined,
      error: {
        message: voltagentError.message,
        code: voltagentError.code,
        stage: voltagentError.stage,
      },
    });

    throw error;
  }

  // ============================================================================
  // Public Utility Methods
  // ============================================================================

  /**
   * Calculate max steps based on SubAgents
   */
  function agentCalculateMaxSteps(): number {
    return stateSubAgentManager.calculateMaxSteps(stateMaxSteps);
  }

  /**
   * Get the model name.
   * Pass a resolved model to return its modelId (useful for dynamic models).
   */
  function agentGetModelName(model?: LanguageModel | string): string {
    if (model) {
      if (typeof model === "string") {
        return model;
      }
      return model.modelId || "unknown";
    }
    if (Array.isArray(stateModel)) {
      const primary = stateModel.find((entry) => entry.enabled !== false) ?? stateModel[0];
      if (!primary) {
        return "unknown";
      }
      const modelValue = primary.model;
      if (typeof modelValue === "function") {
        return "dynamic";
      }
      if (typeof modelValue === "string") {
        return modelValue;
      }
      return modelValue.modelId || "unknown";
    }
    if (typeof stateModel === "function") {
      return "dynamic";
    }
    if (typeof stateModel === "string") {
      return stateModel;
    }
    return stateModel.modelId || "unknown";
  }

  /**
   * Get full agent state
   */
  function agentGetFullState(): AgentFullState {
    const cloneRecord = (value: unknown): Record<string, unknown> | null => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
      }
      const result = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(
          ([, entryValue]) => typeof entryValue !== "function",
        ),
      );
      return Object.keys(result).length > 0 ? result : null;
    };

    const slugifyGuardrailIdentifier = (value: string): string => {
      return (
        value
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "guardrail"
      );
    };

    const mapGuardrails = (
      guardrailList: Array<NormalizedInputGuardrail | NormalizedOutputGuardrail>,
      direction: "input" | "output",
    ): AgentGuardrailState[] => {
      return guardrailList.map((guardrail, index) => {
        const baseIdentifier = guardrail.id ?? guardrail.name ?? `${direction}-${index + 1}`;
        const slug = slugifyGuardrailIdentifier(String(baseIdentifier));
        const metadata = cloneRecord(guardrail.metadata ?? null);

        const state: AgentGuardrailState = {
          id: guardrail.id,
          name: guardrail.name,
          direction,
          node_id: createNodeId(NodeType.GUARDRAIL, `${direction}-${slug || index + 1}`, stateId),
        };

        if (guardrail.description) {
          state.description = guardrail.description;
        }
        if (guardrail.severity) {
          state.severity = guardrail.severity;
        }
        if (guardrail.tags && guardrail.tags.length > 0) {
          state.tags = [...guardrail.tags];
        }
        if (metadata) {
          state.metadata = metadata;
        }

        return state;
      });
    };

    const guardrails = {
      input: mapGuardrails(stateInputGuardrails, "input"),
      output: mapGuardrails(stateOutputGuardrails, "output"),
    };

    const scorerEntries = Object.entries(stateEvalConfig?.scorers ?? {});
    const scorers =
      scorerEntries.length > 0
        ? scorerEntries.map(([key, scorerConfig]) => {
            const definition =
              typeof scorerConfig.scorer === "object" && scorerConfig.scorer !== null
                ? (scorerConfig.scorer as {
                    id?: string;
                    name?: string;
                    metadata?: unknown;
                    sampling?: SamplingPolicy;
                  })
                : undefined;
            const scorerId = String(scorerConfig.id ?? definition?.id ?? key);
            const scorerName =
              (typeof definition?.name === "string" && definition.name.trim().length > 0
                ? definition.name
                : undefined) ?? scorerId;
            const sampling =
              scorerConfig.sampling ?? definition?.sampling ?? stateEvalConfig?.sampling;
            const metadata = cloneRecord(definition?.metadata ?? null);
            const params =
              typeof scorerConfig.params === "function" ? null : cloneRecord(scorerConfig.params);

            return {
              key,
              id: scorerId,
              name: scorerName,
              sampling,
              metadata,
              params,
              node_id: createNodeId(NodeType.SCORER, scorerId, stateId),
            };
          })
        : [];

    const activeMemory = runtimeAgent.getMemory();
    const memoryInstance: Memory | undefined = activeMemory || undefined;
    const toolRoutingConfig =
      stateToolRouting && typeof stateToolRouting === "object" ? stateToolRouting : undefined;
    const toolRoutingState: AgentToolRoutingState | undefined = toolRoutingConfig
      ? (() => {
          const searchTool = stateToolManager.getToolByName(TOOL_ROUTING_SEARCH_TOOL_NAME);
          const callTool = stateToolManager.getToolByName(TOOL_ROUTING_CALL_TOOL_NAME);
          const searchApiTool =
            searchTool && agentIsToolRoutingSupportTool(searchTool)
              ? new ToolManager([searchTool], stateLogger).getToolsForApi()[0]
              : undefined;
          const callApiTool =
            callTool && agentIsToolRoutingSupportTool(callTool)
              ? new ToolManager([callTool], stateLogger).getToolsForApi()[0]
              : undefined;
          const poolTools = stateToolPoolManager
            .getAllTools()
            .filter((tool) => !agentIsToolRoutingSupportTool(tool));
          const poolApiTools =
            poolTools.length > 0 ? new ToolManager(poolTools, stateLogger).getToolsForApi() : [];
          const exposeApiTools =
            toolRoutingConfig.expose && toolRoutingConfig.expose.length > 0
              ? new ToolManager(toolRoutingConfig.expose, stateLogger).getToolsForApi()
              : [];

          return {
            search: searchApiTool,
            call: callApiTool,
            expose: exposeApiTools.length > 0 ? exposeApiTools : undefined,
            pool: poolApiTools.length > 0 ? poolApiTools : undefined,
            enforceSearchBeforeCall: toolRoutingConfig.enforceSearchBeforeCall ?? true,
            topK: toolRoutingConfig.topK,
          };
        })()
      : undefined;

    return {
      id: stateId,
      name: stateName,
      instructions:
        typeof stateInstructions === "function" ? "Dynamic instructions" : stateInstructions,
      status: "idle",
      model: runtimeAgent.getModelName(),
      node_id: createNodeId(NodeType.AGENT, stateId),

      tools: (() => {
        const merged = new Map<string, ManagedToolInfo>();
        for (const tool of [
          ...stateToolManager.getAllTools(),
          ...stateToolPoolManager.getAllTools(),
        ]) {
          if (!merged.has(tool.name)) {
            merged.set(tool.name, tool);
          }
        }
        return Array.from(merged.values()).map((tool) => ({
          ...tool,
          node_id: createNodeId(NodeType.TOOL, tool.name, stateId),
        }));
      })(),
      toolRouting: toolRoutingState,

      subAgents: stateSubAgentManager.getSubAgentDetails().map((subAgent) => ({
        ...subAgent,
        node_id: createNodeId(NodeType.SUBAGENT, subAgent.id),
      })),

      memory: {
        ...stateMemoryManager.getMemoryState(),
        node_id: createNodeId(NodeType.MEMORY, stateId),
        // Add vector DB and embedding info if Memory V2 is configured
        vectorDB: memoryInstance?.getVectorAdapter?.()
          ? {
              enabled: true,
              adapter: memoryInstance.getVectorAdapter()?.constructor.name || "Unknown",
              dimension: memoryInstance.getEmbeddingAdapter?.()?.getDimensions() || 0,
              status: "idle",
              node_id: createNodeId(NodeType.VECTOR, stateId),
            }
          : null,
        embeddingModel: memoryInstance?.getEmbeddingAdapter?.()
          ? {
              enabled: true,
              model: memoryInstance.getEmbeddingAdapter()?.getModelName() || "unknown",
              dimension: memoryInstance.getEmbeddingAdapter()?.getDimensions() || 0,
              status: "idle",
              node_id: createNodeId(NodeType.EMBEDDING, stateId),
            }
          : null,
      },

      retriever: stateRetriever
        ? {
            name: stateRetriever.tool.name,
            description: stateRetriever.tool.description,
            status: "idle",
            node_id: createNodeId(NodeType.RETRIEVER, stateRetriever.tool.name, stateId),
          }
        : null,
      scorers,
      guardrails:
        guardrails.input.length > 0 || guardrails.output.length > 0 ? guardrails : undefined,
    };
  }

  /**
   * Add tools or toolkits to the agent
   */
  function agentAddTools(tools: AgentToolInput): {
    added: AgentToolInput;
  } {
    addAgentToolInputToManager(stateToolManager, tools);
    if (stateToolRouting && !stateToolRoutingPoolExplicit) {
      addAgentToolInputToManager(stateToolPoolManager, tools);
    }
    return { added: tools };
  }

  /**
   * Remove one or more tools by name
   * @param toolNames - Array of tool names to remove
   * @returns Object containing successfully removed tool names
   */
  function agentRemoveTools(toolNames: string[]): { removed: string[] } {
    const removed: string[] = [];
    for (const name of toolNames) {
      if (stateToolManager.removeTool(name)) {
        removed.push(name);
        if (stateToolRouting && !stateToolRoutingPoolExplicit) {
          stateToolPoolManager.removeTool(name);
        }
      }
    }

    stateLogger.debug(`Removed ${removed.length} tools`, {
      removed,
      requested: toolNames,
    });

    return { removed };
  }

  /**
   * Remove a toolkit by name
   * @param toolkitName - Name of the toolkit to remove
   * @returns true if the toolkit was removed, false if it wasn't found
   */
  function agentRemoveToolkit(toolkitName: string): boolean {
    const result = stateToolManager.removeToolkit(toolkitName);
    if (result && stateToolRouting && !stateToolRoutingPoolExplicit) {
      stateToolPoolManager.removeToolkit(toolkitName);
    }

    if (result) {
      stateLogger.debug(`Removed toolkit: ${toolkitName}`);
    } else {
      stateLogger.debug(`Toolkit not found: ${toolkitName}`);
    }

    return result;
  }

  /**
   * Add a sub-agent
   */
  function agentAddSubAgent(agentConfig: SubAgentConfig): void {
    stateSubAgentManager.addSubAgent(agentConfig);

    // Add delegate tool if this is the first sub-agent
    if (stateSubAgentManager.getSubAgents().length === 1) {
      const delegateTool = stateSubAgentManager.createDelegateTool({
        sourceAgent: runtimeAgent as any,
      });
      stateToolManager.addStandaloneTool(delegateTool);
      if (stateToolRouting && !stateToolRoutingPoolExplicit) {
        stateToolPoolManager.addStandaloneTool(delegateTool);
      }
    }
  }

  /**
   * Remove a sub-agent
   */
  function agentRemoveSubAgent(agentId: string): void {
    stateSubAgentManager.removeSubAgent(agentId);

    // Remove delegate tool if no sub-agents left
    if (stateSubAgentManager.getSubAgents().length === 0) {
      stateToolManager.removeTool("delegate_task");
      if (stateToolRouting && !stateToolRoutingPoolExplicit) {
        stateToolPoolManager.removeTool("delegate_task");
      }
    }
  }

  /**
   * Get all tools
   */
  function agentGetTools(): Array<Tool<any, any> | ProviderTool | NamedAiSdkTool> {
    return stateToolManager.getAllTools();
  }

  /**
   * Get tools for API
   */
  function agentGetToolsForApi() {
    const exposed = stateToolManager.getToolsForApi();
    const pooled = stateToolPoolManager.getToolsForApi();
    const merged = new Map<string, ApiToolInfo>();
    for (const tool of [...exposed, ...pooled]) {
      if (!merged.has(tool.name)) {
        merged.set(tool.name, tool);
      }
    }
    return Array.from(merged.values());
  }

  /**
   * Get all sub-agents
   */
  function agentGetSubAgents(): SubAgentConfig[] {
    return stateSubAgentManager.getSubAgents();
  }

  /**
   * Unregister this agent
   */
  function agentUnregister(): void {
    // Agent unregistration tracked via OpenTelemetry
  }

  /**
   * Check if telemetry is configured
   * Returns true if VoltOpsClient with observability is configured
   */
  function agentIsTelemetryConfigured(): boolean {
    // Check if observability is configured
    const observability = agentGetObservability();
    if (!observability) {
      return false;
    }

    // Check if VoltOpsClient is available for remote export
    // Priority: Agent's own VoltOpsClient, then global one
    const voltOpsClient =
      stateVoltOpsClient || AgentRegistry.getInstance().getGlobalVoltOpsClient();

    return voltOpsClient !== undefined;
  }

  /**
   * Persist a "feedback provided" marker into assistant message metadata.
   */
  async function agentMarkFeedbackProvided(
    input: AgentMarkFeedbackProvidedInput,
  ): Promise<AgentFeedbackMetadata | null> {
    return await markFeedbackProvidedHelper({
      memory: stateMemoryManager.getMemory(),
      input,
    });
  }

  /**
   * Get memory manager
   */
  function agentGetMemoryManager(): MemoryManager {
    return stateMemoryManager;
  }

  /**
   * Get tool manager
   */
  function agentGetToolManager(): ToolManager {
    return stateToolManager;
  }

  /**
   * Get Workspace instance if configured
   */
  function agentGetWorkspace(): Workspace | undefined {
    return stateWorkspace;
  }

  /**
   * Get Memory instance if available
   */
  function agentGetMemory(): Memory | false | undefined {
    if (stateMemory === false) {
      return false;
    }

    return stateMemory ?? stateMemoryManager.getMemory();
  }

  /**
   * Internal: apply a default Memory instance when none was configured explicitly.
   */
  function agent__setDefaultMemory(memory: Memory): void {
    if (stateMemoryConfigured || stateMemory === false) {
      return;
    }
    stateMemoryManager.setMemory(memory, agentCreateConversationTitleGenerator(memory));
  }

  /**
   * Internal: apply default conversation persistence when none was configured explicitly.
   */
  function agent__setDefaultConversationPersistence(
    conversationPersistence: AgentConversationPersistenceOptions,
  ): void {
    if (stateConversationPersistenceConfigured) {
      return;
    }

    stateConversationPersistence =
      agentNormalizeConversationPersistenceOptions(conversationPersistence);
  }

  /**
   * Internal: apply a default Workspace instance when none was configured explicitly.
   */
  function agent__setDefaultWorkspace(workspace: Workspace): void {
    if (stateWorkspaceConfigured || stateWorkspace) {
      return;
    }

    stateWorkspace = workspace;
    if (!stateMaxStepsConfigured) {
      stateMaxSteps = 100;
    }

    const hookOptions = {
      hooks: stateConfiguredHooks,
      workspaceToolkits: stateWorkspaceToolkitOptions,
      workspaceSkillsPrompt: stateWorkspaceSkillsPromptOption,
    };
    const onPrepareMessages = resolveWorkspaceSkillsPromptHook(stateWorkspace, hookOptions);
    stateHooks = onPrepareMessages
      ? { ...(stateConfiguredHooks || {}), onPrepareMessages }
      : stateConfiguredHooks || {};

    const workspaceToolkits = buildWorkspaceToolkits(stateWorkspace, stateWorkspaceToolkitOptions);
    if (workspaceToolkits.length > 0) {
      stateToolManager.addItems(workspaceToolkits);
      if (stateToolRouting && !stateToolRoutingPoolExplicit) {
        stateToolPoolManager.addItems(workspaceToolkits);
      }
    }
  }

  /**
   * Internal: apply a default tool routing config when none was configured explicitly.
   */
  function agent__setDefaultToolRouting(toolRouting?: ToolRoutingConfig): void {
    if (stateToolRoutingConfigured) {
      return;
    }
    stateToolRouting = toolRouting;
    stateToolRoutingConfigured = true;
    agentApplyToolRoutingConfig(stateToolRouting);
  }

  function agentApplyToolRoutingConfig(toolRouting?: ToolRoutingConfig | false): void {
    if (!toolRouting) {
      stateToolRoutingPoolExplicit = false;
      stateToolRoutingSearchStrategy = undefined;
      stateToolRoutingExposedNames = new Set();
      agentRemoveToolRoutingSupportTools();
      return;
    }

    stateToolRoutingPoolExplicit = Object.prototype.hasOwnProperty.call(toolRouting, "pool");
    stateToolRoutingExposedNames = new Set();

    stateToolRoutingSearchStrategy = toolRouting.embedding
      ? createEmbeddingToolSearchStrategy(toolRouting.embedding)
      : undefined;

    const searchTool = agentCreateToolRoutingSearchTool();
    const callTool = agentCreateToolRoutingCallTool();
    agentUpsertToolRoutingSupportTool(searchTool);
    agentUpsertToolRoutingSupportTool(callTool);
    stateToolRoutingExposedNames.add(searchTool.name);
    stateToolRoutingExposedNames.add(callTool.name);

    agentAssertNoToolRoutingNameConflicts(toolRouting.expose, "toolRouting.expose");
    agentAssertNoToolRoutingNameConflicts(toolRouting.pool, "toolRouting.pool");

    if (toolRouting.expose && toolRouting.expose.length > 0) {
      stateToolManager.addItems(toolRouting.expose);
      const exposedManager = new ToolManager(toolRouting.expose, stateLogger);
      exposedManager.getAllToolNames().forEach((name) => stateToolRoutingExposedNames.add(name));
    }
    if (toolRouting.pool && toolRouting.pool.length > 0) {
      stateToolPoolManager.addItems(toolRouting.pool);
    } else if (!stateToolRoutingPoolExplicit) {
      const autoPool = stateToolManager
        .getAllTools()
        .filter((tool) => !agentIsToolRoutingSupportTool(tool));
      if (autoPool.length > 0) {
        stateToolPoolManager.addItems(autoPool);
      }
    }
  }

  function agentRemoveToolRoutingSupportTools(): void {
    for (const name of agentGetToolRoutingSupportToolNames()) {
      const existing = stateToolManager.getToolByName(name);
      if (existing && agentIsToolRoutingSupportTool(existing)) {
        stateToolManager.removeTool(name);
      }
    }
  }

  function agentUpsertToolRoutingSupportTool(tool: Tool<any, any>): void {
    const existing = stateToolManager.getToolByName(tool.name);
    if (existing && !agentIsToolRoutingSupportTool(existing)) {
      stateLogger.debug(
        `Tool routing support tool "${tool.name}" not added because a user-defined tool with the same name exists.`,
      );
      return;
    }

    if (existing && agentIsToolRoutingSupportTool(existing)) {
      stateToolManager.removeTool(tool.name);
    }

    stateToolManager.addStandaloneTool(tool);
  }

  function agentAssertNoToolRoutingNameConflicts(
    items: (Tool<any, any> | Toolkit | VercelTool)[] | undefined,
    scope: string,
  ): void {
    if (!items || items.length === 0) {
      return;
    }

    const reservedNames = agentGetToolRoutingSupportToolNames();
    const manager = new ToolManager(items, stateLogger);
    const conflicts = manager
      .getAllToolNames()
      .filter((name) => reservedNames.has(name))
      .sort();

    if (conflicts.length > 0) {
      throw new Error(
        `Tool routing reserves tool names ${conflicts.join(
          ", ",
        )}. Remove them from ${scope} or rename the conflicting tools.`,
      );
    }
  }

  function agentResolveToolRouting(
    options?: AnyBaseGenerationOptions,
  ): ToolRoutingConfig | false | undefined {
    if (options?.toolRouting !== undefined) {
      return options.toolRouting;
    }
    return stateToolRouting;
  }

  function agentGetToolRoutingExposedNames(toolRouting: ToolRoutingConfig): Set<string> {
    if (toolRouting === stateToolRouting && stateToolRoutingExposedNames.size > 0) {
      return stateToolRoutingExposedNames;
    }

    const exposedNames = new Set<string>();
    exposedNames.add(TOOL_ROUTING_SEARCH_TOOL_NAME);
    exposedNames.add(TOOL_ROUTING_CALL_TOOL_NAME);

    if (toolRouting.expose && toolRouting.expose.length > 0) {
      const exposedManager = new ToolManager(toolRouting.expose, stateLogger);
      exposedManager.getAllToolNames().forEach((name) => exposedNames.add(name));
    }

    return exposedNames;
  }

  /**
   * Convert this agent into a tool that can be used by other agents.
   * This enables supervisor/coordinator patterns where one agent can delegate
   * work to other specialized agents.
   *
   * @param options - Optional configuration for the tool
   * @param options.name - Custom name for the tool (defaults to `${agent.id}_tool`)
   * @param options.description - Custom description (defaults to agent's purpose or auto-generated)
   * @param options.parametersSchema - Custom input schema (defaults to { prompt: string })
   *
   * @returns A Tool instance that executes this agent
   *
   * @example
   * ```typescript
   * const writerAgent = defineAgent({
   *   id: "writer",
   *   purpose: "Writes blog posts",
   *   // ... other config
   * });
   *
   * const editorAgent = defineAgent({
   *   id: "editor",
   *   purpose: "Edits content",
   *   // ... other config
   * });
   *
   * // Supervisor agent that uses both as tools
   * const supervisorAgent = defineAgent({
   *   id: "supervisor",
   *   instructions: "First call writer, then editor",
   *   tools: [
   *     writerAgent.toTool(),
   *     editorAgent.toTool()
   *   ]
   * });
   * ```
   */
  function agentToTool(options?: {
    name?: string;
    description?: string;
    parametersSchema?: z.ZodObject<any>;
    context?: AgentContextInput<CONTEXT_SCHEMA>;
  }): Tool<any, any> {
    const toolContext = options?.context;
    const toolName = options?.name || `${stateId}_tool`;
    const toolDescription =
      options?.description || statePurpose || `Executes the ${stateName} agent to complete a task`;

    const parametersSchema =
      options?.parametersSchema ||
      z.object({
        prompt: z.string().describe("The prompt or task to send to the agent"),
      });

    return createTool({
      name: toolName,
      description: toolDescription,
      parameters: parametersSchema,
      execute: async (args, options) => {
        // Extract the prompt from args
        const prompt = (args as any).prompt || args;

        // Extract OperationContext from options if available
        // Since ToolExecuteOptions extends Partial<OperationContext>, we can extract the fields
        const oc = options as OperationContext | undefined;
        const resolvedMemory = options?.resolvedMemory;
        const memoryBehaviorOverrides = resolvedMemory
          ? {
              ...(resolvedMemory.contextLimit !== undefined
                ? { contextLimit: resolvedMemory.contextLimit }
                : {}),
              ...(resolvedMemory.semanticMemory !== undefined
                ? { semanticMemory: resolvedMemory.semanticMemory }
                : {}),
              ...(resolvedMemory.conversationPersistence !== undefined
                ? { conversationPersistence: resolvedMemory.conversationPersistence }
                : {}),
              ...(resolvedMemory.messageMetadataPersistence !== undefined
                ? { messageMetadataPersistence: resolvedMemory.messageMetadataPersistence }
                : {}),
              ...(resolvedMemory.readOnly !== undefined
                ? { readOnly: resolvedMemory.readOnly }
                : {}),
            }
          : undefined;
        const memory =
          resolvedMemory || options?.conversationId || options?.userId
            ? {
                conversationId: resolvedMemory?.conversationId ?? options?.conversationId,
                userId: resolvedMemory?.userId ?? options?.userId,
                ...(memoryBehaviorOverrides && Object.keys(memoryBehaviorOverrides).length > 0
                  ? { options: memoryBehaviorOverrides }
                  : {}),
              }
            : undefined;

        // Generate response using this agent
        // A tool boundary validates the merged context at runtime, like server/registry calls.
        const result = await (runtimeAgent as Agent).generateText<
          OutputSpec,
          ProviderOptions,
          ToolSet,
          AISDKContext
        >(prompt, {
          // Pass through the operation context if available
          parentOperationContext: oc,
          voltagent: { context: toolContext },
          ...(memory ? { memory } : {}),
        });

        // Return the text result
        return {
          text: result.text,
          usage: result.usage,
        };
      },
    });
  }

  /**
   * Check if working memory is supported
   */
  function agentHasWorkingMemorySupport(): boolean {
    const memory = stateMemoryManager.getMemory();
    return memory?.hasWorkingMemorySupport?.() ?? false;
  }

  /**
   * Set usage information on trace context
   * Maps AI SDK's LanguageModelUsage to trace context format
   */
  function agentSetTraceContextUsage(
    traceContext: AgentTraceContext,
    usage?: LanguageModelUsage,
  ): void {
    if (!usage) return;

    const resolvedUsage = convertUsage(usage);
    if (!resolvedUsage) return;

    traceContext.setUsage({
      promptTokens: resolvedUsage.promptTokens,
      completionTokens: resolvedUsage.completionTokens,
      totalTokens: resolvedUsage.totalTokens,
      cachedTokens: resolvedUsage.cachedInputTokens,
      reasoningTokens: resolvedUsage.reasoningTokens,
    });
  }

  function agentRecordRootSpanUsageAndProviderCost(
    traceContext: AgentTraceContext,
    usage?: LanguageModelUsage,
    providerMetadata?: unknown,
  ): void {
    agentSetTraceContextUsage(traceContext, usage);
    agentRecordProviderCost(traceContext.getRootSpan(), providerMetadata);
  }

  /**
   * Create working memory tools if configured
   */
  function agentCreateWorkingMemoryTools(
    options?: AnyBaseGenerationOptions,
    operationContext?: OperationContext,
  ): Tool<any, any>[] {
    if (!agentHasWorkingMemorySupport()) {
      return [];
    }
    const resolvedMemory = agentResolveMemoryRuntimeOptions(options, operationContext);
    const isReadOnly = resolvedMemory.readOnly === true;

    const memoryManager = stateMemoryManager as unknown as MemoryManager;
    const memory = memoryManager.getMemory();

    if (!memory) {
      return [];
    }

    const tools: Tool<any, any>[] = [];

    // Get Working Memory tool
    tools.push(
      createTool({
        name: "get_working_memory",
        description: "Get the current working memory content for this conversation or user",
        parameters: z.object({}),
        execute: async () => {
          const content = await memory.getWorkingMemory({
            conversationId: resolvedMemory.conversationId,
            userId: resolvedMemory.userId,
          });
          return content || "No working memory content found.";
        },
      }),
    );

    if (!isReadOnly) {
      // Update Working Memory tool
      const schema = memory.getWorkingMemorySchema();
      const template = memory.getWorkingMemoryTemplate();

      // Build parameters based on schema
      const baseParams = schema
        ? { content: schema }
        : { content: z.string().describe("The content to store in working memory") };

      const modeParam = {
        mode: z
          .enum(["replace", "append"])
          .default("append")
          .describe(
            "How to update: 'append' (default - safely merge with existing) or 'replace' (complete overwrite - DELETES other fields!)",
          ),
      };

      tools.push(
        createTool({
          name: "update_working_memory",
          description: template
            ? `Update working memory. Default mode is 'append' which safely merges new data. Only use 'replace' if you want to COMPLETELY OVERWRITE all data. Current data is in <current_context>. Template: ${template}`
            : `Update working memory with important context. Default mode is 'append' which safely merges new data. Only use 'replace' if you want to COMPLETELY OVERWRITE all data. Current data is in <current_context>.`,
          parameters: z.object({ ...baseParams, ...modeParam }),
          execute: async ({ content, mode }, oc) => {
            await memory.updateWorkingMemory({
              conversationId: resolvedMemory.conversationId,
              userId: resolvedMemory.userId,
              content,
              options: {
                mode: mode as MemoryUpdateMode | undefined,
              },
            });

            // Update root span with final content
            if (oc?.traceContext) {
              const finalContent = await memory.getWorkingMemory({
                conversationId: resolvedMemory.conversationId,
                userId: resolvedMemory.userId,
              });
              const rootSpan = oc.traceContext.getRootSpan();
              rootSpan.setAttribute("agent.workingMemory.finalContent", finalContent || "");
              rootSpan.setAttribute("agent.workingMemory.lastUpdateTime", new Date().toISOString());
            }

            return `Working memory ${mode === "replace" ? "replaced" : "updated (appended)"} successfully.`;
          },
        }),
      );

      // Clear Working Memory tool (optional, might not always be needed)
      tools.push(
        createTool({
          name: "clear_working_memory",
          description: "Clear the working memory content",
          parameters: z.object({}),
          execute: async (_, oc) => {
            await memory.clearWorkingMemory({
              conversationId: resolvedMemory.conversationId,
              userId: resolvedMemory.userId,
            });

            // Update root span to indicate cleared state
            if (oc?.traceContext) {
              const rootSpan = oc.traceContext.getRootSpan();
              rootSpan.setAttribute("agent.workingMemory.finalContent", "");
              rootSpan.setAttribute("agent.workingMemory.lastUpdateTime", new Date().toISOString());
            }

            return "Working memory cleared.";
          },
        }),
      );
    }

    return tools;
  }

  const runtimeAgent: Agent<AGENT_TOOLS, CONTEXT_SCHEMA> = {
    get id() {
      return stateId;
    },
    get name() {
      return stateName;
    },
    get purpose() {
      return statePurpose;
    },
    get instructions() {
      return stateInstructions;
    },
    get model() {
      return stateModel;
    },
    get dynamicTools() {
      return stateDynamicTools;
    },
    get hooks() {
      return stateHooks;
    },
    set hooks(value) {
      stateHooks = value;
    },
    get temperature() {
      return stateTemperature;
    },
    get maxOutputTokens() {
      return stateMaxOutputTokens;
    },
    get maxSteps() {
      return stateMaxSteps;
    },
    set maxSteps(value) {
      stateMaxSteps = value;
    },
    get maxRetries() {
      return stateMaxRetries;
    },
    get stopWhen() {
      return stateStopWhen;
    },
    get prepareStep() {
      return statePrepareStep;
    },
    get markdown() {
      return stateMarkdown;
    },
    get inheritParentSpan() {
      return stateInheritParentSpan;
    },
    get voice() {
      return stateVoice;
    },
    get retriever() {
      return stateRetriever;
    },
    get supervisorConfig() {
      return stateSupervisorConfig;
    },
    generateText: agentGenerateText,
    streamText: agentStreamText,
    generateObject: agentGenerateObject,
    streamObject: agentStreamObject,
    getModelName: agentGetModelName,
    getFullState: agentGetFullState,
    addTools: agentAddTools,
    removeTools: agentRemoveTools,
    removeToolkit: agentRemoveToolkit,
    addSubAgent: agentAddSubAgent,
    removeSubAgent: agentRemoveSubAgent,
    getTools: agentGetTools,
    getToolsForApi: agentGetToolsForApi,
    getSubAgents: agentGetSubAgents,
    unregister: agentUnregister,
    isTelemetryConfigured: agentIsTelemetryConfigured,
    markFeedbackProvided: agentMarkFeedbackProvided,
    getMemoryManager: agentGetMemoryManager,
    getToolManager: agentGetToolManager,
    getWorkspace: agentGetWorkspace,
    getMemory: agentGetMemory,
    __setDefaultMemory: agent__setDefaultMemory,
    __setDefaultConversationPersistence: agent__setDefaultConversationPersistence,
    __setDefaultWorkspace: agent__setDefaultWorkspace,
    __setDefaultToolRouting: agent__setDefaultToolRouting,
    toTool: agentToTool,
  };

  // The registry/runtime boundary is schema-erased; public callbacks keep inferred types.
  const options = typedOptions as unknown as AgentOptions<AGENT_TOOLS>;
  const stateContextSchema: AgentContextSchema | undefined = options.contextSchema;
  const stateId: string = options.id || options.name;
  const stateName: string = options.name;
  const statePurpose: string | undefined = options.purpose;
  const stateInstructions: InstructionsDynamicValue = options.instructions;
  const stateModel: AgentModelValue = options.model;
  const stateDynamicTools: DynamicValue<AgentToolInput<AGENT_TOOLS>> | undefined =
    typeof options.tools === "function" ? options.tools : undefined;
  const stateWorkspaceConfigured: boolean = options.workspace !== undefined;
  const stateWorkspaceToolkitOptions: AgentOptions["workspaceToolkits"] = options.workspaceToolkits;
  const stateWorkspaceSkillsPromptOption: AgentOptions["workspaceSkillsPrompt"] =
    options.workspaceSkillsPrompt;
  const stateConfiguredHooks: AgentHooks | undefined = options.hooks;
  const stateMaxStepsConfigured: boolean = options.maxSteps !== undefined;
  const globalWorkspace = AgentRegistry.getInstance().getGlobalWorkspace();
  const workspaceOption = options.workspace === undefined ? globalWorkspace : options.workspace;
  stateWorkspace = resolveWorkspace(workspaceOption);
  const onPrepareMessages = resolveWorkspaceSkillsPromptHook(stateWorkspace, options);
  stateHooks = onPrepareMessages
    ? { ...(options.hooks || {}), onPrepareMessages }
    : options.hooks || {};
  const stateTemperature: number | undefined = options.temperature;
  const stateMaxOutputTokens: number | undefined = options.maxOutputTokens;
  const defaultMaxSteps = stateWorkspace ? 100 : 5;
  stateMaxSteps = options.maxSteps ?? defaultMaxSteps;
  const stateMaxRetries: number = options.maxRetries ?? DEFAULT_LLM_MAX_RETRIES;
  const stateStopWhen: StopWhen | undefined = options.stopWhen;
  const statePrepareStep: PrepareStep | undefined = options.prepareStep;
  const stateMarkdown: boolean = options.markdown ?? false;
  const stateInheritParentSpan: boolean = options.inheritParentSpan ?? true;
  const stateVoice: Voice | undefined = options.voice;
  const stateRetriever: BaseRetriever | undefined = options.retriever;
  const stateSupervisorConfig: SupervisorConfig | undefined = options.supervisorConfig;
  const stateContext: Map<string | symbol, unknown> | undefined = toContextMap(options.context);
  const stateVoltOpsClient: VoltOpsClient | undefined = options.voltOpsClient;
  const stateEvalConfig: AgentEvalConfig | undefined = options.eval;
  const stateFeedbackOptions: AgentFeedbackOptions | boolean | undefined = options.feedback;
  const stateInputGuardrails: NormalizedInputGuardrail[] = normalizeInputGuardrailList(
    options.inputGuardrails || [],
  );
  const stateOutputGuardrails: NormalizedOutputGuardrail[] = normalizeOutputGuardrailList(
    options.outputGuardrails || [],
  );
  const stateInputMiddlewares: NormalizedInputMiddleware[] = normalizeInputMiddlewareList(
    options.inputMiddlewares || [],
  );
  const stateOutputMiddlewares: NormalizedOutputMiddleware[] = normalizeOutputMiddlewareList(
    options.outputMiddlewares || [],
  );
  const stateMaxMiddlewareRetries: number = options.maxMiddlewareRetries ?? 0;
  stateToolRoutingConfigured = options.toolRouting !== undefined;
  stateToolRouting = options.toolRouting ?? AgentRegistry.getInstance().getGlobalToolRouting();

  // Initialize logger - always use LoggerProxy for consistency
  // If external logger is provided, it will be used by LoggerProxy
  const stateLogger: Logger = new LoggerProxy(
    {
      component: "agent",
      agentId: stateId,
      modelName: runtimeAgent.getModelName(),
    },
    options.logger,
  );

  // Allow standalone Agent usage (without VoltAgent wrapper) to initialize
  // remote observability processors that depend on the global VoltOps client.
  if (stateVoltOpsClient && !AgentRegistry.getInstance().getGlobalVoltOpsClient()) {
    AgentRegistry.getInstance().setGlobalVoltOpsClient(stateVoltOpsClient);
  }

  // Log agent creation
  stateLogger.debug(`Agent created: ${stateName}`, {
    event: LogEvents.AGENT_CREATED,
    agentId: stateId,
    model: runtimeAgent.getModelName(),
    hasTools: !!options.tools,
    hasMemory: options.memory !== false,
    hasSubAgents: !!(options.subAgents && options.subAgents.length > 0),
  });

  // Store Memory
  const stateMemoryConfigured: boolean = options.memory !== undefined;
  const stateMemory: Memory | false | undefined = options.memory;
  const stateSummarization: AgentSummarizationOptions | false | undefined = options.summarization;
  const stateConversationPersistenceConfigured: boolean =
    options.conversationPersistence !== undefined;
  stateConversationPersistence = agentNormalizeConversationPersistenceOptions(
    options.conversationPersistence,
  );
  const stateMessageMetadataPersistence: ResolvedMessageMetadataPersistenceOptions =
    agentNormalizeMessageMetadataPersistenceOptions(options.messageMetadataPersistence);
  // workspace resolved above to set default maxSteps

  // Initialize memory manager
  const resolvedMemory = stateMemoryConfigured
    ? options.memory
    : AgentRegistry.getInstance().getGlobalAgentMemory();
  const titleGenerator = agentCreateConversationTitleGenerator(
    resolvedMemory instanceof Memory ? resolvedMemory : undefined,
  );
  const stateMemoryManager: MemoryManager = new MemoryManager(
    stateId,
    resolvedMemory,
    {},
    stateLogger,
    titleGenerator,
  );

  const workspaceToolkits = buildWorkspaceToolkits(stateWorkspace, options.workspaceToolkits);

  // Initialize tool manager with static tools
  const staticTools = typeof options.tools === "function" ? undefined : options.tools;
  const stateToolManager: ToolManager = new ToolManager([], stateLogger);
  addAgentToolInputToManager(stateToolManager, staticTools);
  if (options.toolkits) {
    stateToolManager.addItems(options.toolkits);
  }
  if (workspaceToolkits.length > 0) {
    stateToolManager.addItems(workspaceToolkits);
  }
  const stateToolPoolManager: ToolManager = new ToolManager([], stateLogger);
  agentApplyToolRoutingConfig(stateToolRouting);

  // Initialize sub-agent manager
  const stateSubAgentManager: SubAgentManager = new SubAgentManager(
    stateName,
    options.subAgents || [],
    stateSupervisorConfig,
  );

  // Initialize prompts helper with local prompts and VoltOps clients
  const statePrompts: PromptHelper | undefined = VoltOpsClientClass.createPromptHelperFromSources(
    stateId,
    stateVoltOpsClient,
  );

  return runtimeAgent;
}
