---
"@voltagent/core": patch
---

fix: prevent `ReferenceError: module is not defined` in ES module environments by adding guards around the CommonJS-specific `require.main === module` check in the main entry point.
