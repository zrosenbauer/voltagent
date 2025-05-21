---
"@voltagent/google-ai": patch
---

feat: add provider options support including thinkingConfig - #138

```typescript
const response = await agent.generateText("Write a creative story.", {
  provider: {
    thinkingConfig: {
      thinkingBudget: 0,
    },
  },
});
```
