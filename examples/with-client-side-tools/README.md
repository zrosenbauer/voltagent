# VoltAgent Client-Side Tools Example

This Next.js example demonstrates how to use client-side tools with VoltAgent, providing a smooth developer experience similar to Vercel AI SDK.

## Features

- 📊 **Data Tools**: Get location, read clipboard
- 🤝 **Interactive Tools**: Ask for confirmation before reading the clipboard
- ⚡ **Smooth DX**: Uses Vercel AI SDK's `useChat` hook
- 🔄 **Client Execution**: Handle tools without `execute` in the browser and return their results

## Running the Example

Use Node.js 22 or later. `pnpm build` and `pnpm start` run the production app. Keep the server package and workspace settings in `next.config.ts` when copying the example.

1. Set your OpenAI API key:

```bash
export OPENAI_API_KEY="your-api-key"
```

2. Install dependencies:

```bash
pnpm install
```

3. Run the development server:

```bash
pnpm dev
```

4. Start the VoltAgent built-in server in a separate terminal:

```bash
pnpm voltagent:run
```

5. Open [http://localhost:3000](http://localhost:3000)

To inspect runs, open `https://console.voltagent.dev` and connect it to `http://localhost:3141`.

### How It Works

### 1. Define Tools (No Execute = Client-Side)

```typescript
import { Agent, tool } from "@voltagent/core";
import { z } from "zod";

// Client-side tool (no execute function)
const getLocationTool = tool({
  description: "Get user's current location",
  inputSchema: z.object({}),
  // No execute = automatically client-side
});

const agent = new Agent({
  // ...
  tools: {
    getLocation: getLocationTool,
  },
});
```

### 2. Handle Client-Side Tools with useChat

```tsx
import { useChat } from "@ai-sdk/react";
import type { ClientSideToolResult } from "@voltagent/core";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useEffect, useState } from "react";

const [input, setInput] = useState("");
const [result, setResult] = useState<ClientSideToolResult | null>(null);

const { messages, sendMessage, addToolResult } = useChat({
  transport: new DefaultChatTransport({ api: "/api/chat" }),
  sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  // Automatic client-side tool execution
  async onToolCall({ toolCall }) {
    if (toolCall.toolName === "getLocation") {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const payload: ClientSideToolResult = {
            tool: "getLocation",
            toolCallId: toolCall.toolCallId,
            output: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
            },
          };
          setResult(payload);
        },
        (error) => {
          const payload: ClientSideToolResult = {
            state: "output-error",
            tool: "getLocation",
            toolCallId: toolCall.toolCallId,
            errorText: error.message,
          };
          setResult(payload);
        }
      );
    }
  },
});
```

Keep the input value in React state. Submit it with `sendMessage({ text: input })`, then clear it with `setInput("")`. The complete component is in `app/page.tsx`.

### 3. Sending back tool results to the model

After executing a client-side tool, call `addToolResult` with its output or an `output-error` result. This completes the pending tool call. With `sendAutomaticallyWhen` configured above, the chat continues when all tool results are available. Without a result, the tool call remains pending.

```ts
useEffect(() => {
  if (!result) return;
  addToolResult(result);
}, [result, addToolResult]);
```

## Tool Types

1. **Client-side Tools**: Execute in the browser and return results through `addToolResult`
   - Get location
   - Read clipboard

2. **Server Tools**: Traditional server-side execution
   - Get weather
   - Database queries

## Developer Experience

The integration is designed to be as simple as possible:

1. Tools without `execute` can be handled in the browser
2. `useChat` hook handles all the streaming complexity
3. `onToolCall` callback invoked when a tool call is received
4. You **must** call `addToolResult` to send back the tool result.
5. Full TypeScript support

## Try These Examples

- "What's my current location?" - Data tool
- "What's in my clipboard?" - Data tool
- "What's the weather in San Francisco?" - Server tool

## Security Considerations

Client-side tools have access to browser APIs, so:

- Always validate tool arguments
- Request user permission for sensitive operations
- Use the interactive pattern for destructive actions
- Consider rate limiting tool executions
