# VoltAgent - AI Agent Development Guide

> **AI Agents**: Always read this file first when working on the VoltAgent codebase.

## Project Overview

VoltAgent is an open-source TypeScript framework for building and orchestrating AI agents. This monorepo uses pnpm workspaces and includes multiple packages for different agent capabilities.

## Repository Structure

```
voltagent/
├── packages/              # Core packages
│   ├── core/              # Core agent framework
│   ├── server-core/       # Server implementation
│   ├── server-hono/       # Hono server integration
│   └── ...                # Other packages
├── examples/              # Example implementations
├── website/               # Documentation site
└── scripts/               # Build and utility scripts
```

## Development Standards

### Code Style

- **Language**: TypeScript (strict mode)
- **Formatter**: Biome for linting and formatting
- **Import Style**: Use explicit file extensions for relative imports
- **Testing**: Vitest for unit and integration tests

### Agent Implementation Patterns

When working with agents in this codebase:

1. **Core Agent Class**: Located at `packages/core/src/agent/agent.ts`
   - Uses direct AI SDK integration
   - Implements comprehensive observability with OpenTelemetry
   - Supports sub-agents, memory management, and tool integration

2. **Registry Pattern**: Located at `packages/core/src/registries/agent-registry.ts`
   - Agents are registered globally for reuse
   - Use registry for agent discovery and management

3. **Tool Management**: Located at `packages/core/src/tool/`
   - Tools are managed via ToolManager
   - Support for individual tools and toolkits

4. **Memory Management**: Located at `packages/core/src/memory/`
   - MemoryManager handles agent context and state
   - Support for different memory providers

### Testing Guidelines

Run tests with proper coverage:

```bash
pnpm test:all:coverage
```

For specific packages:

```bash
pnpm test --filter @voltagent/core
```

### Build Process

Build all packages:

```bash
pnpm build:all
```

Build specific package:

```bash
pnpm build --filter @voltagent/core
```

## Common Tasks

### Adding a New Agent

1. Create agent implementation extending base Agent class
2. Register with AgentRegistry
3. Add tests in corresponding `.spec.ts` file
4. Update type definitions if needed

### Modifying Core Agent Behavior

1. Review `packages/core/src/agent/agent.ts`
2. Check impact on sub-agents and hooks
3. Update tests in `agent.spec.ts`
4. Verify type safety with `agent.spec-d.ts`

### Working with Tools

1. Tools are created using `createTool` function
2. Register tools with ToolManager
3. Tools must implement proper error handling
4. Include comprehensive tool descriptions for AI usage

## Environment Setup

Required:

- Node.js >= 20
- pnpm >= 8

Install dependencies:

```bash
pnpm install
```

## Key Commands

- `pnpm lint` - Run linting
- `pnpm lint:fix` - Auto-fix linting issues
- `pnpm test:all` - Run all tests
- `pnpm build:all` - Build all packages
- `pnpm dev` - Start development mode
- `pnpm typecheck` - Run TypeScript type checking

## Important Notes for AI Agents

1. **Always check existing patterns** before implementing new features
2. **Use the established registry patterns** for agent and tool management
3. **Maintain type safety** - this is a TypeScript-first codebase
4. **Follow the monorepo structure** - changes may impact multiple packages
5. **Test your changes** - ensure all tests pass before committing
6. **Use semantic commit messages** following conventional commits

## Architecture Decisions

- **Direct AI SDK Integration**: We use Vercel AI SDK directly without provider abstraction
- **OpenTelemetry Observability**: Comprehensive tracing and metrics built-in
- **Memory Context**: Agents maintain context through MemoryManager
- **Sub-agent Support**: Agents can spawn and manage sub-agents for complex tasks
- **Tool Ecosystem**: Flexible tool system with validation and error handling

## Related Documentation

- [Contributing Guide](CONTRIBUTING.md)
- [API Documentation](website/docs/api/)
- [Examples](examples/)
- [Blog Posts](website/blog/)

## Support

- Discord: https://s.voltagent.dev/discord
- GitHub Issues: https://github.com/voltagent/voltagent/issues
- Documentation: https://voltagent.dev/docs/
