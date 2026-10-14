---
title: Structured Output
slug: /agents/structured-output
---

# Structured Output

Use the AI SDK `output` option with `generateText` and `streamText` when you need typed structured data. This keeps tool calling, memory, hooks, observability, retries, and all other agent features on the same text-generation path.

`generateObject` and `streamObject` are still available as compatibility wrappers, but they are deprecated in VoltAgent 3.x. New code should use `generateText` or `streamText` with `output: Output.object(...)`.

## Generate an Object

```ts
import { defineAgent, Output } from "@voltagent/core";
import { z } from "zod";

const recipeSchema = z.object({
  name: z.string(),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
  prepTimeMinutes: z.number(),
});

const agent = defineAgent({
  name: "Recipe Assistant",
  instructions: "Create practical recipes.",
  model: "openai/gpt-4o-mini",
});

const result = await agent.generateText({
  prompt: "Create a weeknight pasta recipe",
  output: Output.object({ schema: recipeSchema }),
});

console.log(result.output.name);
```

### Generated Output With Middleware and Guardrails

For `generateText`, output middleware runs on the final model step's text, followed by output guardrails. If they change that text, VoltAgent parses `result.output` again using the same `Output` specification and the final step's response metadata and usage. `result.text` and `result.output` therefore describe the same final content. Without an explicit `output` specification, `result.output` is a string; an empty text replacement remains an empty string.

The modified text must still satisfy the output schema. Invalid JSON or a schema mismatch rejects `generateText` before VoltAgent's successful `hooks.onEnd`; error hooks run instead. Parsing failures do not trigger model retries, fallback, or replay completed tools. The SDK must first parse the original model output successfully; output middleware and guardrails cannot repair a response already rejected by the SDK.

When the final text is unchanged, VoltAgent preserves the SDK's parsed value without parsing it again. Custom parsers and schema transforms run again only for changed text. Subagent early termination (`bail`) also returns `output` parsed from the guarded replacement text; a structured replacement must match the requested schema.

Native SDK callbacks and diagnostic fields (`content`, `steps`, `finalStep`, `response`, and `responseMessages`) retain the original model records. Use `result.text` and `result.output` for the processed content you display. `runtimeContext` retains its inferred type in `steps` and `finalStep`.

## Stream Partial Objects

```ts
const stream = await agent.streamText({
  prompt: "Create a detailed dinner plan",
  output: Output.object({ schema: recipeSchema }),
});

for await (const partial of stream.partialOutputStream ?? []) {
  console.log(partial);
}

const finalRecipe = await stream.output;
console.log(finalRecipe);
```

For array output, `elementStream` yields each completed element with its inferred type:

```ts
const stream = await agent.streamText({
  prompt: "Suggest three quick dinners",
  output: Output.array({ element: recipeSchema }),
});

for await (const recipe of stream.elementStream) {
  console.log(recipe.name);
}

const recipes = await stream.output;
```

`stream`, `textStream`, `partialOutputStream`, and `elementStream` support both `for await` and Web Stream methods such as `getReader()` and `pipeTo()`. Each getter returns an independent stream branch. Use `await stream.consumeStream()` to finish processing without collecting chunks; it accepts an optional `onError` callback. `fullStream` and `experimental_partialOutputStream` remain deprecated aliases.

### Structured Output With Guardrails

Without output guardrails, partial objects and elements follow native AI SDK streaming behavior. With output guardrails, `output`, `partialOutputStream`, and `elementStream` wait for the final guardrail decision and parse the sanitized final-step text. Partial and element values are therefore delivered after that decision, rather than incrementally during generation. Redaction must still produce a value accepted by your output schema; otherwise parsing rejects without restarting the model call.

A parallel input guardrail block rejects `output` and prevents model values from reaching structured streams. Text and UI streams retain their replacement-message behavior. Final values exclude text from earlier tool steps and failed attempts recovered by native SDK stream retries.

SDK diagnostic fields such as `content`, `steps`, `finalStep`, `response`, and `responseMessages` retain the SDK's original records; output guardrails do not rewrite them. Use `text`, `output`, or the guarded text/UI streams for content you display to users.

## Combine With Runtime Options

Keep AI SDK generation settings such as `output`, `temperature`, `providerOptions`, `stopWhen`, and `toolChoice` at the top level. Put VoltAgent runtime options under `voltagent`.

```ts
const result = await agent.generateText({
  prompt: "Create a recipe for this user",
  output: Output.object({ schema: recipeSchema }),
  temperature: 0.2,
  voltagent: {
    memory: {
      userId: "user-123",
      conversationId: "recipes-456",
    },
    context: {
      dietaryPreference: "vegetarian",
    },
  },
});
```

## Handle Structured Output Failures

`maxRetries` and model fallback recover failed provider calls. They do not repeat a successful provider call when its response cannot be parsed or fails the output schema. This also applies to the legacy `generateObject` and `streamObject` wrappers. Handle these failures where you await the generation result or read the final structured output.

When combining tools with `Output.object(...)`, allow enough model steps to produce the final object after the tools finish. If the stop condition ends the loop on a tool-only step, the call can fail with `STRUCTURED_OUTPUT_NOT_GENERATED`; increasing `maxRetries` will not add a final step. Adjust `stopWhen` to allow that step, or make a separate formatting call using the completed tool results. Explicitly restarting the entire agent call can execute tools again.

See [Retries and Fallbacks](/docs/agents/retries-fallback) for provider recovery behavior and streaming limits.

## Migrate From generateObject

```ts
// Before
const result = await agent.generateObject("Create a recipe", recipeSchema);
console.log(result.object);

// Preferred
const result = await agent.generateText({
  prompt: "Create a recipe",
  output: Output.object({ schema: recipeSchema }),
});
console.log(result.output);
```

For HTTP requests, use `options.output` on `/agents/:id/text`, `/agents/:id/stream`, or `/agents/:id/chat`. The legacy `/object` and `/stream-object` endpoints remain available for compatibility.
