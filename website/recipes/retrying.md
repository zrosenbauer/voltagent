---
id: retrying
title: Retrying
slug: retrying
description: Automatically retry model calls to handle transient failures.
---

# Retrying

Retries help you survive transient provider issues like 5xx errors and rate limits. VoltAgent applies exponential backoff between attempts.

## Quick Setup

```typescript
import { openai } from "@ai-sdk/openai";
import { Agent, VoltAgent } from "@voltagent/core";
import { honoServer } from "@voltagent/server-hono";

const agent = new Agent({
  name: "ReliableAgent",
  instructions: "Answer support questions clearly and fast.",
  model: openai("gpt-4o-mini"),
  maxRetries: 2,
});

new VoltAgent({
  agents: { agent },
  server: honoServer({ port: 3141 }),
});
```

## Per-Call Overrides

```typescript
const response = await agent.generateText("Summarize this ticket", {
  maxRetries: 0,
});
```

## Retry Telemetry

Use the `onRetry` hook to track retry behavior.

```typescript
const agent = new Agent({
  name: "RetryAwareAgent",
  instructions: "Answer questions with retries.",
  model: openai("gpt-4o-mini"),
  maxRetries: 2,
  hooks: {
    onRetry: async (args) => {
      if (args.source === "llm") {
        console.log(`LLM retry ${args.nextAttempt}/${args.maxRetries + 1} for ${args.modelName}`);
      } else {
        console.log(
          `Middleware retry ${args.retryCount + 1}/${args.maxRetries + 1} for ${args.middlewareId ?? "unknown"}`
        );
      }
    },
  },
});
```

## Notes

- Total attempts per provider call = `maxRetries + 1`. The count resets for each new model step; completed steps and tool results are retained.
- Default `maxRetries` is `3` if you do not configure it.
- `maxRetries` must be a non-negative integer. `0` disables retries but still allows configured fallback models.
- Errors marked `isRetryable: false` skip retries.
- Streaming retries can recover the current model step before it emits content, even if earlier steps have streamed or executed tools. Provider stream-start and response metadata do not commit an attempt; text/reasoning start events and tool input do.
- Parsing or schema validation failures after a successful provider call do not trigger model retries.
- Middleware retries restart the full pipeline and can execute tools again. A model can also request the same action in a later response; keep normal business idempotency checks.

Native SDK `streamRetries` is a separate, explicit opt-in on SDK releases that support it. It can recover after content starts; already emitted partial text remains in consumer streams. See [Native SDK Stream Retries](/docs/agents/retries-fallback#native-sdk-stream-retries).

## Learn More

See [Retries and Fallbacks](/docs/agents/retries-fallback) for full behavior details.
