import {
  InMemoryVectorAdapter,
  Memory,
  VoltAgentObservability,
  defineAgent,
  defineTool,
  voltagent,
} from "@voltagent/core";
import { LibSQLMemoryAdapter, LibSQLObservabilityAdapter } from "@voltagent/libsql";
import { createPinoLogger } from "@voltagent/logger";
import { honoServer } from "@voltagent/server-hono";
import { z } from "zod";

// Create logger
const logger = createPinoLogger({
  name: "with-subagents",
  level: "info",
});

const memory = new Memory({
  storage: new LibSQLMemoryAdapter(),
  embedding: "openai/text-embedding-3-small",
  vector: new InMemoryVectorAdapter(),
});

const uppercaseTool = defineTool({
  description: "Converts text to uppercase",
  inputSchema: z.object({
    text: z.string().describe("The text to convert to uppercase"),
  }),
  execute: async ({ text }) => {
    return { result: text.toUpperCase() };
  },
});

// Create two simple specialized subagents
const contentCreatorAgent = defineAgent({
  name: "ContentCreator",
  purpose: "Drafts short content",
  instructions: "Creates short text content on requested topics",
  model: "openai/gpt-4o-mini",
  memory,
});

const formatterAgent = defineAgent({
  name: "Formatter",
  purpose: "Cleans and formats text",
  instructions: "Formats and styles text content",
  model: "openai/gpt-4o-mini",
  tools: {
    uppercase: uppercaseTool,
  },
  memory,
});

// Create a simple supervisor agent
const supervisorAgent = defineAgent({
  name: "Supervisor",
  instructions: "Coordinates between content creation and formatting agents",
  model: "openai/gpt-4o-mini",
  memory,
  subAgents: [contentCreatorAgent, formatterAgent],
  supervisorConfig: {
    fullStreamEventForwarding: {
      types: ["tool-call", "tool-result", "text-delta"],
    },
  },
});

// Create VoltAgent with the new server provider pattern
await voltagent({
  agents: {
    supervisorAgent,
    formatterAgent,
    contentCreatorAgent,
  },
  logger,
  // Use the new honoServer factory with configuration
  server: honoServer(),
  observability: new VoltAgentObservability({
    storage: new LibSQLObservabilityAdapter(),
  }),
}).ready();
