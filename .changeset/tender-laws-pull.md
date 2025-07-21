---
"@voltagent/core": patch
---

fix: prevent duplicate column errors in LibSQL agent_history table initialization

Fixed a first-time database initialization error where the `migrateAgentHistorySchema` function was attempting to add `userId` and `conversationId` columns that already existed in newly created `agent_history` tables.

The issue occurred because:

- The CREATE TABLE statement now includes `userId` and `conversationId` columns by default
- The migration function was still trying to add these columns, causing "duplicate column name" SQLite errors

Changes:

- Added check in `migrateAgentHistorySchema` to skip migration if both columns already exist
- Properly set migration flag to prevent unnecessary migration attempts
- Ensured backward compatibility for older databases that need the migration
