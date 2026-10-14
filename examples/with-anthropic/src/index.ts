import { Memory, defineAgent, defineTool, voltagent } from "@voltagent/core";
import { LibSQLMemoryAdapter } from "@voltagent/libsql";
import { createPinoLogger } from "@voltagent/logger";
import { honoServer } from "@voltagent/server-hono";
import { z } from "zod";

// Create logger
const logger = createPinoLogger({
  name: "with-anthropic",
  level: "info",
});

const weatherTool = defineTool({
  description: "Get the current weather in a location",
  // Use Zod schema instead of JSON Schema
  inputSchema: z.object({
    location: z.string().describe("The location to get weather for"),
  }),
  execute: async (input) => {
    return {
      location: input.location,
    };
  },
});

const agent = defineAgent({
  name: "weather-agent",
  instructions:
    "A helpful assistant that can search the web and get weather information. This agent is specifically designed to test the VoltAgent tool_result bug with MCP tools.",
  model: "anthropic/claude-opus-4-1",
  tools: {
    get_current_weather: weatherTool,
  },
});

await voltagent({
  agents: {
    agent,
  },
  logger,
  server: honoServer({ port: 3141 }),
}).ready();
