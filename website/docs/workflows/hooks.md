---
sidebar_label: "Hooks"
---

# Workflow Hooks

Workflow hooks provide a powerful mechanism to tap into the lifecycle of a workflow's execution. They allow you to run custom code at key moments, such as before or after a step, or at the start and end of the entire workflow. This is incredibly useful for logging, metrics, custom analytics, or triggering external processes.

## How Hooks Work

You can define hooks in the `createWorkflowChain` configuration object. Each hook is an async function that receives the current state of the workflow, giving you access to the data, execution ID, and other contextual information.

```typescript
import { createWorkflowChain } from "@voltagent/core";
import { z } from "zod";

const workflow = createWorkflowChain({
  id: "hooks-demo",
  name: "Hooks Demo",
  input: z.object({ value: z.number() }),
  result: z.object({ result: z.number() }),
  hooks: {
    // --- Workflow-level hooks ---
    onStart: async (state) => {
      console.log(`[onStart] Workflow starting with value: ${state.data.value}`);
    },
    onEnd: async (state) => {
      console.log(`[onEnd] Workflow finished with status: ${state.status}`);
      if (state.status === "completed") {
        console.log(`[onEnd] Final result: ${state.result.result}`);
      }
    },
    // --- Step-level hooks ---
    onStepStart: async (state) => {
      console.log(`[onStepStart] About to run step with data:`, state.data);
    },
    onStepEnd: async (state) => {
      console.log(`[onStepEnd] Just finished a step. Current data:`, state.data);
    },
  },
}).andThen({
  id: "double-the-value",
  execute: async ({ value }) => {
    return { result: value * 2 };
  },
});

// Run the workflow to see the hooks in action
await workflow.run({ value: 10 });
```

### Expected Output

When you run the code above, you'll see the following output in your console, demonstrating the order in which the hooks are executed:

```
[onStart] Workflow starting with value: 10
[onStepStart] About to run step with data: { value: 10 }
[onStepEnd] Just finished a step. Current data: { result: 20 }
[onEnd] Workflow finished with status: completed
[onEnd] Final result: 20
```

## Available Hooks

There are four hooks available in the workflow lifecycle:

| Hook              | Trigger                                                                                                  | `state` Argument                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **`onStart`**     | Called once, just before the first step of the workflow begins.                                          | Contains the initial input data and execution context.                                                  |
| **`onEnd`**       | Called once, after the workflow has completed, either successfully or with an error.                     | Contains the final result (if successful), status (`completed` or `error`), and error details (if any). |
| **`onStepStart`** | Called before each individual step in the workflow executes.                                             | Contains the data that will be passed into the step.                                                    |
| **`onStepEnd`**   | Called after each individual step has successfully completed. It does not run if a step throws an error. | Contains the data that was returned from the step, which is now merged into the workflow's data.        |

## Use Cases

1.  **Logging & Debugging**: Log the input and output of each step to get a detailed trace of a workflow's execution.
2.  **Performance Monitoring**: Measure the time it takes for each step to run by recording timestamps in `onStepStart` and `onStepEnd`.
3.  **Metrics & Analytics**: Increment counters or send events to an analytics service (like Prometheus or Datadog) to monitor workflow performance and behavior.
4.  **Resource Management**: Set up or tear down resources (like database connections) at the beginning and end of a workflow using `onStart` and `onEnd`.
5.  **Notifications**: Send a notification (e.g., via Slack or email) when a workflow completes or fails.
