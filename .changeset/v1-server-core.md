---
"@voltagent/server-core": major
---

# Server Core 1.x — typed routes, schemas, utilities

Server functionality lives outside core. Use `@voltagent/server-core` types/schemas with `@voltagent/server-hono`.

Full migration guide: [Migration Guide](https://voltagent.dev/docs/getting-started/migration-guide/)

## Example: extend the app

```ts
import { VoltAgent } from "@voltagent/core";
import { honoServer } from "@voltagent/server-hono";
import { AgentRoutes } from "@voltagent/server-core"; // typed route defs (optional)

new VoltAgent({
  agents: { agent },
  server: honoServer({
    configureApp: (app) => {
      // Add custom endpoints alongside the built‑ins
      app.get("/api/health", (c) => c.json({ status: "ok" }));
    },
  }),
});
```
