import type { ToolSet } from "ai";
import type { Agent } from "./agent";
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

export { defineAgent } from "./agent";
