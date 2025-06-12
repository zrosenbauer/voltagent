import type { ToolErrorInfo, VoltAgentError } from "@voltagent/core";
import { tool } from "ai";

/**
 * Convert VoltAgent tools to Vercel AI SDK format
 * @param tools Array of agent tools
 * @returns Object mapping tool names to their SDK implementations or undefined if no tools
 */
export const convertToolsForSDK = (tools: any[]): Record<string, any> | undefined => {
  if (!tools || tools.length === 0) {
    return undefined;
  }

  const toolsMap: Record<string, any> = {};

  for (const agentTool of tools) {
    // Wrap the tool with Vercel AI SDK's tool helper
    const sdkTool = tool({
      description: agentTool.description,
      parameters: agentTool.parameters,
      execute: agentTool.execute,
    });

    toolsMap[agentTool.name] = sdkTool;
  }

  return toolsMap;
};

/**
 * Creates a standardized VoltAgentError from a raw Vercel SDK error object.
 */
export function createVoltagentErrorFromSdkError(
  sdkError: any, // The raw error object from the SDK
  errorStage:
    | "llm_stream"
    | "object_stream"
    | "llm_generate"
    | "object_generate"
    | "tool_execution" = "llm_stream",
): VoltAgentError {
  const originalError = sdkError.error ?? sdkError; // Handle potential nesting
  let voltagentErr: VoltAgentError;

  const potentialToolCallId = (originalError as any)?.toolCallId;
  const potentialToolName = (originalError as any)?.toolName;

  if (potentialToolCallId && potentialToolName) {
    const toolErrorDetails: ToolErrorInfo = {
      toolCallId: potentialToolCallId,
      toolName: potentialToolName,
      toolArguments: (originalError as any)?.args,
      toolExecutionError: originalError,
    };
    voltagentErr = {
      message: `Error during Vercel SDK operation (tool '${potentialToolName}'): ${originalError instanceof Error ? originalError.message : "Unknown tool error"}`,
      originalError: originalError,
      toolError: toolErrorDetails,
      stage: "tool_execution",
      code: (originalError as any)?.code,
    };
  } else {
    voltagentErr = {
      message:
        originalError instanceof Error
          ? originalError.message
          : `An unknown error occurred during Vercel AI operation (stage: ${errorStage})`,
      originalError: originalError,
      toolError: undefined,
      stage: errorStage,
      code: (originalError as any)?.code,
    };
  }
  // Return the created error instead of calling callback
  return voltagentErr;
}
