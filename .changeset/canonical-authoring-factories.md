---
"@voltagent/core": major
"@voltagent/scorers": patch
---

Replace constructor-based authoring with factories. `Agent`, `PlanAgent`, and `VoltAgent` are type-only exports. Agents own their state in closures, support detached methods, and compose without class inheritance.

```ts
import { defineAgent, defineTool, voltagent } from "@voltagent/core";
import { z } from "zod";

const greet = defineTool({
  description: "Greet someone",
  inputSchema: z.object({ name: z.string() }),
  execute: ({ name }) => `Hello, ${name}`,
});

const assistant = defineAgent({
  name: "assistant",
  instructions: "Help the user",
  model: "openai/gpt-4o-mini",
  tools: { greet },
});

const app = voltagent({ agents: { assistant } });
const result = await assistant.generateText({ prompt: "Greet Zac" });
```

Use `definePlanAgent(options)` for planning agents and `defineWorkflow(options, ...steps)` for workflows. The old `tool` and `createWorkflow` exports are removed. The default export is `voltagent`. Built-in scorers use `defineAgent`.
