---
title: Building a Data-Aware Chatbot with VoltAgent and Peaka MCP
description: Learn how to integrate Peaka's data integration capabilities into a VoltAgent AI application using the Multi-Compute Protocol (MCP).
slug: data-aware-chatbot-voltagent-peaka
tags: [mcp, peaka, integration, tutorial]
image: https://cdn.voltagent.dev/blog/peaka-mcp-voltagent/social.png # Placeholder - Update if needed
authors: omeraplak
---

Hey everyone! Today, I want to share my experience building a cool AI agent that can directly interact with data sources, thanks to the synergy between **VoltAgent** and **Peaka**.

## First, What's Peaka?

Before diving into the code, let me quickly introduce [Peaka](https://www.peaka.com/). I recently learned about them, and their mission is pretty compelling: **democratizing data integration**. In simple terms, Peaka acts like a 'logical data warehouse'. It lets you connect various data sources (databases, APIs, spreadsheets, etc.) into a single layer. From there, you can query across these sources using SQL or even natural language, and expose the combined data via APIs.

Think about how complex and expensive traditional data integration can be. Peaka aims to provide a more accessible and user-friendly alternative, especially for smaller teams or those who don't want to manage intricate data pipelines. Their vision is to be an all-in-one platform for data access and integration.

## And What's VoltAgent?

Now, onto VoltAgent. If you haven't heard of it, VoltAgent is a framework I've been using to build AI applications, like chatbots or assistants. It provides the core engine (`@voltagent/core`) and lets you add functionalities like voice (`@voltagent/voice`) or connect to various LLMs (like OpenAI's GPT models, Google's Gemini, etc.). It simplifies many of the tricky parts of building AI agents, like managing conversations (memory) and connecting them to external tools or APIs.

VoltAgent hits a sweet spot – it gives you more structure than building from scratch with raw AI SDKs, but way more flexibility than simple no-code builders. Plus, it comes with the [VoltAgent Console](https://console.voltagent.dev/), a web interface to monitor and interact with your agents, which is super handy.

## Building an Agent That Talks to Peaka Data

So, my goal was to create a VoltAgent agent that could answer questions based on data managed by Peaka. This is where Peaka's **MCP (Model Context Protocol)** comes in. MCP allows different systems to communicate and exchange tasks – in our case, letting VoltAgent ask Peaka to run data queries.

Let's walk through how I set this up.

### 1. Creating the VoltAgent Project

First, I needed a basic VoltAgent project. The quickest way is using the `create-voltagent-app` tool:

```bash
npm create voltagent-app@latest my-peaka-agent
# Follow the prompts
cd my-peaka-agent
```

This sets up the basic structure, installs dependencies, and gives you a starting point.

### 2. Setting up the Peaka MCP Integration

Now for the core part. Inside the `src/index.ts` file (or wherever your main agent logic is), I needed to configure VoltAgent to use Peaka's MCP server.

Here's the essential code:

```typescript title="src/index.ts"
import { VoltAgent, Agent, MCPConfiguration } from "@voltagent/core";
import { VercelAIProvider } from "@voltagent/vercel-ai"; // Using Vercel AI SDK for LLM interaction
import { openai } from "@ai-sdk/openai"; // Using OpenAI's model

// 1. Configure the Peaka MCP Server
const mcp = new MCPConfiguration({
  id: "peaka-mcp", // An identifier for this MCP setup
  servers: {
    // Define the Peaka server
    peaka: {
      type: "stdio", // Communication via standard input/output
      command: "npx", // Command to run the server
      // Use npx to fetch and run the latest Peaka MCP server package
      args: ["-y", "@peaka/mcp-server-peaka@latest"],
      // Pass necessary environment variables, like your Peaka API key
      env: { PEAKA_API_KEY: process.env.PEAKA_API_KEY || "" },
    },
  },
});

// 2. Asynchronously get tools exposed by the MCP server
(async () => {
  const tools = await mcp.getTools(); // Fetches available tools/functions from Peaka

  // 3. Define the VoltAgent Agent
  const agent = new Agent({
    name: "Peaka Data Assistant",
    description: "An assistant that can query Peaka's sample data.",
    llm: new VercelAIProvider(), // Specify the LLM provider
    model: openai("gpt-4o-mini"), // Specify the LLM model
    tools, // <-- Crucially, pass the tools obtained from Peaka MCP here!
  });

  // 4. Initialize VoltAgent
  new VoltAgent({
    agents: {
      // Register the agent
      agent,
    },
    // You might also need to register the MCP configuration if not done automatically
    // mcp: [mcp] // Check VoltAgent docs for the exact way to register MCP configs
  });

  console.log("VoltAgent initialized with Peaka MCP tools.");
})();
```

Let's break this down:

1.  **`MCPConfiguration`**: This is where I defined how VoltAgent should connect to the Peaka MCP server. I gave it an ID (`peaka-mcp`) and specified the server details. We're using `stdio` communication, running the server via `npx` (which conveniently fetches the latest `@peaka/mcp-server-peaka`), and passing the `PEAKA_API_KEY` from environment variables.
2.  **`mcp.getTools()`**: This is neat. VoltAgent communicates with the Peaka MCP server (which starts up when the agent runs) and asks it what capabilities (tools) it offers. For Peaka, this usually includes tools for querying data sources connected to your Peaka account.
3.  **`new Agent(...)`**: I defined my agent, giving it a name and description. The important part is passing the `tools` obtained from `mcp.getTools()` to the agent's configuration. This tells the agent, "Hey, you can use these Peaka functions!"
4.  **`new VoltAgent(...)`**: Finally, I initialized the main VoltAgent application, registering my `agent`.

Don't forget to create a `.env` file in your project root and add your Peaka API key:

```.env title=".env"
PEAKA_API_KEY=your_peaka_api_key_here
# Add your OpenAI key too if you haven't already
OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Running the Agent and Querying Data

With the code and `.env` file ready, I just needed to run the agent:

```bash
npm run dev
```

This command starts the VoltAgent server, which in turn starts the Peaka MCP server process. You'll see logs indicating both are running.

Now for the fun part!

1.  Go to the [VoltAgent Console](https://console.voltagent.dev).
2.  Find your agent (e.g., "Peaka Data Assistant").
3.  Open the chat interface for the agent.
4.  Ask a question that requires Peaka data! Since the MCP server connects to Peaka (which might have access to sample data or your connected sources), I could ask something like:

    > "What is my daily balance on Stripe?"

Behind the scenes, VoltAgent's LLM understands the request involves data querying. It sees the tools provided by the Peaka MCP server, selects the appropriate one (e.g., a SQL query tool), formulates the query, sends it via MCP to the Peaka server, gets the result back, and then formats a natural language response for me in the chat.

Here's how that interaction looks:

_[Placeholder for a GIF showing the VoltAgent Console interaction: finding the agent, opening chat, typing the query "What is my daily balance on Stripe?", and receiving the data-based response.]_

## Wrapping Up

Integrating Peaka's data capabilities directly into a VoltAgent chatbot using MCP was surprisingly straightforward. It opens up possibilities for building AI agents that aren't just conversational but truly data-aware, capable of fetching, analyzing, and presenting information from diverse sources managed by Peaka. This combination feels powerful for creating internal tools, customer support bots that access real-time data, or any application where AI needs to interact with complex datasets.

Give it a try and see what you can build!
