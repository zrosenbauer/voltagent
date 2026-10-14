import { Memory, defineAgent, voltagent } from "@voltagent/core";
import { LibSQLMemoryAdapter } from "@voltagent/libsql";
import { createPinoLogger } from "@voltagent/logger";
import { honoServer } from "@voltagent/server-hono";

const logger = createPinoLogger({
  name: "with-retries-fallback",
  level: "info",
});

const memory = new Memory({
  storage: new LibSQLMemoryAdapter(),
});

const agent = defineAgent({
  name: "RetriesFallbackAgent",
  instructions: "Answer support questions with short, direct replies.",
  model: "openai/gpt-4o-mini",
  maxRetries: 1,
  memory,
});

await voltagent({
  agents: { agent },
  server: honoServer(),
  logger,
}).ready();
