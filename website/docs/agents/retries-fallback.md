---
title: Retries and Fallbacks
slug: /agents/retries-fallback
---

# Retries and Fallbacks

VoltAgent supports per-call retries and ordered model fallback lists. Retries are handled by VoltAgent with exponential backoff. After retries are exhausted for a model, VoltAgent attempts the next model in the list.

Recovery operates on a single provider call inside the AI SDK loop. Completed steps, tool results, and their memory records stay in place. For example, if a tool creates an order and the following model call fails, only that model call is retried; the completed order tool is not replayed. A model can still request another tool call in a later response, so business operations should retain their normal idempotency checks.

## Call-level Model Overrides

`agent.generateText({ model, prompt })` and `agent.streamText({ model, prompt })` use the selected model through the same retry and tracing pipeline. The override replaces the constructor model/fallback list for that invocation. It does not mutate the agent or use the constructor fallback list when it fails. A call-level `maxRetries` takes precedence over the agent retry default.

Native model middleware remains active on a model passed through `wrapLanguageModel`. `prepareStep` can still select a different model for subsequent steps.

## Configure Retries

You can set a default retry count at the agent level, then override it per model or per call.

```ts
import { Agent } from "@voltagent/core";

const agent = new Agent({
  name: "Support",
  instructions: "Resolve tickets quickly.",
  model: "openai/gpt-4o-mini",
  maxRetries: 3,
});

// Per-call override
await agent.generateText("Summarize this ticket", { maxRetries: 0 });
```

- `maxRetries` is the number of retry attempts for a single model call (total attempts = `maxRetries + 1`).
- It must be a non-negative integer. The count resets for each new model step.
- Priority order: per-call `maxRetries` > per-model `maxRetries` > agent `maxRetries` > default `3`.
- `0` disables retries for that call; configured fallback models can still be attempted.
- Retry delay uses exponential backoff: 1s, 2s, 4s, 8s (max 10s).
- A longer provider `Retry-After` value sets the minimum delay, capped at five minutes. Cancellation and SDK step/total timeouts interrupt the wait.
- Errors with `isRetryable: false` skip retries; fallback can still run.

## Configure Fallbacks

Provide a list of models. VoltAgent tries them in order until one succeeds.
Each entry can have its own retry count and can be toggled on/off.

```ts
import { Agent } from "@voltagent/core";
import { anthropic } from "@ai-sdk/anthropic";

const agent = new Agent({
  name: "FallbackAgent",
  instructions: "Be concise.",
  model: [
    { id: "primary", model: "openai/gpt-4o-mini", maxRetries: 2 },
    { id: "secondary", model: anthropic("claude-3-5-sonnet"), maxRetries: 1 },
    { id: "tertiary", model: "google/gemini-2.0-flash", enabled: true },
  ],
});
```

Notes:

- The first enabled model is the primary.
- `maxRetries` falls back to the agent default if omitted.
- `enabled: false` lets you keep a model configured but temporarily disabled.

## How Fallback Works

VoltAgent tries each enabled model in order:

1. Resolve the model (dynamic or static).
2. Execute the call with that model, retrying up to `maxRetries` on error.
3. If retries are exhausted, move to the next model.

The next model receives the current step's prepared prompt, including completed tool results, tool definitions, provider options, and call settings. Use fallback models compatible with those inputs and the requested output format. Later steps continue with the successful fallback model. Model references are resolved once per candidate within a generation; a new generation starts at the first enabled model again.

An explicit `prepareStep` model selection uses that selected model with the call-level or agent-level retry count. It does not fall through to the agent's configured model list. `prepareStep` is not rerun for each provider retry.

Fallback **does not** trigger for:

- Abort or bail errors.
- Guardrail blocks.
- Tool execution errors.
- SDK result parsing or structured-output validation failures after a provider call succeeds, including `STRUCTURED_OUTPUT_NOT_GENERATED`.
- Failures in step callbacks, output guardrails, or other processing outside the provider call.

Streaming behavior:

- Retries and fallback happen before the current model step emits content, including when earlier steps have already emitted output or executed tools.
- Provider `stream-start` and response metadata are buffered until the attempt starts producing content. An error event or read failure before that point can retry or fall back without exposing the failed attempt's prelude.
- Text/reasoning start events, tool input, and other content commit the attempt. An error after that point is surfaced to the caller; VoltAgent does not restart that stream.
- Recoverable provider failures trigger `hooks.onRetry` / `hooks.onFallback`. Terminal stream errors are surfaced to the caller; VoltAgent does not synthesize extra SDK step callbacks for retries.

Tracing includes provider-attempt spans with the model, attempt number, and status. Generation usage and cost remain on the existing generation/root spans.

### Native SDK Stream Retries

On AI SDK versions that support `streamRetries` (verified with 7.0.137), VoltAgent forwards that option and preserves the return value of the call-level `onError` callback. Older SDK versions such as 7.0.18 do not implement this option; upgrade `ai` before using it.

```ts
import { APICallError } from "ai";

const result = await agent.streamText({
  prompt: "Summarize the report",
  streamRetries: 0,
  onError: ({ error }) => {
    if (APICallError.isInstance(error) && error.isRetryable) {
      return { retry: true };
    }
  },
});

await result.consumeStream();
```

Omitting `streamRetries` leaves native stream recovery disabled. Setting it to `0` enables callback-requested recovery without automatic stream retries; positive values enable the SDK's automatic stream retry budget. These retries are separate from VoltAgent's `maxRetries` and model fallback. They can restart the current model step after content has started. Already emitted partial text remains in consumer streams, but the SDK excludes failed attempts from the recovered step, final output, and subsequent model input.

The call-level `onError` observes these recoverable SDK errors. `hooks.onError` and error trace finalization run for terminal errors; a recovered error does not close the VoltAgent operation. Native stream retries do not synthesize VoltAgent `hooks.onRetry` or `hooks.onFallback` events. The same callback forwarding applies to the legacy `streamObject` wrapper.

## Middleware Retries

Middleware retries are separate from model retries and fallback. A middleware can call `abort("reason", { retry: true })` to restart the full attempt.

- Controlled by `maxMiddlewareRetries` (agent-level or per-call).
- Each retry reruns the full pipeline: middleware, guardrails, hooks, model selection, model retries, and fallback.
- In streaming calls, only input middlewares can trigger a retry before the stream starts.

See [Middleware](/docs/agents/middleware) for configuration and API details.

## Real-World Scenarios

### 1. Provider Outage During a Traffic Spike

The primary provider returns 5xx errors during a traffic spike. Configure a fallback provider with its own retry count.

```ts
const agent = new Agent({
  name: "LaunchAssistant",
  instructions: "Handle onboarding questions.",
  model: [
    { model: "openai/gpt-4o-mini", maxRetries: 1 },
    { model: "anthropic/claude-3-5-sonnet", maxRetries: 2 },
  ],
});
```

Expected behavior:

- Primary errors are retried up to `maxRetries`.
- After retries, the secondary provider is attempted.

### 2. Rate Limits During Peak Hours

The primary model returns 429 during peak hours. Set `maxRetries: 0` on the primary and allow retries on the fallback.

```ts
const agent = new Agent({
  name: "PeakTrafficAgent",
  instructions: "Answer pricing questions.",
  model: [
    { model: "openai/gpt-4o-mini", maxRetries: 0 },
    { model: "groq/llama-3.3-70b-versatile", maxRetries: 2 },
  ],
});
```

Expected behavior:

- The primary fails without retry delay.
- The fallback is attempted and can retry if needed.

### 3. Provider Timeouts

A provider returns timeout errors. Configure another provider as a fallback.

```ts
const agent = new Agent({
  name: "RegionalAgent",
  instructions: "Support users in APAC.",
  model: [
    { model: "google/gemini-2.0-flash", maxRetries: 1 },
    { model: "openai/gpt-4o-mini", maxRetries: 1 },
  ],
});
```

Expected behavior:

- Retryable provider timeout errors can retry and then fall back while the operation's abort signal remains active.
- An expired SDK step/total timeout or caller cancellation stops recovery instead of moving to another model.
- The fallback handles calls that the primary fails.

### 4. Compliance or Data Residency Constraints

Some users require a specific provider for data residency. Select the primary model dynamically and keep a fallback entry.

```ts
const agent = new Agent({
  name: "ComplianceAgent",
  instructions: "Handle regulated requests.",
  model: [
    {
      model: async ({ context }) => {
        const region = (context.get("region") as string) || "us";
        return region === "eu" ? "mistral/mistral-large-latest" : "openai/gpt-4o-mini";
      },
      maxRetries: 1,
    },
    { model: "anthropic/claude-3-5-sonnet", maxRetries: 1 },
  ],
});
```

Expected behavior:

- The model selection uses `context` values on each call.
- If the selected model fails, the fallback is attempted.

### 5. Cost Control with Fallback

Use a lower-cost primary model and a second model for error cases.

```ts
const agent = new Agent({
  name: "CostAwareAgent",
  instructions: "Handle receipts and billing questions.",
  model: [
    { model: "openai/gpt-4o-mini", maxRetries: 1 },
    { model: "openai/gpt-4o", maxRetries: 0 },
  ],
});
```

Expected behavior:

- The primary handles successful calls.
- The fallback is only used when the primary errors.

## Troubleshooting Tips

- If fallbacks never trigger, check for guardrail blocks or tool errors.
- If retries are skipped, check whether the provider marks the error as `isRetryable: false`.
- If all configured models are disabled, VoltAgent throws `MODEL_LIST_EMPTY`.
- For stream errors after content starts, handle recovery in the application. Resubmitting the whole agent call starts a new generation and can execute tools again.
- Keep the fallback list short to avoid long end-to-end latency when providers are degraded.
