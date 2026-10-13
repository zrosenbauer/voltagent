import { Agent, Memory, VoltAgent, tool } from "@voltagent/core";
import { LibSQLMemoryAdapter } from "@voltagent/libsql";
import { createPinoLogger } from "@voltagent/logger";
import { honoServer } from "@voltagent/server-hono";
import type { ToolSet } from "ai";
import { z } from "zod";

const greetingTool = tool({
  description: "Get a personalized greeting",
  inputSchema: z.object({
    name: z.string().describe("Person's name"),
  }),
  execute: async ({ name }) => {
    return `Hello ${name}! Nice to meet you!`;
  },
});

// Admin-only tool
const adminTool = tool({
  description: "Perform admin actions (admin only)",
  inputSchema: z.object({
    action: z.string().describe("Action to perform"),
  }),
  execute: async ({ action }) => {
    return `Admin action performed: ${action}`;
  },
});

// Create logger
const logger = createPinoLogger({
  name: "with-dynamic-parameters",
  level: "info",
});

const dynamicAgent = new Agent({
  name: "Simple Dynamic Agent",
  contextSchema: z.object({
    role: z.enum(["user", "admin"]).default("user"),
    language: z.enum(["tr", "en"]).default("en"),
    tier: z.enum(["free", "premium"]).default("free"),
  }),
  instructions: ({ context }) => {
    const role = context.get("role") ?? "user";
    const language = context.get("language") ?? "en";

    if (role === "admin") {
      return `You are an admin assistant. Respond in ${language}. You have special privileges.`;
    }
    return `You are a helpful assistant. Respond in ${language}. You help with basic questions.`;
  },
  model: ({ context }) => {
    const tier = context.get("tier") ?? "free";
    if (tier === "premium") {
      return "openai/gpt-4o-mini";
    }
    return "openai/gpt-3.5-turbo";
  },
  tools: ({ context }): ToolSet => {
    const role = context.get("role") ?? "user";
    if (role === "admin") {
      return {
        admin_action: adminTool,
      };
    }
    return {
      get_greeting: greetingTool,
    };
  },
  memory: new Memory({
    storage: new LibSQLMemoryAdapter({
      url: "file:./.voltagent/memory.db",
    }),
  }),
});

new VoltAgent({
  agents: {
    dynamicAgent,
  },
  logger,
  server: honoServer({ port: 3141 }),
});
