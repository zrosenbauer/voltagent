import { type VoltAgent, defineAgent, voltagent } from "@voltagent/core";
import { serverlessHono } from "@voltagent/serverless-hono";
import { weatherTool } from "./tools";

const agent = defineAgent({
  name: "netlify-function-agent",
  instructions: "Help the user quickly and call tools when needed.",
  model: "openai/gpt-4o-mini",
  tools: {
    getWeather: weatherTool,
  },
});

const voltAgent = voltagent({
  agents: { agent },
  serverless: serverlessHono(),
});
await voltAgent.ready();

export function getVoltAgent(): VoltAgent {
  return voltAgent;
}
