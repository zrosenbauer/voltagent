---
"@voltagent/core": minor
---

Retry and fall back at the individual provider-call boundary, preserving completed tool executions, step results, and memory records. Keep ordered model lists, per-model/call retry settings, retry/fallback hooks, and tracing. Stream failures before the current step emits content can recover even after earlier steps completed; failures after content starts are surfaced without replay.

Backoff honors cancellation and SDK step/total timeouts. Retry counts must be non-negative integers. Explicit prepareStep model selections receive retries without falling through to the agent model list. Structured-output/parsing failures outside provider execution no longer restart the generation; explicit middleware retries retain their full-pipeline behavior. Document these migration differences.
