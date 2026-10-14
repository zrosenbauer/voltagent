---
title: VoltAgent Instance
sidebar_label: VoltAgent Instance
---

# VoltAgent Instance

`voltagent()` configures the application without starting resources. Call `await app.ready()` to initialize workspaces, telemetry, transports, and the configured HTTP or serverless provider. This also applies to applications without a server. Startup errors reject the readiness promise and clean up initialized resources. Call `await app.shutdown()` to stop resources and flush telemetry. Both methods are idempotent; a stopped application cannot restart. Import `VoltAgent` as a type when you need an explicit runtime annotation.

## Basic Setup

```ts
import { defineAgent, voltagent } from "@voltagent/core";
import { honoServer } from "@voltagent/server-hono";

const assistant = defineAgent({
  name: "Assistant",
  instructions: "Help users get answers fast.",
  model: "openai/gpt-4o-mini",
});

await voltagent({
  agents: { assistant },
  server: honoServer({ port: 3141 }),
}).ready();
```

## What VoltAgent Manages

- Registers agents and workflows for API access and observability.
- Applies global defaults (logger, observability, memory, conversation persistence).
- Boots HTTP or serverless providers.
- Registers triggers, MCP servers, and A2A servers.
- Coordinates graceful shutdown for servers and telemetry.

## Registering Agents and Workflows

You can register instances on startup or later at runtime.

```ts
import { voltagent } from "@voltagent/core";

const app = voltagent({
  agents: { assistant },
  workflows: { onboardingWorkflow },
});
await app.ready();

app.registerAgent(anotherAgent);
app.registerWorkflow(anotherWorkflow);
```

To register triggers at runtime:

```ts
app.registerTriggers(triggers);
```

## Memory Defaults

Set default memory once at the VoltAgent entrypoint. Defaults apply only when an agent or workflow does not specify `memory`. Omitting `memory` does not disable it; it still resolves to configured defaults (or built-in in-memory). An explicit `memory: false` on an agent disables memory entirely.

```ts
import { Memory, voltagent } from "@voltagent/core";
import { LibSQLMemoryAdapter } from "@voltagent/libsql";

const agentMemory = new Memory({
  storage: new LibSQLMemoryAdapter({ url: "file:./.voltagent/agent.db" }),
});

const workflowMemory = new Memory({
  storage: new LibSQLMemoryAdapter({ url: "file:./.voltagent/workflows.db" }),
});

await voltagent({
  agentMemory,
  workflowMemory,
  // memory: sharedFallbackMemory,
}).ready();
```

**Precedence**

- Agents: agent `memory` > `agentMemory` > `memory` > built-in in-memory
- Workflows: workflow `memory` > `workflowMemory` > `memory` > built-in in-memory

See [Memory Overview](/docs/agents/memory/overview) for adapter options.

## Conversation Persistence Defaults

Set a default persistence strategy for agents that do not explicitly define `conversationPersistence`.

```ts
await voltagent({
  agents: { assistant },
  agentConversationPersistence: {
    mode: "step", // default
    debounceMs: 200, // default
    flushOnToolResult: true, // default
  },
}).ready();
```

**Precedence**

- Per-call `options.memory.options.conversationPersistence` (preferred)
- Per-call `options.conversationPersistence` (deprecated)
- Agent `conversationPersistence`
- VoltAgent `agentConversationPersistence`
- Built-in defaults (`mode: "step"`, `debounceMs: 200`, `flushOnToolResult: true`)

## Observability and Logging

VoltAgent creates an OpenTelemetry-based observability instance by default. You can provide your own instance or logger if you want full control.

```ts
import { voltagent, VoltAgentObservability } from "@voltagent/core";

const observability = new VoltAgentObservability({
  serviceName: "my-voltagent-app",
});

await voltagent({
  agents: { assistant },
  observability,
}).ready();
```

See [Observability Overview](/docs/observability/overview) and [Logging](/docs/observability/logging) for details.

If you already have a `VoltOpsClient` or a custom logger, pass them once and VoltAgent shares them across agents and workflows.

```ts
await voltagent({
  agents: { assistant },
  voltOpsClient,
  logger,
}).ready();
```

## Server and Serverless Providers

Use `server` to expose HTTP endpoints, or `serverless` for fetch-based runtimes.

```ts
import { honoServer } from "@voltagent/server-hono";

const app = voltagent({
  agents: { assistant },
  server: honoServer({ port: 3141, enableSwaggerUI: true }),
});
await app.ready();
```

See [API Overview](/docs/api/overview) for the full endpoint list.

For HTTP servers, use `startServer()` and `stopServer()` if you need manual control:

```ts
await app.startServer();
await app.stopServer();
```

You can read the server instance directly:

```ts
const serverInstance = app.getServerInstance();
```

If you are using a serverless provider, you can access it with `serverless()`:

```ts
import { serverlessHono } from "@voltagent/serverless-hono";

const serverlessApp = voltagent({
  agents: { assistant },
  serverless: serverlessHono(),
});
await serverlessApp.ready();

const serverlessProvider = serverlessApp.serverless();
```

## Triggers and Protocol Servers

VoltAgent can register triggers and protocol servers alongside your agents.

```ts
await voltagent({
  agents: { assistant },
  triggers,
  mcpServers,
  a2aServers,
}).ready();
```

See [Triggers](/docs/triggers) and [MCP](/docs/agents/mcp) for setup details.
For A2A servers, see [A2A Server](/docs/agents/a2a/a2a-server).

## Runtime Accessors and Shutdown

VoltAgent exposes accessors for registered components and a graceful shutdown helper.

```ts
const agents = app.getAgents();
const workflows = app.getWorkflows();
const observability = app.getObservability();

await app.shutdown();
```

## Dependency Update Checks

`checkDependencies` controls a background dependency update check intended for Node runtimes. It is skipped in serverless or edge environments, and the current core implementation is a no-op placeholder.

```ts
await voltagent({
  agents: { assistant },
  checkDependencies: false,
}).ready();
```
