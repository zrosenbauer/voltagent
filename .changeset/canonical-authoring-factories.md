---
"@voltagent/core": major
"@voltagent/scorers": patch
---

Use `defineAgent`, `defineTool`, and `defineWorkflow` as the canonical authoring factories, and `voltagent(options)` to bootstrap the application. Replace `new Agent(...)`, VoltAgent's `tool(...)`, `createWorkflow(...)`, and `new VoltAgent(...)` with these factories. `Agent` and `VoltAgent` are now type-only exports; their runtime classes are internal. The default export is the `voltagent` factory. The old `tool` and `createWorkflow` exports are removed.

The factories use the existing configuration and execution contracts, including tool/context inference, memory, hooks, guardrails, observability, and workflow registration. Legacy `createTool` returns a structural parameters-style tool object. Update built-in scorers to construct agents with `defineAgent`.
