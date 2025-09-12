---
"@voltagent/server-core": patch
---

feat: add ModelMessage format support to server API endpoints

Server endpoints now accept ModelMessage format (messages with `role` and `content` fields) in addition to UIMessage format and plain strings. This allows clients to send messages in either format:

- **String**: Direct text input
- **UIMessage[]**: AI SDK UIMessage format with `parts` structure
- **ModelMessage[]**: AI SDK ModelMessage format with `role` and `content` structure

The change adopts a flexible validation approach similar to Mastra, where the server handlers pass input directly to agents which handle the conversion. API schemas and documentation have been updated to reflect this support.

Example:

```typescript
// All three formats are now supported
await fetch("/agents/assistant/text", {
  method: "POST",
  body: JSON.stringify({
    // Option 1: String
    input: "Hello",

    // Option 2: UIMessage format
    input: [{ role: "user", parts: [{ type: "text", text: "Hello" }] }],

    // Option 3: ModelMessage format
    input: [{ role: "user", content: "Hello" }],
  }),
});
```
