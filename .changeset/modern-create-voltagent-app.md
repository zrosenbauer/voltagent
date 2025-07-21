---
"create-voltagent-app": minor
---

feat: modernize create-voltagent-app CLI

- Add AI provider selection (OpenAI, Anthropic, Google, Groq, Mistral, Ollama)
- Add optional API key input with skip option
- Automatic .env file generation based on selected provider
- Package manager detection - only show installed ones
- Auto-install dependencies after project creation
- Full Windows support with cross-platform commands
- Ollama local LLM support with default configuration
- Dynamic template generation based on selected AI provider
