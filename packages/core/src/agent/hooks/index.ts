import type { AgentTool } from "../../tool";
import type { Agent } from "../index";

/**
 * Type definition for agent hooks
 */
export type AgentHooks = {
  /**
   * Called before the agent is invoked
   * @param agent The agent being invoked
   */
  onStart?: (agent: Agent<any>) => Promise<void> | void;

  /**
   * Called when the agent produces a final output
   * @param agent The agent that produced the output
   * @param output The output produced by the agent
   */
  onEnd?: (agent: Agent<any>, output: any) => Promise<void> | void;

  /**
   * Called when the agent is being handed off to
   * @param agent The agent being handed off to
   * @param source The agent that is handing off
   */
  onHandoff?: (agent: Agent<any>, source: Agent<any>) => Promise<void> | void;

  /**
   * Called before a tool is invoked
   * @param agent The agent invoking the tool
   * @param tool The tool being invoked
   */
  onToolStart?: (agent: Agent<any>, tool: AgentTool) => Promise<void> | void;

  /**
   * Called after a tool is invoked
   * @param agent The agent that invoked the tool
   * @param tool The tool that was invoked
   * @param result The result of the tool invocation
   */
  onToolEnd?: (agent: Agent<any>, tool: AgentTool, result: any) => Promise<void> | void;
};

/**
 * Default empty implementation of hook methods
 */
const defaultHooks = {
  onStart: async () => {},
  onEnd: async () => {},
  onHandoff: async () => {},
  onToolStart: async () => {},
  onToolEnd: async () => {},
};

/**
 * Create hooks from an object literal
 * @param hooks Object with hook methods
 * @returns A complete hooks object
 */
export function createHooks(hooks: Partial<AgentHooks> = {}): AgentHooks {
  return {
    onStart: hooks.onStart || defaultHooks.onStart,
    onEnd: hooks.onEnd || defaultHooks.onEnd,
    onHandoff: hooks.onHandoff || defaultHooks.onHandoff,
    onToolStart: hooks.onToolStart || defaultHooks.onToolStart,
    onToolEnd: hooks.onToolEnd || defaultHooks.onToolEnd,
  };
}
