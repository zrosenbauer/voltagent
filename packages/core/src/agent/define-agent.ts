import type { ToolSet } from "ai";
import { Agent } from "./agent";
import type { AgentContextSchema } from "./context";
import type { AgentOptions } from "./types";

export type DefineAgentOptions<
  TOOLS extends ToolSet = ToolSet,
  CONTEXT_SCHEMA extends AgentContextSchema = AgentContextSchema,
> = AgentOptions<TOOLS, CONTEXT_SCHEMA>;

export type DefinedAgent<
  TOOLS extends ToolSet = ToolSet,
  CONTEXT_SCHEMA extends AgentContextSchema = AgentContextSchema,
> = Agent<TOOLS, CONTEXT_SCHEMA>;

/**
 * Defines an agent using the existing VoltAgent runtime and configuration.
 * @param options - Agent identity, model, tools, and runtime configuration.
 * @returns An Agent with the existing generation, streaming, and orchestration APIs.
 * @example
 * const agent = defineAgent({ name: "assistant", model, instructions: "Help the user" });
 * const result = await agent.generateText({ prompt: "Hello" });
 */
export function defineAgent<
  TOOLS extends ToolSet = ToolSet,
  CONTEXT_SCHEMA extends AgentContextSchema = AgentContextSchema,
>(options: DefineAgentOptions<TOOLS, CONTEXT_SCHEMA>): DefinedAgent<TOOLS, CONTEXT_SCHEMA> {
  return new Agent<TOOLS, CONTEXT_SCHEMA>(options);
}
