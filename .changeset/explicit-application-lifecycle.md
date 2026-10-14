---
"@voltagent/core": major
"@voltagent/server-hono": patch
"@voltagent/server-core": patch
---

Application startup is explicit: call and await `app.ready()` to initialize workspaces, telemetry, transports, and configured servers. Construction no longer starts resources. Startup errors reject the returned promise and clean up initialized resources. `app.shutdown()` is idempotent, waits for in-flight startup, attempts all cleanup steps, and flushes traces and logs before shutting down telemetry. Repeated readiness and shutdown calls share internal promises.

HTTP readiness waits for the listening event, and shutdown drains HTTP requests and closes connected WebSocket clients before flushing telemetry. Server cleanup also closes an HTTP listener when startup fails before the provider is marked running.
