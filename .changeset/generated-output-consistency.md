---
"@voltagent/core": patch
---

Keep `generateText` output consistent with text modified by output middleware or guardrails. Reparse changed text with the requested output specification before successful VoltAgent completion hooks; invalid transformed output rejects without provider retries, fallback, or tool replay. Unchanged text preserves the native parsed value and missing-output behavior. Subagent bail results also include parsed output.

Infer default text output as a string and preserve runtime context types in generated steps and the final step. Native SDK callbacks and diagnostic records remain unchanged.
