---
"@voltagent/core": minor
---

Support per-call models through the agent's retry and tracing pipeline and accept native message arrays in `prompt`. A call model replaces the constructor model/fallback list only for that invocation.

Align input checks with AI SDK: reject conflicting prompt/messages and empty message arrays, prefer `instructions` over the deprecated `system` alias, and require `allowSystemInMessages` for caller-supplied system messages. Framework instructions remain additive.

Derive generate/stream options and callbacks from the corresponding installed SDK method. Stream-only settings are no longer accepted by `generateText`; newer SDK features require their supporting SDK version.
