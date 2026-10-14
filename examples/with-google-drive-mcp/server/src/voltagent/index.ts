import { Memory, defineAgent, voltagent } from "@voltagent/core";
import { LibSQLMemoryAdapter } from "@voltagent/libsql";
import { createPinoLogger } from "@voltagent/logger";
import { honoServer } from "@voltagent/server-hono";

// Create logger
const logger = createPinoLogger({
  name: "google-drive-mcp-server",
  level: "info",
});

export const agent = defineAgent({
  name: "Base Agent",
  instructions: "You are a helpful assistant that can search Google Drive.",
  model: "openai/gpt-4o-mini",
  markdown: true,
  memory: new Memory({
    storage: new LibSQLMemoryAdapter({
      url: "file:./.voltagent/memory.db",
    }),
  }),
});

await voltagent({
  agents: {
    agent,
  },
  logger,
  server: honoServer({ port: 3141 }),
}).ready();
