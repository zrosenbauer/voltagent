---
title: Middleware
slug: /agents/middleware
---

# Agent Middleware

Middleware runs before guardrails and hooks on each agent call. Use it to read or modify input and output, or to stop a call with a typed error.

## Execution Order

When configured, `contextSchema` validates the merged context once before this pipeline. Middleware retries reuse that context without revalidating it. See [Schema Validation and Types](/docs/agents/context#schema-validation-and-types).

`generateText` and `generateObject`:

1. Input middlewares
2. Input guardrails
3. Hooks (`onStart`)
4. Model call (with retries and fallback)
5. Output middlewares
6. Output guardrails
7. Hooks (`onEnd`)

`streamText` and `streamObject`:

1. Input middlewares
2. Input guardrails
3. Stream starts

Output middlewares do not run in streaming calls.

## Configure Middleware

Agent-level middlewares run before per-call middlewares. Per-call middlewares are appended to the list for that call.

```ts
import { Agent, createInputMiddleware, createOutputMiddleware } from "@voltagent/core";

const normalizeInput = createInputMiddleware({
  name: "NormalizeInput",
  handler: ({ input }) => {
    if (typeof input !== "string") return input;
    return input.trim();
  },
});

const requireSignature = createOutputMiddleware<string>({
  name: "RequireSignature",
  handler: ({ output, abort }) => {
    if (!output.includes("-- Support")) {
      abort("Missing signature", { retry: true, metadata: { reason: "signature" } });
    }
    return output;
  },
});

const agent = new Agent({
  name: "Support",
  instructions: "Answer support questions with short, direct replies.",
  model: "openai/gpt-4o-mini",
  maxMiddlewareRetries: 1,
  inputMiddlewares: [normalizeInput],
  outputMiddlewares: [requireSignature],
});
```

Per-call middleware:

```ts
await agent.generateText("hi", {
  inputMiddlewares: [({ input }) => (typeof input === "string" ? `Customer: ${input}` : input)],
});
```

## Middleware API

Input middleware receives:

- `input`: current input value
- `originalInput`: input from the caller
- `agent`: agent instance
- `context`: operation context
- `operation`: operation name (for example `generateText`)
- `retryCount`: current middleware retry count
- `abort(reason?, options?)`: stop the call or request a retry

Output middleware receives:

- `output`: current output value
- `originalOutput`: output from the model
- `usage`, `finishReason`, `warnings`: model metadata when available
- `agent`, `context`, `operation`, `retryCount`, `abort(...)`

Return a new value to replace the input or output; return `void` to keep the current value.

For `generateText`, output middleware receives text even when you request structured output. After output middleware and guardrails finish, changed text is parsed with the requested `Output` specification so `result.text` and `result.output` stay consistent. Keep the replacement compatible with the schema; parsing failures reject the call without retrying the model or replaying tools. Unchanged text retains the original parsed output. See [Generated Output With Middleware and Guardrails](/docs/agents/structured-output#generated-output-with-middleware-and-guardrails).

## Retry Behavior

Middleware retries are controlled by `maxMiddlewareRetries`. The default is `0`.

- Call `abort("reason", { retry: true })` to request a retry.
- Each retry restarts the full attempt: input middleware, guardrails, hooks, model selection, model retries/fallback, output middleware. Tools completed during the previous attempt can execute again; use idempotency checks for actions with side effects.
- The retry reason is added as a system message for the next attempt.
- `retryCount` starts at `0` and increments after each middleware-triggered retry.
- If `maxMiddlewareRetries` is exceeded, the middleware error is returned to the caller.
- In streaming calls, retry can only happen before the stream starts, so only input middlewares can trigger it.

Middleware retries are separate from model retries. Model retries use `maxRetries` to repeat only the failed provider call within the SDK loop, retaining completed steps and tool results. The retry counter resets for each new model step. For model fallback configuration, see [Retries and Fallbacks](/docs/agents/retries-fallback).
