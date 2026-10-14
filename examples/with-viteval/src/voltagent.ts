import { VoltOpsClient, voltagent as bootstrapVoltagent } from "@voltagent/core";
import { honoServer } from "@voltagent/server-hono";

import { cleanEnv, str } from "envalid";
import { generalAgent } from "./agents/general.js";
import { geographyAgent } from "./agents/geography.js";
import { historyAgent } from "./agents/history.js";
import { mathAgent } from "./agents/math.js";
import { scienceAgent } from "./agents/science.js";
import { supervisorAgent } from "./agents/supervisor.js";

const env = cleanEnv(process.env, {
  VOLTAGENT_PUBLIC_KEY: str(),
  VOLTAGENT_SECRET_KEY: str(),
});

export const voltagent = bootstrapVoltagent({
  agents: {
    supervisor: supervisorAgent,
    general: generalAgent,
    math: mathAgent,
    geography: geographyAgent,
    history: historyAgent,
    science: scienceAgent,
  },
  voltOpsClient: new VoltOpsClient({
    publicKey: env.VOLTAGENT_PUBLIC_KEY,
    secretKey: env.VOLTAGENT_SECRET_KEY,
  }),
  server: honoServer(),
});
await voltagent.ready();
