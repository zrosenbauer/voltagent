---
title: Overview
---

# Tools & Toolkits

VoltAgent allows you to extend the capabilities of your AI agents by providing them with **Tools**. Tools enable agents to interact with external APIs, perform calculations, access databases, or execute virtually any custom code. This guide covers how to define and use individual tools and the new `Toolkit` concept for managing related tools.

## Defining a Single Tool

For new VoltAgent 3.x code, define custom tools with the AI SDK-style `defineTool()` helper and pass them to agents as a `ToolSet` object. The tool name comes from the object key.

A tool requires:

- `description`: A clear description of what the tool does (used by the LLM to decide when to use it).
- `inputSchema`: A Zod schema defining the input arguments the tool expects.
- `execute` (optional): The tool's logic, receiving validated arguments and native AI SDK execution options. It may return a value, a promise, or an async iterable. Omit it for client-side tools.
- `outputSchema` (optional): A Zod schema defining the expected output format. Set `voltagent.validateOutput: true` to validate the final output against this schema at runtime.
- `voltagent` (optional): VoltAgent extensions such as tags, hooks, `validateOutput`, and static approval metadata.

```typescript
import { defineAgent, defineTool } from "@voltagent/core";
import { z } from "zod";

// Define a simple weather tool
const getWeatherTool = defineTool({
  description: "Fetches the current weather for a given location.",
  inputSchema: z.object({
    location: z.string().describe("The city and state, e.g., San Francisco, CA"),
  }),
  execute: async ({ location }) => {
    // In a real scenario, you would call a weather API here
    console.log(`Fetching weather for ${location}...`);
    if (location.toLowerCase().includes("tokyo")) {
      return { temperature: "15°C", condition: "Cloudy" };
    }
    return { temperature: "22°C", condition: "Sunny" };
  },
});

const agent = defineAgent({
  name: "WeatherAgent",
  instructions: "An agent that can fetch weather information.",
  model: "openai/gpt-4o-mini",
  tools: {
    get_weather: getWeatherTool,
  },
});

// Now the agent can use the 'get_weather' tool when asked about weather.
```

## Client-Side Tools

Both `tool` from `ai` and `defineTool` from `@voltagent/core` accept definitions without `execute` or `outputSchema`:

```ts
import { defineTool } from "@voltagent/core";
import { z } from "zod";

const getLocation = defineTool({
  description: "Ask the client for its location",
  inputSchema: z.object({}),
  voltagent: { tags: ["browser"] },
});
```

Register it under `tools: { getLocation }` and supply its result from your client. An explicit `outputSchema` can describe that result when needed. Tools that define `execute` retain a directly callable, typed `execute` function. See the [client-side tools example](https://github.com/VoltAgent/voltagent/tree/next/examples/with-client-side-tools).

## Accessing Tool Context

The `execute` function receives AI SDK tool execution options such as `toolCallId`, `messages`, and `abortSignal`. VoltAgent lifecycle context is available through `voltagent.hooks`.

```typescript
import { defineAgent, defineTool } from "@voltagent/core";
import { z } from "zod";

// Tool that observes VoltAgent lifecycle context
const contextAwareWeatherTool = defineTool({
  description: "Fetches weather with user preferences",
  inputSchema: z.object({
    location: z.string().describe("The city name"),
  }),
  execute: async ({ location }, options) => {
    if (options.abortSignal?.aborted) {
      throw new Error("Request was cancelled");
    }

    const response = await fetch(`https://api.weather.com/current?city=${location}`, {
      signal: options.abortSignal,
    });

    return await response.json();
  },
  voltagent: {
    hooks: {
      onStart: ({ args, options }) => {
        const units = options?.context?.get("preferredUnits") || "celsius";
        options?.logger?.info(`Fetching weather for ${args.location} in ${units}`);
      },
    },
  },
});

// Use the tool with context
const context = new Map();
context.set("preferredUnits", "fahrenheit");

const agent = defineAgent({
  name: "WeatherAgent",
  instructions: "An agent that respects user preferences",
  model: "openai/gpt-4o-mini",
  tools: {
    get_weather: contextAwareWeatherTool,
  },
});

const response = await agent.generateText("What's the weather in Paris?", {
  memory: {
    userId: "user123",
  },
  context,
});
```

In `voltagent.hooks`, the `options` parameter includes:

- **Operation metadata**: `operationId`, `userId`, `conversationId`
- **User context**: `context` (Map for custom data)
- **Logging**: `logger` (operation-scoped logger)
- **Tool context**: `toolContext.callId`, `toolContext.messages`, `toolContext.abortSignal`

For more details, see the [Tools documentation](/docs/agents/tools#accessing-tool-context).

## Tool Output Schema Validation

VoltAgent supports explicit output schema validation for native tools with `voltagent.validateOutput: true`. Legacy `createTool` retains automatic validation when `outputSchema` is provided. This feature ensures that tool outputs conform to a predefined structure, providing several benefits:

- **Type Safety**: Tool outputs are typed based on the schema
- **Runtime Validation**: Invalid outputs are caught immediately
- **Error Recovery**: When validation fails, the LLM receives an error message and can retry with corrected output
- **Consistency**: All tool responses follow the same structure
- **Documentation**: Output schemas serve as API contracts

### Example with Output Schema

```typescript
import { defineTool } from "@voltagent/core";
import { z } from "zod";

// Define the output schema
const weatherOutputSchema = z.object({
  location: z.string(),
  temperature: z.number(),
  condition: z.enum(["sunny", "cloudy", "rainy", "snowy"]),
  humidity: z.number().min(0).max(100),
  forecast: z.object({
    high: z.number(),
    low: z.number(),
    description: z.string(),
  }),
});

// Create a tool with output validation
const weatherTool = defineTool({
  description: "Get current weather with forecast",
  inputSchema: z.object({
    location: z.string().describe("City name"),
  }),
  outputSchema: weatherOutputSchema,
  voltagent: { validateOutput: true },
  execute: async ({ location }) => {
    // This output will be validated against weatherOutputSchema
    return {
      location,
      temperature: 22,
      condition: "sunny",
      humidity: 65,
      forecast: {
        high: 25,
        low: 18,
        description: "Clear skies throughout the day",
      },
    };
  },
});
```

### How Output Validation Works

1. With `voltagent.validateOutput: true`, the final output is validated against `outputSchema` using the SDK's schema validator, including asynchronous schemas.
2. Validated data is returned, including schema transformations and defaults. Final output overrides and error recovery outputs are also validated.
3. Invalid output becomes an SDK `tool-error` unless an `onToolError` hook explicitly supplies a valid recovery result. The model receives an error output and can continue according to the configured stop conditions.
4. Streaming progress values are not checked against the final schema. Validation buffers one value so the final value is checked before it is emitted.

Without `validateOutput`, native tools keep AI SDK output semantics; `outputSchema` alone does not validate or transform their runtime values. See [Native Execution and Errors](/docs/agents/tools#native-execution-and-errors) for error handling and legacy compatibility.

### Best Practices

- Use output schemas for tools that need consistent response formats
- Keep schemas focused and avoid overly complex nested structures
- Use descriptive error messages in your schemas with `.describe()`
- Consider making some fields optional with `.optional()` for flexibility
- Output schemas are completely optional - tools without them work as before

## Grouping Tools with Toolkits

Often, several tools work together logically. For instance, tools for step-by-step reasoning (`think`, `analyze`) or a set of tools interacting with the same API. For these scenarios, VoltAgent provides **Toolkits**.

For new standalone agent tools, prefer `defineTool()` and a ToolSet object as shown above. The current toolkit helper accepts named parameters-style tools from `createTool`; use the toolkit examples below when you need toolkit-level instructions.

A `Toolkit` allows you to:

1.  **Group related tools:** Keep your tool management organized.
2.  **Define shared instructions:** Provide common guidance to the LLM on how to use all tools within the toolkit.
3.  **Control instruction injection:** Decide if the toolkit's shared instructions should be automatically added to the agent's system prompt.

### Defining a Toolkit with Compatibility Tools

`createToolkit` groups named parameters-style tools. Standalone tools can use the AI SDK-style `defineTool()` helper.

A `Toolkit` is an object with the following structure:

```typescript
import { createTool, createToolkit } from "@voltagent/core";

const myCalculatorToolkit = createToolkit({
  name: "calculator_toolkit",
  description: "Tools for performing basic arithmetic operations.",
  // Optional instructions for the LLM
  instructions: `Use these tools for calculations. Always use 'add' for addition, 'subtract' for subtraction.`,
  // Set to true to add the above instructions to the system prompt
  addInstructions: true,
  tools: [
    createTool({
      /* ... definition for 'add' tool ... */
    }),
    createTool({
      /* ... definition for 'subtract' tool ... */
    }),
    // ... other calculator tools
  ],
});
```

**Important:** With the introduction of Toolkits, individual `Tool` instances no longer have their own `instructions` or `addInstructions` properties. Instructions are managed at the Toolkit level.

### Adding Tools to an Agent

The `tools` option in the `Agent` constructor accepts a ToolSet object for AI SDK-style tools. Use this for new standalone tools. The object key is the tool name the model sees and calls.

```typescript
import { openai } from "@ai-sdk/openai";
import { defineAgent, defineTool } from "@voltagent/core";
import { z } from "zod";

const getWeatherTool = defineTool({
  description: "Fetches the current weather for a given location.",
  inputSchema: z.object({
    location: z.string(),
  }),
  execute: async ({ location }) => {
    return { location, temperature: "22°C", condition: "Sunny" };
  },
});

const agent = defineAgent({
  name: "MultiToolAgent",
  instructions: "An agent with user-defined and provider-defined tools.",
  model: "openai/gpt-4o-mini",
  tools: {
    get_weather: getWeatherTool,
    web_search_preview: openai.tools.webSearch(),
  },
});
```

Use arrays when you need parameters-style compatibility tools, agent tools, or toolkits:

```typescript
const agent = defineAgent({
  name: "ToolkitAgent",
  instructions: "An agent with toolkit instructions.",
  model: "openai/gpt-4o-mini",
  tools: [myCalculatorToolkit, writerAgent.toTool()],
});
```

### Automatic Instructions

When an agent is initialized, its `getSystemMessage` method checks all the `Toolkit`s provided in the `tools` array. If a `Toolkit` has `addInstructions: true` and defines an `instructions` string, those instructions will be automatically appended to the agent's base description, forming part of the final system prompt sent to the LLM.

## Provider-defined Tools

Some providers expose their own tools (via the Vercel AI SDK).

- Register them in the same ToolSet object as user-defined AI SDK tools.
- They are not executable on your server via a VoltAgent `execute` handler. The provider manages their execution.
- Use user-defined tools plus `voltagent` metadata or `enhanceTool()` when you need VoltAgent hooks, tags, approval metadata, or application-side execution.

## Next Steps

- See the [Reasoning Tools](/docs/tools/reasoning-tool/) documentation for a practical example of a pre-built toolkit.
- Explore creating your own tools to connect agents to your specific data sources and APIs.
