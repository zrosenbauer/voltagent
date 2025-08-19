import { openai } from "@ai-sdk/openai";
import { Agent, VoltAgent } from "@voltagent/core";
import { createPinoLogger } from "@voltagent/logger";
import { VercelAIProvider } from "@voltagent/vercel-ai";

const agent = new Agent({
  name: "<%= name %> Agent",
  description: "<%= description %>",
  llm: new VercelAIProvider(),
  model: openai("gpt-4o-mini"),
});

// Create logger
const logger = createPinoLogger({
  name: "<%= name %>",
  level: "info",
});

new VoltAgent({
  agents: {
    agent,
  },
  logger,
});
