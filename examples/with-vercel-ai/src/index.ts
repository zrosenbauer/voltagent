import { Agent, type InferGenerateTextProviderOptions, VoltAgent } from "@voltagent/core";
import { VercelAIProvider } from "@voltagent/vercel-ai";

import { openai } from "@ai-sdk/openai";

const agent = new Agent({
  name: "Asistant",
  description: "A helpful assistant that answers questions without using tools",
  llm: new VercelAIProvider(),
  model: openai("gpt-4o-mini"),
});

const x = agent.generateText([], {
  provider: {
    temperature: 0.5,
  } as InferGenerateTextProviderOptions<typeof agent.llm>,
});

new VoltAgent({
  agents: {
    agent,
  },
});
