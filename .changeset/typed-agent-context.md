---
"@voltagent/core": minor
"@voltagent/server-core": patch
---

Add optional `contextSchema` validation to the existing VoltAgent context API. Infer schema input types for constructor/call context and output types for dynamic instructions, models, tools, inline agent hooks, and generation results. Preserve the Map API, shared parent/per-call Maps, and extra runtime entries.

Validate the merged context once before execution, applying defaults and async transforms. Constructor-only defaults are copied per invocation for schema-enabled agents. Invalid context throws `AgentContextValidationError` and returns HTTP 400 (`INVALID_CONTEXT`) through server adapters. Agent tools can receive default context through `toTool({ context })`.
