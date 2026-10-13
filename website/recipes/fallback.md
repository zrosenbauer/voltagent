---
id: fallback
title: Fallback
slug: fallback
description: Configure ordered model fallbacks for reliable agent calls.
---

# Fallback

Fallbacks let VoltAgent try a secondary model when the primary fails. Each model can have its own retry policy.

## Quick Setup

```typescript
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { Agent, VoltAgent } from "@voltagent/core";
import { honoServer } from "@voltagent/server-hono";

const agent = new Agent({
  name: "FallbackAgent",
  instructions: "Be concise.",
  model: [
    { id: "primary", model: openai("gpt-4o-mini"), maxRetries: 1 },
    { id: "secondary", model: anthropic("claude-3-5-sonnet"), maxRetries: 2 },
  ],
});

new VoltAgent({
  agents: { agent },
  server: honoServer({ port: 3141 }),
});
```

## Enable or Disable a Model

```typescript
const agent = new Agent({
  name: "FeatureFlaggedAgent",
  instructions: "Handle requests reliably.",
  model: [
    { id: "primary", model: openai("gpt-4o-mini") },
    { id: "backup", model: "google/gemini-2.0-flash", enabled: false },
  ],
});
```

## Track Fallbacks

```typescript
const agent = new Agent({
  name: "FallbackAwareAgent",
  instructions: "Respond with a backup model if needed.",
  model: [
    { id: "primary", model: openai("gpt-4o-mini"), maxRetries: 1 },
    { id: "secondary", model: anthropic("claude-3-5-sonnet"), maxRetries: 1 },
  ],
  hooks: {
    onFallback: async ({ stage, fromModel, nextModel, operation }) => {
      console.warn(
        `Fallback (${stage}) from ${fromModel} to ${nextModel ?? "next"} during ${operation}`
      );
    },
  },
});
```

## Notes

- VoltAgent tries enabled models in order.
- Each model retries up to `maxRetries` before moving to the next.
- The fallback receives the current step's prepared prompt, completed tool results, tools, and call settings. Choose models compatible with those inputs and the requested output format.
- Later steps stay on the successful fallback model; a new generation starts at the first enabled model again.
- Fallback does not trigger for guardrail blocks, tool errors, abort/bail conditions, or parsing/schema validation failures after a successful provider call.
- Streaming fallback can recover the current model step before it emits content, even after earlier steps have streamed or executed tools. Provider stream-start and response metadata do not commit an attempt; text/reasoning start events and tool input do.
- An explicit `prepareStep` model selection uses that model with call-level or agent-level retries, without falling through to the agent's fallback list.

Native SDK `streamRetries` is a separate, explicit opt-in on SDK releases that support it. It can recover after content starts; already emitted partial text remains in consumer streams. See [Native SDK Stream Retries](/docs/agents/retries-fallback#native-sdk-stream-retries).

## Learn More

See [Retries and Fallbacks](/docs/agents/retries-fallback) for full behavior details.
