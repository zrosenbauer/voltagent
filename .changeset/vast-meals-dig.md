---
"@voltagent/google-ai": patch
---

fix: Add index signature `[key: string]: any;` to `GoogleProviderRuntimeOptions`. This allows passing arbitrary extra options to the Google AI provider, alongside refactoring types to prevent TypeScript deep instantiation errors.
