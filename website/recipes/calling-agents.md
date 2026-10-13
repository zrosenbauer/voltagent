---
id: calling-agents
title: Calling Agents
slug: calling-agents
description: Call VoltAgent agents from TypeScript, HTTP routes, workflows, and tools using AI SDK 7.
---

# Calling Agents

VoltAgent 3 accepts AI SDK models and tools directly. Use Node.js 22 or newer with ESM. During the v3 prerelease, install VoltAgent packages from the `next` channel; see the [migration guide](/docs/getting-started/migration-guide/).

## Programmatic calls

```ts
import { Agent } from "@voltagent/core";
import { openai } from "@ai-sdk/openai";

export const agent = new Agent({
  id: "assistant",
  name: "Assistant",
  instructions: "You are a helpful assistant.",
  model: openai("gpt-4o-mini"),
});

const result = await agent.generateText({
  prompt: "What is the capital of France?",
  maxOutputTokens: 500,
  temperature: 0.7,
});
console.log(result.text);
```

The positional form, `agent.generateText("Hello", options)`, also works. In the object form, provide either `prompt` or `messages`. A prompt may be a string or an array of model messages. Caller-supplied system messages require `allowSystemInMessages: true`; prefer `instructions` for call-level instructions.

Pass AI SDK settings at the top level and framework settings under `voltagent`:

```ts
const result = await agent.generateText({
  prompt: "Remember that my name is John",
  voltagent: {
    userId: "user-123",
    conversationId: "conversation-456",
    context: { language: "en" },
  },
});
```

Configure [memory](/docs/agents/memory/) on the agent to persist conversation history. Add [contextSchema](/docs/agents/context/) to infer and validate context values in dynamic instructions, models, and tools.

A call-level model overrides the agent's model and fallback list for that invocation:

```ts
import { openai } from "@ai-sdk/openai";

await agent.generateText({
  model: openai("gpt-4o"),
  instructions: "Answer in one sentence.",
  prompt: "Explain photosynthesis.",
});
```

The agent's configured instructions remain additive. Future calls still use its configured model.

## Streaming

```ts
const result = await agent.streamText({
  prompt: "Write a short story about a robot.",
  onChunk: ({ chunk }) => {
    if (chunk.type === "text-delta") console.log(chunk.text);
  },
});

for await (const text of result.textStream) {
  process.stdout.write(text);
}
console.log(await result.text);
```

Use `result.stream` for detailed events or `result.toUIMessageStreamResponse()` for an AI SDK UI response. These streams also support Web Stream methods. Stream-only callbacks belong on `streamText`.

## Structured output

```ts
import { Output } from "ai";
import { z } from "zod";

const profileSchema = z.object({
  name: z.string(),
  interests: z.array(z.string()),
});

const result = await agent.generateText({
  prompt: "Create a fictional user profile",
  output: Output.object({ schema: profileSchema }),
});
console.log(result.output.name);

const stream = await agent.streamText({
  prompt: "Create another fictional user profile",
  output: Output.object({ schema: profileSchema }),
});
for await (const partial of stream.partialOutputStream) {
  console.log(partial);
}
console.log(await stream.output);
```

`generateObject` and `streamObject` remain deprecated compatibility wrappers. Use the output-based methods for new code.

## HTTP endpoints

Register the agent with a server:

```ts
import { VoltAgent } from "@voltagent/core";
import { honoServer } from "@voltagent/server-hono";
import { agent } from "./agent.js";

new VoltAgent({ agents: { assistant: agent }, server: honoServer() });
```

The default agent endpoint prefix is `/agents`, without `/api`:

```bash
curl -X POST http://localhost:3141/agents/assistant/text \
  -H 'Content-Type: application/json' \
  -d '{"input":"Hello","options":{"maxOutputTokens":500,"userId":"user-123","conversationId":"conversation-456"}}'
```

Use `/agents/assistant/stream` for detailed SSE events and `/agents/assistant/chat` for the AI SDK UI protocol. HTTP requests use `input` or `messages` plus JSON-serializable `options`; JavaScript callbacks and provider model objects belong in application code. See the [agent endpoint reference](/docs/api/endpoints/agents/) for request and response schemas.

## Next.js and AI SDK UI

Convert UI messages to model messages in your route:

```ts
// app/api/chat/route.ts
import { convertToModelMessages, type UIMessage } from "ai";
import { agent } from "@/lib/agent";

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const result = await agent.streamText({
    messages: await convertToModelMessages(messages),
  });
  return result.toUIMessageStreamResponse();
}
```

Use a transport and local input state on the client:

```tsx
"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";

export function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, index) =>
            part.type === "text" ? <span key={index}>{part.text}</span> : null
          )}
        </div>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!input.trim()) return;
          void sendMessage({ text: input });
          setInput("");
        }}
      >
        <input value={input} onChange={(event) => setInput(event.target.value)} />
        <button type="submit" disabled={status === "submitted" || status === "streaming"}>
          Send
        </button>
      </form>
    </div>
  );
}
```

## Calling from workflows

```ts
import { createWorkflowChain } from "@voltagent/core";
import { z } from "zod";
import { agent } from "./agent.js";

const workflow = createWorkflowChain({
  id: "research",
  name: "Research workflow",
  input: z.object({ topic: z.string() }),
  result: z.object({ summary: z.string() }),
}).andAgent(async ({ data }) => `Write a short overview of ${data.topic}`, agent, {
  schema: z.object({ summary: z.string() }),
});

const result = await workflow.run({ topic: "AI agents" });
console.log(result);
```

## Calling from tools

Use the agent's tool adapter when one agent should consult another:

```ts
import { Agent } from "@voltagent/core";

const expert = new Agent({
  name: "Expert",
  instructions: "Explain technical concepts accurately.",
  model: "openai/gpt-4o-mini",
});

const coordinator = new Agent({
  name: "Coordinator",
  instructions: "Consult the expert for technical questions.",
  model: "openai/gpt-4o-mini",
  tools: [expert.toTool()],
});
```

See [agent tools](/docs/agents/tools/) and [subagents](/docs/agents/sub-agents/) for delegation and shared context behavior.
