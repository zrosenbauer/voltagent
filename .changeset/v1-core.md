---
"@voltagent/core": major
---

# Core 1.x — AI SDK native, Memory V2, pluggable server

Breaking but simple to migrate. Key changes and copy‑paste examples below.

Full migration guide: [Migration Guide](https://voltagent.dev/docs/getting-started/migration-guide/)

## Agent: remove `llm`, use ai‑sdk model directly

Before (0.1.x):

```ts
import { Agent } from "@voltagent/core";
import { VercelAIProvider } from "@voltagent/vercel-ai";
import { openai } from "@ai-sdk/openai";

const agent = new Agent({
  name: "app",
  instructions: "Helpful",
  llm: new VercelAIProvider(),
  model: openai("gpt-4o-mini"),
});
```

After (1.x):

```ts
import { Agent } from "@voltagent/core";
import { openai } from "@ai-sdk/openai";

const agent = new Agent({
  name: "app",
  instructions: "Helpful",
  model: openai("gpt-4o-mini"), // ai-sdk native
});
```

Note: `@voltagent/core@1.x` has a peer dependency on `ai@^5`. Install `ai` and a provider like `@ai-sdk/openai`.

## Memory V2: use `Memory({ storage: <Adapter> })`

Before (0.1.x):

```ts
import { LibSQLStorage } from "@voltagent/libsql";

const agent = new Agent({
  // ...
  memory: new LibSQLStorage({ url: "file:./.voltagent/memory.db" }),
});
```

After (1.x):

```ts
import { Memory } from "@voltagent/core";
import { LibSQLMemoryAdapter } from "@voltagent/libsql";

const agent = new Agent({
  // ...
  memory: new Memory({
    storage: new LibSQLMemoryAdapter({ url: "file:./.voltagent/memory.db" }),
  }),
});
```

Default memory is in‑memory when omitted.

## Server: moved out of core → use `@voltagent/server-hono`

Before (0.1.x):

```ts
import { VoltAgent } from "@voltagent/core";

new VoltAgent({ agents: { agent }, port: 3141, enableSwaggerUI: true });
```

After (1.x):

```ts
import { VoltAgent } from "@voltagent/core";
import { honoServer } from "@voltagent/server-hono";

new VoltAgent({
  agents: { agent },
  server: honoServer({ port: 3141, enableSwaggerUI: true }),
});
```

## Abort: option renamed

```ts
// 0.1.x
await agent.generateText("...", { abortController: new AbortController() });

// 1.x
const ac = new AbortController();
await agent.generateText("...", { abortSignal: ac.signal });
```

## Observability: OTel‑based, zero code required

Set keys and run:

```bash
VOLTAGENT_PUBLIC_KEY=pk_... VOLTAGENT_SECRET_KEY=sk_...
```

Remote export auto‑enables when keys are present. Local Console streaming remains available.
