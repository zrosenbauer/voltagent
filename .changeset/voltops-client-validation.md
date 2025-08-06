---
"@voltagent/core": patch
---

fix: voltops client validation to prevent empty string keys from creating invalid clients

- VoltOpsClient now validates keys before initializing services
- Keys must not be empty and must have correct prefixes (pk* and sk*)
- Added hasValidKeys() method to check client validity
- Updated /setup-observability endpoint to update existing keys in .env file instead of adding duplicates
