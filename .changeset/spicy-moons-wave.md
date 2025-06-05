---
"@voltagent/core": patch
---

Added the 'purpose' field to agents (subagents) to provide a limited description of the purpose of the agent to the supervisor instead of passing the instructions for the subagent directly to the supervisor

```ts
const storyAgent = new Agent({
  name: "Story Agent",
  purpose: "A story writer agent that creates original, engaging short stories.",
  instructions: "You are a creative story writer. Create original, engaging short stories.",
  llm: new VercelAIProvider(),
  model: openai("gpt-4o-mini"),
});
```

> The supervisor agent's system prompt is automatically modified to include instructions on how to manage its subagents effectively. It lists the available subagents and their `purpose` and provides guidelines for delegation, communication, and response aggregation.
