---
title: Server Architecture
sidebar_label: Server Architecture
---

# VoltAgent Server Architecture

VoltAgent 1.x introduces a **framework-agnostic** server architecture that separates core functionality from server implementation. This design allows you to use different server frameworks or create custom implementations.

## Architecture Overview

The server system consists of two main packages:

### @voltagent/server-core

The core package provides framework-agnostic components:

- **Route Definitions** - Standardized route specifications (`/packages/server-core/src/routes/definitions.ts`)
- **Request Handlers** - Business logic for all endpoints
- **Base Provider** - Abstract class for server implementations
- **WebSocket Support** - Real-time communication infrastructure
- **Auth Interface** - Pluggable authentication system

### @voltagent/server-hono

The official server implementation using [Hono](https://hono.dev/):

- Fast, lightweight web framework
- Built-in OpenAPI and Swagger UI support
- TypeScript-first with excellent DX
- Works with Node.js, Bun, Deno, and Edge runtimes

## Core Concepts

### Server Provider Interface

Every server implementation must satisfy the `IServerProvider` interface:

```typescript
interface IServerProvider {
  start(): Promise<{ port: number }>;
  stop(): Promise<void>;
  isRunning(): boolean;
}
```

### Server Provider Factory

Server providers are created using factory functions:

```typescript
type ServerProviderFactory = (deps: ServerProviderDeps) => IServerProvider;
```

The `ServerProviderDeps` provides access to:

- `agentRegistry` - Manage and access agents
- `workflowRegistry` - Manage and access workflows
- `logger` - Logging infrastructure
- `voltOpsClient` - Telemetry and prompt management
- `observability` - OpenTelemetry integration

### Base Server Provider

The `BaseServerProvider` class handles common server tasks:

```typescript
abstract class BaseServerProvider implements IServerProvider {
  // Manages port allocation
  // Sets up WebSocket server
  // Handles graceful shutdown
  // Prints startup messages

  protected abstract startServer(port: number): Promise<Server>;
  protected abstract stopServer(): Promise<void>;
}
```

## Using the Hono Server

### Basic Setup

```typescript
import { VoltAgent } from "@voltagent/core";
import { honoServer } from "@voltagent/server-hono";

new VoltAgent({
  agents: { myAgent },
  server: honoServer({
    port: 3141,
    enableSwaggerUI: true,
  }),
});
```

### Configuration Options

```typescript
interface HonoServerConfig {
  // Port to listen on (default: 3141)
  port?: number;

  // Enable Swagger UI (default: true in dev, false in prod)
  enableSwaggerUI?: boolean;

  // Configure the Hono app directly
  configureApp?: (app: OpenAPIHono) => void | Promise<void>;

  // Authentication provider
  auth?: AuthProvider;
}
```

### Advanced Configuration

Access the Hono app directly for custom middleware and routes:

```typescript
new VoltAgent({
  agents: { myAgent },
  server: honoServer({
    configureApp: (app) => {
      // Add custom middleware
      app.use("/admin/*", authMiddleware);

      // Add custom routes
      app.get("/health", (c) => c.json({ status: "ok" }));

      // Create route groups
      const api = app.basePath("/api/v2");
      api.get("/users", getUsersHandler);

      // Add rate limiting
      app.use("*", rateLimiter());
    },
  }),
});
```

## Port Management

VoltAgent includes intelligent port management:

1. **Default Port**: 3141
2. **Fallback Ports**: If default is taken, tries 4310, 1337, etc.
3. **Port Allocation**: Central manager prevents conflicts
4. **Graceful Release**: Ports are released on shutdown

## WebSocket Support

WebSocket is automatically enabled for real-time features:

- **Base path**: `/ws`
- **Endpoints**:
  - `/ws` – connection test/echo
  - `/ws/logs` – real-time logs (filterable via query params)
  - `/ws/observability` – spans and logs for observability (optional `entityId`/`entityType` filters)
- **Protocol**: Standard WebSocket with JSON messages

Note: The Hono server config does not currently expose WebSocket configuration options. WebSockets are on by default and use the `/ws` path. If you need to change the path or behavior, implement a custom provider using `@voltagent/server-core`.

## Route Registration

Routes are defined in a framework-agnostic format:

```typescript
const AGENT_ROUTES = {
  listAgents: {
    method: "get" as const,
    path: "/agents",
    summary: "List all registered agents",
    tags: ["Agent Management"],
    responses: {
      200: { description: "Success" },
      500: { description: "Server error" },
    },
  },
  // ... more routes
};
```

Server implementations use these definitions to:

- Generate OpenAPI documentation
- Register routes with proper handlers
- Ensure consistency across implementations

## Middleware and Plugins

The Hono server supports standard middleware:

```typescript
configureApp: (app) => {
  // CORS
  app.use("*", cors());

  // Logging
  app.use("*", logger());

  // Compression
  app.use("*", compress());
};
```

## Best Practices

1. **Use the Official Implementation**: Start with `@voltagent/server-hono` unless you have specific requirements
2. **Leverage configureApp**: Add custom routes and middleware through the configuration
3. **Follow Route Definitions**: Use the standardized route definitions for consistency
4. **Handle Errors Properly**: Implement proper error handling in custom providers
5. **Support Graceful Shutdown**: Always clean up resources properly

## Next Steps

- Learn about [Authentication](./authentication.md) to secure your API
- Explore [Custom Endpoints](./custom-endpoints.md) to extend the API
- Check [Agent Endpoints](./endpoints/agents.md) for API usage
