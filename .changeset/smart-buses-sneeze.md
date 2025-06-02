---
"@voltagent/core": patch
---

fix: zod import issue - #161

Fixed incorrect zod import that was causing OpenAPI type safety errors. Updated to use proper import from @hono/zod-openapi package.
