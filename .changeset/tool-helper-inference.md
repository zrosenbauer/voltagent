---
"@voltagent/core": patch
---

Match AI SDK tool helper overloads so client-side tools can omit both execute and outputSchema, and tools with execute retain a directly callable execute function. Preserve input, output, context, and VoltAgent metadata inference.
