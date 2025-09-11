# Multi-modal Capabilities

VoltAgent supports multi-modal interactions, allowing agents to process and understand inputs that combine different types of content, primarily text and images. This enables more complex and richer interactions, such as asking questions about an uploaded image or providing visual context alongside text prompts.

## `BaseMessage` Content Structure

The core of multi-modal input lies in the structure of the `content` field within a `BaseMessage` object. While simple text interactions might use a plain string for `content`, multi-modal inputs require `content` to be an **array** of specific content part objects.

```typescript
import type { BaseMessage } from "@voltagent/core";

// Basic Text Message
const textMessage: BaseMessage = {
  role: "user",
  content: "Describe this image for me.",
};

// Multi-modal Message (Text + Image)
const multiModalMessage: BaseMessage = {
  role: "user",
  content: [
    {
      type: "text",
      text: "What is shown in this image?",
    },
    {
      type: "image",
      image: "data:image/jpeg;base64,/9j/4AAQSk...", // Base64 string or Data URI
      mimeType: "image/jpeg", // Optional but recommended
    },
  ],
};
```

### Content Part Types

When `content` is an array, each element must be an object with a `type` field indicating the kind of content. Common types include:

1.  **Text Part:**
    - `type: 'text'`
    - `text: string` - The actual text content.

    ```typescript
    { type: 'text', text: 'This is the text part.' }
    ```

2.  **Image Part:**
    - `type: 'image'`
    - `image: string` - The image data, typically provided as a **Base64 encoded string** or a **Data URI** (e.g., `data:image/png;base64,...`).
    - `mimeType?: string` - (Optional but Recommended) The MIME type of the image (e.g., `image/jpeg`, `image/png`, `image/webp`). Helps the provider interpret the data correctly.
    - `alt?: string` - (Optional) Alternative text describing the image.

    ```typescript
    {
      type: 'image',
      image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...',
      mimeType: 'image/png',
      alt: 'A cute cat sleeping'
    }
    ```

3.  **File Part (Used less commonly for direct LLM input, but supported):**
    - `type: 'file'`
    - `data: string` - Base64 encoded file data.
    - `filename: string` - Original filename.
    - `mimeType: string` - The MIME type of the file (e.g., `application/pdf`).
    - `size?: number` - File size in bytes.

    ```typescript
    {
      type: 'file',
      data: 'JVBERi0xLjQKJ...',
      filename: 'report.pdf',
      mimeType: 'application/pdf',
      size: 102400
    }
    ```

You can mix different part types within the `content` array.

## Sending Multi-modal Input to Agents

To send multi-modal input, construct your `messages` array ensuring that the `content` field for relevant messages is an array of content parts, and pass it to the agent's generation methods (`generateText`, `streamText`, `generateObject`, etc.).

```typescript
import { Agent } from "@voltagent/core";
import { openai } from "@ai-sdk/openai";

// Initialize an agent with a vision-capable model
const agent = new Agent({
  name: "vision-assistant",
  instructions: "Answer based on the image and text.",
  model: openai("gpt-4o-mini"), // or another vision-capable ai-sdk model
});

async function askAboutImage(imageUrlOrBase64: string, question: string) {
  const messages: BaseMessage[] = [
    {
      role: "user",
      content: [
        { type: "text", text: question },
        {
          type: "image",
          image: imageUrlOrBase64, // Can be Data URI or Base64 string
          // Ensure you provide mimeType if not using a Data URI
          // mimeType: 'image/jpeg'
        },
      ],
    },
  ];

  try {
    // Use generateText for a single response
    const response = await agent.generateText(messages);
    console.log("Agent Response:", response);

    // Or use streamText for streaming responses
    // const streamResponse = await agent.streamText(messages);
    // for await (const chunk of streamResponse.textStream) {
    //   process.stdout.write(chunk);
    // }
    // console.log(); // Newline after stream
  } catch (error) {
    console.error("Error generating response:", error);
  }
}

// Example usage:
const catImageBase64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQE...";
askAboutImage(catImageBase64, "What breed is this cat?");
```

## Provider Support & Considerations

Multi-modal support depends on the specific ai-sdk provider and model you choose.

- Not all models accept image inputs.
- Check provider docs for supported formats, limits, and costs.

Common vision-capable options in ai-sdk:

- OpenAI: `gpt-4o`, `gpt-4o-mini`
- Google: `gemini-1.5-pro`, `gemini-1.5-flash`
- Anthropic: latest Claude 3 models with vision

See [Providers & Models](/docs/getting-started/providers-models) for details.

## VoltOps Platform Integration

![VoltAgent VoltOps Platform Multi-modal Demo](https://cdn.voltagent.dev/docs/multi-modal-demo.gif)

The [VoltAgent VoltOps Platform](https://console.voltagent.dev/) provides a user-friendly way to interact with multi-modal agents:

- **Assistant Chat:** The chat interface includes an attachment button (📎).
- **Uploading:** Clicking the button allows you to select one or more image files (and potentially other supported file types) from your computer.
- **Preview:** Uploaded files are shown as previews below the text input area.
- **Sending:** When you send the message, the Console automatically converts the uploaded files into the appropriate `ImagePart` or `FilePart` format (using Base64 data URIs) and constructs the `BaseMessage` with the `content` field as an array containing both your typed text and the file/image parts. This structured message is then sent to the agent API.

This provides a seamless way for you and your users to test and utilize the multi-modal capabilities of your agents directly within the Console.
