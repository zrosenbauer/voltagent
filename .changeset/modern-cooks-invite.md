---
"@voltagent/internal": patch
"@voltagent/core": patch
---

fix: Migrate to using `safeStringify` to prevent issues using the JSON.stringify/parse method, in addition use structuredClone via Nodejs instead legacy method that errors
