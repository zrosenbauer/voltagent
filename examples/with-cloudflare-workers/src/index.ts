import { defineAgent, voltagent } from "@voltagent/core";
import { serverlessHono } from "@voltagent/serverless-hono";

import { weatherTool } from "./tools";

const assistant = defineAgent({
  name: "serverless-assistant",
  instructions: "You are a helpful assistant.",
  model: "openai/gpt-4o-mini",
  tools: {
    getWeather: weatherTool,
  },
});

const voltAgent = voltagent({
  agents: { assistant },
  serverless: serverlessHono(),
});
await voltAgent.ready();

export default voltAgent.serverless().toCloudflareWorker();
