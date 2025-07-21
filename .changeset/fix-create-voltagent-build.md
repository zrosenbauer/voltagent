---
"create-voltagent-app": patch
---

fix: include create-voltagent-app in build:all script

The create-voltagent-app package was not being built during GitHub Actions release workflow because it doesn't have the @voltagent/ scope prefix. Added explicit scope to build:all command to ensure the CLI tool is properly built before publishing.
