---
"@voltagent/core": patch
---

feat(core): MCPServerConfig timeouts - #363.

Add MCPServerConfig timeouts

```ts
const mcpConfig = new MCPConfiguration({
  servers: {
    filesystem: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", path.resolve("./data")],
      timeout: 10000,
    },
  },
});
```
