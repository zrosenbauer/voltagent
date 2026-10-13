---
"@voltagent/core": minor
---

Preserve the AI SDK streaming result interface, including typed structured output, array elements, metadata, tool aggregates, runtime context, and readable stream methods. Retain VoltAgent context, feedback, guardrails, and subagent events.

With output guardrails, structured values wait for the final decision and parse sanitized final-step text. SDK diagnostic records remain unchanged. UI completion callbacks receive the delivered guarded message, and native SDK stream retry callback return values are preserved without ending recovered operations as errors. Native stream retries require an SDK release that supports `streamRetries`.
