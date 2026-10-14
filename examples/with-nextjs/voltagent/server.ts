import { voltagent } from "@voltagent/core";
import { honoServer } from "@voltagent/server-hono";
import { storyWriterAgent, supervisorAgent, uppercaseAgent, wordCountAgent } from "./agents";

await voltagent({
  agents: {
    supervisorAgent,
    storyWriterAgent,
    wordCountAgent,
    uppercaseAgent,
  },
  server: honoServer(),
}).ready();
