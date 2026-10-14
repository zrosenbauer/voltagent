---
"@voltagent/cli": patch
"create-voltagent-app": patch
---

Generate starter applications with `defineAgent` and `voltagent`, and explicitly await application readiness. Update framework integrations and examples to use the canonical v3 authoring factories. Deployment CLI guidance includes `await app.ready()` before creating serverless handlers.
