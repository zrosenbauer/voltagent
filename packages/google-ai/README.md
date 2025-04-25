# @voltagent/google-ai

VoltAgent Google AI provider integration using the Google Generative AI SDK (`@google/genai`).

This package allows you to use Google's Generative AI models (like Gemini) within your VoltAgent agents.

## Installation

```bash
npm install @voltagent/google-ai
# or
yarn add @voltagent/google-ai
# or
pnpm add @voltagent/google-ai
```

## Usage

You need to provide your Google Generative AI API key. You can get one from [Google AI Studio](https://aistudio.google.com/app/apikey).

```typescript
import { Agent } from "@voltagent/core";
import { GoogleGenAIProvider } from "@voltagent/google-ai";

// Ensure your API key is stored securely, e.g., in environment variables
const googleApiKey = process.env.GOOGLE_API_KEY;

// Instantiate the provider
const googleProvider = new GoogleGenAIProvider({
  apiKey: googleApiKey,
});

// Create an agent using a Google model
const agent = new Agent({
  name: "Google Assistant",
  description: "A helpful and friendly assistant that can answer questions clearly and concisely.",
  llm: googleProvider,
  model: "gemini-1.5-pro-latest", // Specify the desired Google model
});
```

### For using via VertexAi there are some nuances.

1. It will only work on a server side instance, and not on web.
2. The authentication needs to be handled via the [google-auth-libray](https://www.npmjs.com/package/google-auth-library)
3. Authentication in Vertex is still and open issue on the official SDK. [link](https://github.com/googleapis/js-genai/issues/426), [link-2](https://github.com/googleapis/js-genai/issues/417)

```typescript
const googleVertexProvider = new GoogleGenAIProvider({
  vertexai: true,
  project: "your-project-id",
  location: "your-project-location",
  googleAuthOptions: {
    credentials: {
      // never expose your private key in the code, this is just an example
      private_key: "my-private-key",
      // this is your service account email created in the google cloud console
      client_email: "my-client-email",
    },
  },
});

const agent = new Agent({
  name: "Google Assistant",
  description: "A helpful and friendly assistant that can answer questions clearly and concisely.",
  llm: googleProvider,
  model: "gemini-1.5-pro-latest", // Specify the desired Google model
});
```

## Configuration

The `GoogleGenAIProvider` accepts the following options in its constructor:

- `apiKey`: Your Google Generative AI API key (required).
- **(Advanced - Vertex AI)** `vertexai`: Set to `true` if using Vertex AI endpoints.
- **(Advanced - Vertex AI)** `project`: Your Google Cloud project ID (required if `vertexai` is `true`).
- **(Advanced - Vertex AI)** `location`: Your Google Cloud project location (required if `vertexai` is `true`).

## License

Licensed under the MIT License, Copyright © 2025-present VoltAgent.
