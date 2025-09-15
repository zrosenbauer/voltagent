import type { ToolErrorInfo } from "./types";

export type VoltAgentErrorOptions = {
  originalError?: unknown;
  code?: string;
  metadata?: Record<string, unknown>;
  stage?: string;
  toolError?: ToolErrorInfo;
};

/**
 * Creates a VoltAgentError.
 * @param message - The error message.
 * @param options - The error options.
 * @returns
 */
export function createVoltAgentError(
  message: string,
  options?: VoltAgentErrorOptions,
): VoltAgentError {
  return new VoltAgentError(message, options);
}

/**
 * Creates a VoltAgentError from an error object.
 * @param error - The error object.
 * @param options - The error options.
 * @returns
 */
export function createVoltAgentErrorFromError(
  error: Error,
  options?: Omit<VoltAgentErrorOptions, "originalError">,
): VoltAgentError {
  return new VoltAgentError(error.message, {
    originalError: error,
    ...options,
  });
}

/**
 * Type guard to check if an error is an AbortError
 */
export function isAbortError(error: unknown): error is AbortError {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Type guard to check if an error is a VoltAgentError
 */
export function isVoltAgentError(error: unknown): error is VoltAgentError {
  return error !== null && typeof error === "object" && "message" in error && !isAbortError(error);
}

/**
 * Error thrown when an operation is aborted via AbortController
 */
export interface AbortError extends Error {
  name: "AbortError";
  /** The reason passed to abort() method */
  reason?: unknown;
}

export class VoltAgentError extends Error {
  name: "VoltAgentError";

  /**
   * The original error object thrown by the provider or underlying system (if available).
   */
  originalError?: unknown;

  /**
   * Optional error code or identifier from the provider.
   */
  code?: string | number;

  /**
   * Additional metadata related to the error (e.g., retry info, request ID).
   */
  metadata?: Record<string, any>;

  /**
   * Information about the step or stage where the error occurred (optional, e.g., 'llm_request', 'tool_execution', 'response_parsing').
   */
  stage?: string;

  /**
   * If the error occurred during tool execution, this field contains the relevant details. Otherwise, it's undefined.
   */
  toolError?: ToolErrorInfo;

  constructor(message: string, options?: VoltAgentErrorOptions) {
    super(message);
    this.name = "VoltAgentError";
    this.originalError = options?.originalError;
    this.code = options?.code;
    this.metadata = options?.metadata;
    this.stage = options?.stage;
    this.toolError = options?.toolError;
  }
}
