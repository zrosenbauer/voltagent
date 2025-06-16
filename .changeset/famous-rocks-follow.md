---
"@voltagent/vercel-ai": patch
---

fix: resolve onStepFinishHandler issue preventing tool_calls and hooks from functioning properly

Fixed a critical bug in the Vercel AI provider where the `onStepFinishHandler` was blocking tool calls and agent hooks from executing correctly. This issue was preventing agents from properly utilizing tools and executing lifecycle hooks during operations.
