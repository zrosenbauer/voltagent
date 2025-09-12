---
"@voltagent/libsql": major
---

# LibSQL 1.x — Memory Adapter

Replaces `LibSQLStorage` with Memory V2 adapter and adds vector/observability adapters.

Full migration guide: [Migration Guide](https://voltagent.dev/docs/getting-started/migration-guide/)

## Migrate storage

Before (0.1.x):

```ts
import { LibSQLStorage } from "@voltagent/libsql";

const agent = new Agent({
  // ...
  memory: new LibSQLStorage({ url: "file:./.voltagent/memory.db" }),
});
```

After (1.x):

```ts
import { Memory } from "@voltagent/core";
import { LibSQLMemoryAdapter } from "@voltagent/libsql";

const agent = new Agent({
  // ...
  memory: new Memory({
    storage: new LibSQLMemoryAdapter({ url: "file:./.voltagent/memory.db" }),
  }),
});
```

## Optional (new)

```ts
import { LibSQLVectorAdapter } from "@voltagent/libsql";
// Add vector search: new Memory({ vector: new LibSQLVectorAdapter({ ... }) })
```
