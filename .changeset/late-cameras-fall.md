---
"@voltagent/core": patch
---

feat: Enhance `createPrompt` with Template Literal Type Inference

Improved the `createPrompt` utility to leverage TypeScript's template literal types. This provides strong type safety by:

- Automatically inferring required variable names directly from `{{variable}}` placeholders in the template string.
- Enforcing the provision of all required variables with the correct types at compile time when calling `createPrompt`.

This significantly reduces the risk of runtime errors caused by missing or misspelled prompt variables.
