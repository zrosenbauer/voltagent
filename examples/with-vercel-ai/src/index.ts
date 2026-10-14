import { Memory, defineAgent, voltagent } from "@voltagent/core";
import { LibSQLMemoryAdapter } from "@voltagent/libsql";
import { createPinoLogger } from "@voltagent/logger";
import { honoServer } from "@voltagent/server-hono";

// Create logger
const logger = createPinoLogger({
  name: "with-vercel-ai",
  level: "info",
});

const agent = defineAgent({
  name: "Asistant",
  instructions: "A helpful assistant that answers questions without using tools",
  model: "openai/gpt-4o-mini",
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
