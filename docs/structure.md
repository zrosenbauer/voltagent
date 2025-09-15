# Repository Structure

This monorepo is organized using pnpm workspaces and Lerna with the following main directories:

## Overview

```
voltagent/
├── packages/       # Core packages and integrations
├── examples/       # Example implementations
├── website/        # Documentation website and marketplace
├── docs/           # Project documentation
├── scripts/        # Build and utility scripts
├── .changeset/     # Changeset configuration
└── package.json    # Root package configuration
```

## Details

### `packages/`

Core packages, AI provider integrations, and utilities:

#### Core Framework

- **core** - Main VoltAgent framework with agent orchestration, memory management, tools, and observability
- **internal** - Internal utilities and shared types used across packages
- **shared** - Shared constants and configurations

#### Server Implementations

- **server-core** - Core server handlers, schemas, and business logic
- **server-hono** - Hono-based server implementation with API routes

#### AI Provider Integrations

- **anthropic-ai** - Anthropic Claude integration
- **google-ai** - Google AI (Gemini) integration
- **groq-ai** - Groq AI integration
- **vercel-ai** - Vercel AI SDK integration
- **xsai** - XS AI integration

#### Database & Storage

- **postgres** - PostgreSQL database integration
- **libsql** - LibSQL database integration
- **supabase** - Supabase client integration

#### Observability & Logging

- **logger** - Universal logger implementation
- **langfuse-exporter** - LangFuse telemetry exporter
- **vercel-ai-exporter** - Vercel AI telemetry exporter

#### Developer Tools

- **cli** - VoltAgent CLI for project scaffolding and management
- **create-voltagent-app** - Project initialization tool
- **sdk** - JavaScript/TypeScript SDK for VoltAgent API
- **docs-mcp** - Model Context Protocol documentation server

#### UI & Voice

- **vercel-ui** - UI components for Vercel AI integration
- **voice** - Voice interaction capabilities

### `examples/`

Example implementations demonstrating VoltAgent usage:

- Basic agent examples
- Integration patterns
- Advanced use cases
- Best practices demonstrations

### `website/`

Documentation website built with Docusaurus:

- **docs/** - Technical documentation
- **blog/** - Blog posts and tutorials
- **src/components/** - React components including:
  - Console components (AgentChat, AgentDetailView, AgentListView)
  - Marketplace components (agent listings and details)
  - Blog widgets (interactive demos and comparisons)
- **static/** - Static assets and images

### `docs/`

Project-level documentation:

- **structure.md** - This file, describing repository organization
- **tooling.md** - Development tools and workflows
- Additional architecture and design documents

### `scripts/`

Build and maintenance scripts:

- Build automation
- Package management utilities
- Archive and cleanup scripts
- Development helpers

### Configuration Files

- **package.json** - Root package with workspace configuration
- **pnpm-workspace.yaml** - pnpm workspace definitions
- **lerna.json** - Lerna monorepo configuration
- **tsconfig.json** - TypeScript configuration
- **biome.json** - Biome linter/formatter configuration
- **.changeset/** - Changeset configuration for versioning

## Package Naming Conventions

- `@voltagent/*` - Core framework packages
- `@voltagent/*-ai` - AI provider integrations
- `@voltagent/*-exporter` - Telemetry exporters
- `voltagent-example-*` - Example applications

## Development Workflow

1. **Install dependencies**: `pnpm install`
2. **Build all packages**: `pnpm build:all`
3. **Run tests**: `pnpm test:all`
4. **Start development**: `pnpm dev`
5. **Lint code**: `pnpm lint`
6. **Format code**: `pnpm format`

## Key Technologies

- **TypeScript** - Primary language with strict type checking
- **pnpm** - Package manager with workspace support
- **Lerna** - Monorepo management and publishing
- **Vitest** - Testing framework
- **Biome** - Fast linter and formatter
- **Changesets** - Version management and changelogs
- **OpenTelemetry** - Observability and tracing
