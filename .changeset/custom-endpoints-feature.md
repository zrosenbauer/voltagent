---
"@voltagent/core": patch
---

feat: add custom endpoints feature to VoltAgent API server, allowing developers to extend the API with their own endpoints

```typescript
import { VoltAgent } from "@voltagent/core";

new VoltAgent({
  agents: { myAgent },
  customEndpoints: [
    {
      path: "/api/health",
      method: "get",
      handler: async (c) => {
        return c.json({
          success: true,
          data: { status: "healthy" },
        });
      },
    },
  ],
});
```
