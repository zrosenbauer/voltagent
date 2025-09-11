---
"@voltagent/postgres": major
---

# PostgreSQL 1.x — Memory Adapter

The old `PostgresStorage` API is replaced by a Memory V2 adapter.

Full migration guide: [Migration Guide](https://voltagent.dev/docs/getting-started/migration-guide/)

## Migrate

Before (0.1.x):

```ts
import { PostgresStorage } from "@voltagent/postgres";

const agent = new Agent({
  // ...
  memory: new PostgresStorage({ connection: process.env.DATABASE_URL! }),
});
```

After (1.x):

```ts
import { Memory } from "@voltagent/core";
import { PostgreSQLMemoryAdapter } from "@voltagent/postgres";

const agent = new Agent({
  // ...
  memory: new Memory({
    storage: new PostgreSQLMemoryAdapter({
      connection: process.env.DATABASE_URL!,
    }),
  }),
});
```
