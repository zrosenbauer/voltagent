import { Memory, defineAgent, voltagent } from "@voltagent/core";
import { LibSQLMemoryAdapter } from "@voltagent/libsql";
import { createPinoLogger } from "@voltagent/logger";
import { honoServer } from "@voltagent/server-hono";

// Create logger
const logger = createPinoLogger({
  name: "with-groq-ai",
  level: "info",
});

const agent = defineAgent({
  name: "Assistant",
  instructions: "A helpful assistant that answers questions",
  model: "groq/meta-llama/llama-4-scout-17b-16e-instruct",
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
