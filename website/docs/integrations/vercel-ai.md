---
title: AI SDK Integration
slug: /integrations/vercel-ai
---

# AI SDK Integration

VoltAgent 3 uses AI SDK 7 directly. Bring your AI SDK model, tools, and output schema to a VoltAgent `Agent` to add memory, guardrails, tool routing, subagents, and observability.

## Installation

Use Node.js 22 or newer and an ESM project (`"type": "module"`). While VoltAgent 3 is in prerelease, install the `next` channel:

```bash
pnpm add @voltagent/core@next @voltagent/server-hono@next ai@^7 @ai-sdk/openai@^4 zod@^4
```

After the stable v3 release, use the stable VoltAgent package versions. Provider package majors vary; see the [migration guide](../getting-started/migration-guide.md).

## Bring an AI SDK model and tools

Tools created with `tool` from `ai` work directly in the agent's `tools` object. The object keys are the tool names used by the model.

```ts
import { openai } from "@ai-sdk/openai";
import { defineAgent, voltagent } from "@voltagent/core";
import { honoServer } from "@voltagent/server-hono";
import { isStepCount, tool } from "ai";
import { z } from "zod";

const agent = defineAgent({
  name: "Calculator",
  instructions: "Use the calculator for arithmetic and explain the result.",
  model: openai("gpt-4o-mini"),
  tools: {
    add: tool({
      description: "Add two numbers",
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      execute: ({ a, b }) => a + b,
    }),
  },
});

voltagent({ agents: { agent }, server: honoServer() });

const result = await agent.generateText({
  prompt: "What is 21 + 34?",
  stopWhen: isStepCount(5),
  temperature: 0,
  onStepEnd: (step) => console.log(step.finishReason),
});

console.log(result.text);
```

Call-level AI SDK options and callbacks stay at the top level. Use `voltagent` for framework options such as conversation tracking, context, and hooks:

```ts
const result = await agent.generateText({
  prompt: "Add 10 and 20",
  voltagent: {
    userId: "user-123",
    conversationId: "conversation-456",
    context: { language: "en" },
    hooks: {
      onEnd: ({ output }) => console.log(output),
    },
  },
});
```

Configure [memory](../agents/memory.md) on the agent when calls should retain conversation history. For typed and validated invocation context, use the agent's [contextSchema](../agents/context.md). Native tool `contextSchema` and call-level `toolsContext` remain separate AI SDK features.

## Add VoltAgent metadata to a tool

Use `enhanceTool` for existing AI SDK tools, or `defineTool` from `@voltagent/core` to define a tool with a `voltagent` metadata namespace. Native execution semantics stay the same; metadata alone does not enable retries or output validation.

```ts
import { enhanceTool } from "@voltagent/core";
import { tool } from "ai";
import { z } from "zod";

const lookup = enhanceTool(
  tool({
    inputSchema: z.object({ id: z.string() }),
    execute: ({ id }) => ({ id, available: true }),
  }),
  { tags: ["catalog"] }
);
```

Client-side tools may omit both `execute` and `outputSchema`. Add an output schema when you want to declare the shape of the result supplied by your client. See [tools](../agents/tools.md) for approval, routing, and execution hooks.

## Streaming and structured output

Use the native output helpers with the agent methods:

```ts
import { Output } from "ai";
import { z } from "zod";

const result = await agent.generateText({
  prompt: "Summarize the answer",
  output: Output.object({ schema: z.object({ answer: z.string() }) }),
});
console.log(result.output.answer);

const stream = await agent.streamText({ prompt: "Explain addition briefly" });
for await (const text of stream.textStream) {
  process.stdout.write(text);
}
```

For a UI route, return `stream.toUIMessageStreamResponse()`. See the [AI SDK UI integration](../ui/ai-sdk-integration.md) for message conversion and `useChat` examples. Use `onChunk` and other streaming-only options on `streamText`.

## Observability

Register agents in `VoltAgent` to use the built-in OpenTelemetry observability pipeline. For VoltOps export, configure:

```bash
VOLTAGENT_PUBLIC_KEY=pk_...
VOLTAGENT_SECRET_KEY=sk_...
```

See [observability](../observability/developer-console.md) for local tracing, persistent storage, and custom processors. The legacy `@voltagent/vercel-ai-exporter` setup is not the setup for VoltAgent 3 agents.

## Direct AI SDK calls

VoltAgent also re-exports common AI SDK functions. These are native calls; they do not run a VoltAgent agent's memory, guardrails, hooks, or model fallback pipeline:

```ts
import { generateText } from "@voltagent/core";
import { openai } from "@ai-sdk/openai";

const result = await generateText({
  model: openai("gpt-4o-mini"),
  prompt: "Hello",
});
```

Configure native AI SDK telemetry separately for direct calls. Use `agent.generateText()` or `agent.streamText()` when you want VoltAgent orchestration. The [compatibility reference](../agents/overview.md) explains which fields VoltAgent composes and how guardrails affect delivered results.
