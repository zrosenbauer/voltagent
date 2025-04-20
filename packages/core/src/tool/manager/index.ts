import type { BaseTool, ToolExecuteOptions } from "../../agent/providers/base/types";
import { zodSchemaToJsonUI } from "../../utils/toolParser";
import type { AgentTool } from "../index";

/**
 * Status of a tool at any given time
 */
export type ToolStatus = "idle" | "working" | "error" | "completed";

/**
 * Tool status information
 */
export type ToolStatusInfo = {
  name: string;
  status: ToolStatus;
  result?: any;
  error?: any;
  input?: any;
  output?: any;
  timestamp: Date;
  parameters?: any; // Tool parameter schema
};

/**
 * Manager class to handle all tool-related operations
 */
export class ToolManager {
  /**
   * Tools that this manager manages
   */
  private tools: BaseTool[] = [];

  /**
   * Creates a new ToolManager
   */
  constructor(tools: AgentTool[] = []) {
    // Convert AgentTool[] to BaseTool[] and add them
    this.addTools(tools);
  }

  /**
   * Get all tools managed by this manager
   */
  getTools(): BaseTool[] {
    return [...this.tools]; // Return a copy to prevent direct modification
  }

  /**
   * Add a tool to the manager
   * If a tool with the same name already exists, it will be replaced
   * @returns true if the tool was successfully added or replaced
   */
  addTool(tool: AgentTool): boolean {
    if (!tool.execute) {
      throw new Error(`Tool ${tool.name} must have an execute function`);
    }

    const baseTool: BaseTool = {
      name: tool.name,
      description: tool.description || tool.name,
      parameters: tool.parameters,
      execute: tool.execute,
    };

    // Check if a tool with the same name already exists
    const existingIndex = this.tools.findIndex((t) => t.name === tool.name);

    if (existingIndex !== -1) {
      // Replace the existing tool
      this.tools[existingIndex] = baseTool;
    } else {
      // Add the new tool
      this.tools.push(baseTool);
    }

    return true;
  }

  /**
   * Add multiple tools to the manager
   * If a tool with the same name already exists, it will be replaced
   */
  addTools(tools: AgentTool[]): void {
    for (const tool of tools) {
      this.addTool(tool);
    }
  }

  /**
   * Remove a tool by name
   * @returns true if the tool was removed, false if it wasn't found
   */
  removeTool(toolName: string): boolean {
    const index = this.tools.findIndex((t) => t.name === toolName);
    if (index === -1) return false;

    this.tools.splice(index, 1);
    return true;
  }

  /**
   * Prepare tools for text generation
   */
  prepareToolsForGeneration(dynamicTools?: BaseTool[]): BaseTool[] {
    // Create a copy of tools to avoid modifying the original array
    let toolsToUse = [...this.tools];

    // Add dynamic tools if provided
    if (dynamicTools?.length) {
      toolsToUse = [...toolsToUse, ...dynamicTools];
    }

    return toolsToUse;
  }

  /**
   * Get agent's tools for API exposure
   */
  getToolsForApi() {
    return this.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: zodSchemaToJsonUI(tool.parameters),
    }));
  }

  /**
   * Has tool by name
   */
  hasTool(toolName: string): boolean {
    return this.tools.some((tool) => tool.name === toolName);
  }

  /**
   * Get tool by name
   * @param toolName The name of the tool to get
   * @returns The tool or undefined if not found
   */
  getToolByName(toolName: string): BaseTool | undefined {
    return this.tools.find((tool) => tool.name === toolName);
  }

  /**
   * Execute a tool by name
   * @param toolName The name of the tool to execute
   * @param args The arguments to pass to the tool
   * @param signal Optional AbortSignal to abort the execution
   * @returns The result of the tool execution
   * @throws Error if the tool doesn't exist or fails to execute
   */
  async executeTool(toolName: string, args: any, options?: ToolExecuteOptions): Promise<any> {
    const tool = this.getToolByName(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    try {
      return await tool.execute(args, options);
    } catch (error) {
      throw new Error(`Failed to execute tool ${toolName}: ${error}`);
    }
  }
}
