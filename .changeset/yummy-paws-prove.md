---
"@voltagent/core": patch
---

feat: Allow passing arbitrary provider-specific options via the `provider` object in agent generation methods (`generateText`, `streamText`, etc.).

Added an index signature `[key: string]: unknown;` to the `ProviderOptions` type (`voltagent/packages/core/src/agent/types.ts`). This allows users to pass any provider-specific parameters directly through the `provider` object, enhancing flexibility and enabling the use of features not covered by the standard options.

Example using a Vercel AI SDK option:

```typescript
import { Agent } from "@voltagent/core";
import { VercelProvider } from "@voltagent/vercel-ai";
import { openai } from "@ai-sdk/openai";

const agent = new Agent({
  name: "Example Agent",
  llm: new VercelProvider(),
  model: openai("gpt-4o-mini"),
});

await agent.streamText("Tell me a joke", {
  provider: {
    // Standard options can still be used
    temperature: 0.7,
    // Provider-specific options are now allowed by the type
    experimental_activeTools: ["tool1", "tool2"],
    anotherProviderOption: "someValue",
  },
});
```
