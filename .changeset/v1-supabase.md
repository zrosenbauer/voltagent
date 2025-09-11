---
"@voltagent/supabase": major
---

# Supabase 1.x — Memory Adapter

Supabase storage now implements the Memory V2 adapter pattern.

Full migration guide: [Migration Guide](https://voltagent.dev/docs/getting-started/migration-guide/)

## Migrate

Before (0.1.x):

```ts
import { SupabaseMemory } from "@voltagent/supabase";

const agent = new Agent({
  // ...
  memory: new SupabaseMemory({ url: process.env.SUPABASE_URL!, key: process.env.SUPABASE_KEY! }),
});
```

After (1.x):

```ts
import { Memory } from "@voltagent/core";
import { SupabaseMemoryAdapter } from "@voltagent/supabase";

const agent = new Agent({
  // ...
  memory: new Memory({
    storage: new SupabaseMemoryAdapter({
      url: process.env.SUPABASE_URL!,
      key: process.env.SUPABASE_KEY!,
    }),
  }),
});
```
