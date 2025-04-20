---
title: Hooks
slug: /agents/hooks
---

# Hooks

Hooks provide points within the agent's execution lifecycle where you can inject custom logic. They allow you to run code before an agent starts processing, after it finishes, before and after it uses a tool, or when tasks are handed off between agents in a multi-agent system.

This is useful for logging, monitoring, adding validation, managing resources, or modifying behavior.

## Creating and Using Hooks

The recommended way to define hooks is using the `createHooks` helper function. This creates a typed hooks object that can be passed to one or more agents during initialization.

```ts
import { Agent, createHooks, type AgentTool, type AgentOutput } from "@voltagent/core";
import { VercelAIProvider } from "@voltagent/vercel-ai";
import { openai } from "@ai-sdk/openai";

// Define a collection of hooks using the helper
const myAgentHooks = createHooks({
  /**
   * Called before the agent starts processing a request.
   * @param agent - The Agent instance that is starting.
   */
  onStart: async (agent: Agent<any>) => {
    console.log(`[Hook] Agent ${agent.name} starting interaction at ${new Date().toISOString()}`);
    // Example: Initialize request-specific resources
  },

  /**
   * Called after the agent successfully finishes processing a request.
   * @param agent - The Agent instance that finished.
   * @param output - The final output object from the agent method (structure depends on the method called, e.g., generateText vs generateObject).
   */
  onEnd: async (agent: Agent<any>, output: AgentOutput) => {
    console.log(`[Hook] Agent ${agent.name} finished processing.`);
    // Example: Log usage or analyze the result
    if (output.usage) {
      console.log(`[Hook] Token Usage: ${output.usage.total_tokens}`);
    }
    if (output.text) {
      console.log(`[Hook] Final text length: ${output.text.length}`);
    }
  },

  /**
   * Called just before a tool's execute function is called.
   * @param agent - The Agent instance using the tool.
   * @param tool - The AgentTool definition object that is about to be executed.
   */
  onToolStart: async (agent: Agent<any>, tool: AgentTool) => {
    console.log(`[Hook] Agent ${agent.name} starting tool: ${tool.name}`);
    // Example: Validate tool inputs or log intent
  },

  /**
   * Called after a tool's execute function successfully completes.
   * @param agent - The Agent instance that used the tool.
   * @param tool - The AgentTool definition object that executed.
   * @param result - The result returned by the tool's execute function.
   */
  onToolEnd: async (agent: Agent<any>, tool: AgentTool, result: any) => {
    console.log(`[Hook] Tool ${tool.name} completed with result:`, result);
    // Example: Log tool output or trigger follow-up actions
  },

  /**
   * Called when a task is handed off from a source agent to this agent (in sub-agent scenarios).
   * @param agent - The Agent instance receiving the handoff.
   * @param sourceAgent - The Agent instance that initiated the handoff.
   */
  onHandoff: async (agent: Agent<any>, sourceAgent: Agent<any>) => {
    console.log(`[Hook] Task handed off from ${sourceAgent.name} to ${agent.name}`);
    // Example: Track collaboration flow in multi-agent systems
  },
});

// Define a placeholder provider for the example
const provider = new VercelAIProvider();

// Assign the hooks when creating an agent
const agentWithHooks = new Agent({
  name: "My Agent with Hooks",
  description: "An assistant demonstrating hooks",
  llm: provider,
  model: openai("gpt-4o"),
  // Pass the hooks object during initialization
  hooks: myAgentHooks,
});

// Alternatively, define hooks inline (less reusable)
const agentWithInlineHooks = new Agent({
  name: "Inline Hooks Agent",
  description: "Another assistant",
  llm: provider,
  model: openai("gpt-4o"),
  hooks: {
    onStart: async (agent) => {
      /* ... */
    },
    // ... other inline hooks ...
  },
});
```

## Available Hooks

### `onStart`

- **Triggered:** Before the agent begins processing a request (`generateText`, `streamText`, etc.).
- **Parameters:** `(agent: Agent)`
- **Use Cases:** Initialization logic, request logging, setting up request-scoped resources.

### `onEnd`

- **Triggered:** After the agent successfully completes processing a request.
- **Parameters:** `(agent: Agent, output: AgentOutput)`
- **Use Cases:** Cleanup logic, logging completion status and results, analyzing final output, recording usage statistics.
- **Note:** The structure of the `output` object depends on the primary agent method called (e.g., `{ text: string, usage: ... }` for `generateText`, `{ object: T, usage: ... }` for `generateObject`).

### `onToolStart`

- **Triggered:** Just before an agent executes a specific tool.
- **Parameters:** `(agent: Agent, tool: AgentTool)`
- **Use Cases:** Logging tool usage intent, validating tool inputs (though typically handled by Zod schema), modifying tool arguments (use with caution).

### `onToolEnd`

- **Triggered:** After a tool's `execute` function successfully completes.
- **Parameters:** `(agent: Agent, tool: AgentTool, result: any)`
- **Use Cases:** Logging tool results, post-processing tool output before it's sent back to the LLM, triggering subsequent actions based on tool results.

### `onHandoff`

- **Triggered:** When one agent delegates a task to another agent (using the `delegate_task` tool in a sub-agent setup).
- **Parameters:** `(agent: Agent, sourceAgent: Agent)`
- **Use Cases:** Tracking and visualizing workflow in multi-agent systems, adding context during agent collaboration.

## Asynchronous Hooks and Error Handling

- **Async Nature:** Hooks can be defined as `async` functions. VoltAgent will `await` the completion of each hook before proceeding. Be mindful that long-running asynchronous operations within hooks can add latency to the overall agent response time.
- **Error Handling:** If an error is thrown _inside_ a hook function and not caught within the hook itself, it may interrupt the agent's execution flow. It's recommended to handle potential errors within your hook logic using `try...catch` if necessary, or ensure hooks are designed to be reliable.

## Common Use Cases

Hooks enable a variety of powerful patterns:

1.  **Logging & Observability**: Track agent execution steps, timings, inputs, and outputs for monitoring and debugging.
2.  **Analytics**: Collect detailed usage data (token counts, tool usage frequency, etc.) for analysis.
3.  **Request/Response Modification**: (Use with caution) Modify inputs before processing or outputs after generation.
4.  **State Management**: Initialize or clean up request-specific state or resources.
5.  **Workflow Orchestration**: Trigger external actions or notifications based on agent events (e.g., notify on tool failure).
