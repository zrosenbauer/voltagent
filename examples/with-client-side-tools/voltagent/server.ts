import { voltagent } from "@voltagent/core";
import { honoServer } from "@voltagent/server-hono";
import { agent } from "./agents";

await voltagent({
  agents: {
    agent,
  },
  server: honoServer(),
}).ready();
