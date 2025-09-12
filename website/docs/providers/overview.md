---
title: Providers Overview
slug: /providers/overview
---

# Providers Overview

VoltAgent 1.x integrates directly with the ai-sdk. There is no custom provider abstraction or `llm` prop. You pass an ai-sdk `LanguageModel` to your `Agent` via the `model` prop, and configure per-call settings in method options.

- Use any ai-sdk provider package: OpenAI, Anthropic, Google, Groq, Mistral, Vertex, Bedrock, etc.
- Cross-provider consistency for streaming, tools, and structured outputs.

See Getting Started for installation and examples:

**[Providers & Models](/docs/getting-started/providers-models)**

## Quick Example

```ts
import { Agent } from "@voltagent/core";
import { openai } from "@ai-sdk/openai";

const agent = new Agent({
  name: "assistant",
  instructions: "Helpful and concise",
  model: openai("gpt-4o-mini"),
});
```

## Legacy Packages

The previous `@voltagent/*-ai` provider packages and `@voltagent/vercel-ai` are deprecated/removed in favor of the official ai-sdk providers. Migrate to ai-sdk packages as outlined in the migration guide.
