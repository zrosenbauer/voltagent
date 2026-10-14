import { Memory, defineAgent, voltagent } from "@voltagent/core";
import { LibSQLMemoryAdapter } from "@voltagent/libsql";
import { createPinoLogger } from "@voltagent/logger";
import { honoServer } from "@voltagent/server-hono";

// Create logger
const logger = createPinoLogger({
  name: "with-google-ai",
  level: "info",
});

const agent = defineAgent({
  name: "Google Assistant",
  instructions: "A helpful assistant powered by Google Gemini",
  model: "google/gemini-2.0-flash",
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
