---
"@voltagent/core": patch
---

feat: Refactor Agent Hooks Signature to Use Single Argument Object

This change refactors the signature for all agent hooks (`onStart`, `onEnd`, `onToolStart`, `onToolEnd`, `onHandoff`) in `@voltagent/core` to improve usability, readability, and extensibility.

**Key Changes:**

- **Single Argument Object:** All hooks now accept a single argument object containing named properties (e.g., `{ agent, context, output, error }`) instead of positional arguments.
- **`onEnd` / `onToolEnd` Refinement:** The `onEnd` and `onToolEnd` hooks no longer use an `isError` flag or a combined `outputOrError` parameter. They now have distinct `output: <Type> | undefined` and `error: VoltAgentError | undefined` properties, making it explicit whether the operation or tool execution succeeded or failed.
- **Unified `onEnd` Output:** The `output` type for the `onEnd` hook (`AgentOperationOutput`) is now a standardized union type, providing a consistent structure regardless of which agent method (`generateText`, `streamText`, etc.) completed successfully.

**Migration Guide:**

If you have implemented custom agent hooks, you will need to update their signatures:

**Before:**

```typescript
const myHooks = {
  onStart: async (agent, context) => {
    /* ... */
  },
  onEnd: async (agent, outputOrError, context, isError) => {
    if (isError) {
      // Handle error (outputOrError is the error)
    } else {
      // Handle success (outputOrError is the output)
    }
  },
  onToolStart: async (agent, tool, context) => {
    /* ... */
  },
  onToolEnd: async (agent, tool, result, context) => {
    // Assuming result might contain an error or be the success output
  },
  // ...
};
```

**After:**

```typescript
import type {
  OnStartHookArgs,
  OnEndHookArgs,
  OnToolStartHookArgs,
  OnToolEndHookArgs,
  // ... other needed types
} from "@voltagent/core";

const myHooks = {
  onStart: async (args: OnStartHookArgs) => {
    const { agent, context } = args;
    /* ... */
  },
  onEnd: async (args: OnEndHookArgs) => {
    const { agent, output, error, context } = args;
    if (error) {
      // Handle error (error is VoltAgentError)
    } else if (output) {
      // Handle success (output is AgentOperationOutput)
    }
  },
  onToolStart: async (args: OnToolStartHookArgs) => {
    const { agent, tool, context } = args;
    /* ... */
  },
  onToolEnd: async (args: OnToolEndHookArgs) => {
    const { agent, tool, output, error, context } = args;
    if (error) {
      // Handle tool error (error is VoltAgentError)
    } else {
      // Handle tool success (output is the result)
    }
  },
  // ...
};
```

Update your hook function definitions to accept the single argument object and use destructuring or direct property access (`args.propertyName`) to get the required data.
