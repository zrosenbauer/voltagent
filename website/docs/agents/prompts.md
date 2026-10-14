# Agent Instructions

## Overview

VoltAgent supports three approaches for defining agent instructions. Each approach addresses different requirements around flexibility, team collaboration, and deployment workflows.

### The Three Approaches

| Approach                 | Definition                    | Context Access | Team Workflow    |
| ------------------------ | ----------------------------- | -------------- | ---------------- |
| **Static Instructions**  | Hardcoded string              | No             | Code-based       |
| **Dynamic Instructions** | Function with runtime context | Yes            | Code-based       |
| **VoltOps Management**   | Externally managed prompts    | Yes            | Platform-managed |

## Static Instructions

Static instructions are literal strings assigned to the `instructions` property.

```typescript
import { defineAgent } from "@voltagent/core";

const agent = defineAgent({
  name: "SupportAgent",
  model: "openai/gpt-4o-mini",
  instructions: "You are a customer support agent. Help users with their questions.",
});
```

**Type signature:**

```typescript
instructions: string;
```

### When to Use

Use static instructions when:

- Agent behavior is consistent across all interactions
- No runtime context is needed
- Instructions rarely change
- Team members edit prompts through code reviews

Avoid when:

- Different users need different behavior
- Instructions depend on runtime data (user tier, time, location)
- Non-technical team members need to edit prompts
- You need prompt versioning outside of code commits

## Per-call Prompts and Instructions

Both `generateText` and `streamText` accept a string or native AI SDK `ModelMessage[]` in `prompt`. Use either `prompt` or `messages`, never both. `messages` also accepts VoltAgent's existing `UIMessage[]` input.

```ts
await agent.generateText({
  prompt: [{ role: "user", content: "Summarize this conversation" }],
  instructions: "Keep the answer under three sentences.",
});
```

Call-level `instructions` takes precedence over its deprecated `system` alias, including when `instructions` is an empty string. These instructions are added to the agent's configured instructions, memory, and other framework context; they do not replace the constructor's instructions.

Caller-provided system messages require `allowSystemInMessages: true`. Prefer `instructions` for application-owned system instructions. Only enable the flag for message histories you trust:

```ts
await agent.streamText({
  messages: [
    { role: "system", content: "Trusted application instructions" },
    { role: "user", content: "Hello" },
  ],
  allowSystemInMessages: true,
});
```

When enabled, the supplied system messages keep their position in the conversation. The flag applies to caller input, including positional calls and legacy object methods. VoltAgent's own instructions and memory preparation remain available without enabling it. Conflicting input fields, empty message arrays, and unapproved system messages throw AI SDK `InvalidPromptError` before context validation, memory preparation, or generation hooks.

## Dynamic Instructions

Dynamic instructions are functions that receive runtime context and return instructions. Add an agent-level [`contextSchema`](/docs/agents/context#schema-validation-and-types) to infer the types returned by `context.get()` and validate the merged context before this function runs. The same schema also types dynamic model and tool functions.

### Returning Strings

Functions can return a plain string based on context:

```typescript
const agent = defineAgent({
  name: "SupportAgent",
  model: "openai/gpt-4o-mini",
  instructions: async ({ context }) => {
    const userTier = context.get("userTier") || "basic";

    if (userTier === "premium") {
      return "You are a premium customer support agent. Provide detailed explanations and prioritize this customer's requests.";
    }
    return "You are a customer support agent. Provide helpful but concise answers.";
  },
});
```

**Using with context:**

```typescript
const premiumContext = new Map();
premiumContext.set("userTier", "premium");

const response = await agent.generateText("I need help", {
  context: premiumContext,
});
```

### Returning PromptContent Objects

Functions can also return `PromptContent` objects for text or chat-based instructions.

**Text type:**

```typescript
const agent = defineAgent({
  name: "SupportAgent",
  model: "openai/gpt-4o-mini",
  instructions: async ({ context }) => {
    return {
      type: "text",
      text: "You are a customer support agent.",
    };
  },
});
```

**Chat type with multiple messages:**

```typescript
import { defineAgent } from "@voltagent/core";

const agent = defineAgent({
  name: "ChatAgent",
  model: "openai/gpt-4o-mini",
  instructions: async () => {
    return {
      type: "chat",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant.",
        },
        {
          role: "user",
          content: "Hello!",
        },
        {
          role: "assistant",
          content: "Hi! How can I help you today?",
        },
      ],
    };
  },
});
```

**Chat type with provider-specific options:**

```typescript
import { defineAgent } from "@voltagent/core";

const agent = defineAgent({
  name: "CachedAgent",
  model: "anthropic/claude-3-7-sonnet-20250219",
  instructions: async () => {
    return {
      type: "chat",
      messages: [
        {
          role: "system",
          content: "Long system prompt that should be cached...",
          providerOptions: {
            anthropic: {
              cacheControl: { type: "ephemeral", ttl: "5m" },
            },
          },
        },
      ],
    };
  },
});
```

**Type signature:**

```typescript
instructions: (options: DynamicValueOptions) => Promise<string | PromptContent>;

interface DynamicValueOptions {
  context: Map<string | symbol, unknown>;
  headers?: Record<string, string>;
  prompts: PromptHelper;
}

interface PromptContent {
  type: "text" | "chat";
  text?: string;
  messages?: ChatMessage[];
}
```

### When to Use

Use dynamic instructions when:

- Agent behavior depends on user properties (tier, role, preferences)
- Instructions need runtime data (time, location, session state)
- Different tenants require different behavior
- Conditional logic determines instruction content

Avoid when:

- Multiple non-technical stakeholders need to edit prompts
- You need prompt version history outside of code
- Collaborative prompt editing is required
- Prompts should update without deploying code

## VoltOps Prompt Management

VoltOps separates prompt content from application code. Prompts are created and versioned in the VoltOps platform, then fetched at runtime.

For complete documentation on VoltOps Prompt Management, see:

- [Prompt Management Overview](/prompt-engineering-docs/) - Creating, versioning, labels, and managing prompts
- [Usage Guide](/prompt-engineering-docs/usage/) - Integration with agents, caching, variables, and error handling

### Quick Example

```typescript
import { defineAgent, voltagent, VoltOpsClient } from "@voltagent/core";

const voltOpsClient = new VoltOpsClient({
  publicKey: process.env.VOLTAGENT_PUBLIC_KEY,
  secretKey: process.env.VOLTAGENT_SECRET_KEY,
});

const agent = defineAgent({
  name: "SupportAgent",
  model: "openai/gpt-4o-mini",
  instructions: async ({ prompts }) => {
    return await prompts.getPrompt({
      promptName: "customer-support-prompt",
      label: "production",
      variables: { companyName: "VoltAgent Corp" },
    });
  },
});

await voltagent({
  agents: { agent },
  voltOpsClient: voltOpsClient,
}).ready();
```

### When to Use

Use VoltOps when:

- Non-technical team members edit prompts
- Audit trails and approval workflows are required
- Multiple environments need different prompt versions
- Prompt analytics and monitoring are needed

Avoid when:

- External dependencies are not acceptable
- Offline operation is required

## Comparison

| Feature                   | Static      | Dynamic     | VoltOps            |
| ------------------------- | ----------- | ----------- | ------------------ |
| **Type**                  | String      | Function    | External platform  |
| **Context Access**        | No          | Yes         | Yes (via function) |
| **Runtime Flexibility**   | None        | Full        | Full               |
| **Team Collaboration**    | Code review | Code review | Platform UI        |
| **Version Control**       | Git         | Git         | VoltOps + Git      |
| **Non-technical Editing** | No          | No          | Yes                |
| **Analytics**             | No          | No          | Yes                |
| **Offline Support**       | Yes         | Yes         | No                 |
| **External Dependency**   | No          | No          | Yes                |

## Examples

**Static (solo developer, consistent behavior):**

```typescript
const agent = defineAgent({
  instructions: "You are a code reviewer. Focus on security and performance.",
  model: "openai/gpt-4o-mini",
});
```

**Dynamic (user-specific behavior):**

```typescript
const agent = defineAgent({
  instructions: async ({ context }) => {
    const tier = context.get("tier");
    return tier === "premium"
      ? "You are a premium support agent with deep technical expertise."
      : "You are a support agent providing efficient solutions.";
  },
  model: "openai/gpt-4o-mini",
});
```

**VoltOps (team collaboration, versioning):**

```typescript
const agent = defineAgent({
  instructions: async ({ prompts }) => {
    return await prompts.getPrompt({
      promptName: "customer-support-agent",
      label: process.env.NODE_ENV === "production" ? "production" : "development",
    });
  },
  model: "openai/gpt-4o-mini",
  voltOpsClient: voltOpsClient,
});
```
