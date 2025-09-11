---
"@voltagent/server-hono": major
---

# Server Hono 1.x — pluggable HTTP server

Core no longer embeds an HTTP server. Use the Hono provider.

Full migration guide: [Migration Guide](https://voltagent.dev/docs/getting-started/migration-guide/)

## Basic setup

```ts
import { VoltAgent } from "@voltagent/core";
import { honoServer } from "@voltagent/server-hono";

new VoltAgent({
  agents: { agent },
  server: honoServer({ port: 3141, enableSwaggerUI: true }),
});
```

## Custom routes and auth

```ts
import { honoServer, jwtAuth } from "@voltagent/server-hono";

new VoltAgent({
  agents: { agent },
  server: honoServer({
    configureApp: (app) => {
      app.get("/api/health", (c) => c.json({ status: "ok" }));
    },
    auth: jwtAuth({
      secret: process.env.JWT_SECRET!,
      publicRoutes: ["/health", "/metrics"],
    }),
  }),
});
```
