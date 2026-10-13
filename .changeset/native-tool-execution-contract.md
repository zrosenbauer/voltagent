---
"@voltagent/core": minor
---

Preserve AI SDK execution semantics for native tools: thrown errors become `tool-error`, and functions returning an AsyncIterable retain preliminary outputs. Keep tracing, guardrails, hooks, approval, and explicit recovery. Native final-output validation now requires `voltagent.validateOutput: true`; legacy `createTool` retains automatic validation and serialized errors. Preserve error states in persisted UI messages and history, synchronize routed contexts after `prepareStep`, and document migration behavior.

Native streaming requires a directly returned AsyncIterable; a Promise resolving to an iterable remains an ordinary SDK output. Move asynchronous setup into an async generator when migrating. VoltAgent start hooks and the parallel guardrail wait finish before the SDK's per-tool timeout begins; long-running hooks need their own deadline and must honor the operation abort signal.
