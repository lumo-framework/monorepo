# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Development mode (watch)
pnpm dev

# Type checking
pnpm typecheck

# Run tests
pnpm test

# Lint (placeholder scripts in packages)
pnpm lint

# Build specific package
cd packages/cli && pnpm build
cd packages/core && pnpm build
cd packages/adapter-aws && pnpm build

# Run CLI commands from built code
./packages/cli/dist/index.js build
./packages/cli/dist/index.js deploy
```

## Architecture Overview

This is a monorepo for `Lumo Framework`, a TypeScript serverless framework that compiles routes and event subscribers into AWS Lambda functions.

### Package Structure

- **`packages/core`**: Framework core with HTTP types, event system, and configuration schema
- **`packages/cli`**: Command-line interface with build and deploy commands
- **`packages/adapter-aws`**: AWS-specific adapter with CDK constructs and Lambda adapters

### Key Concepts

**File-based routing** Lumo Framework uses file-based routing where your directory structure defines the URL paths, and TypeScript files within those directories handle HTTP methods by exporting named handlers.

How it works
Directories = URL paths
Files = HTTP method handlers
Exports = GET, POST, PATCH, DELETE functions

**Subscribers**: Event-driven functions that listen to EventBridge events. Configured in `lumo.config.ts` under `events.subscribers` and implemented as files that export a `listen` function.

**Configuration**: Projects use `lumo.config.ts` to define provider settings, resources (DynamoDB tables, etc.), and event subscriptions. The config is validated against the Zod schema in `packages/core/src/config/schema.ts`.

### Build Process

1. CLI scans `functions/api/` for route handlers and generates wrapper code
2. CLI scans for subscriber files based on config and generates wrapper code
3. Each route/subscriber is bundled with esbuild into `dist/functions/`
4. AWS adapter uses CDK to deploy Lambda functions and infrastructure

### Development Workflow

Route handlers use the core framework types:

```typescript
import {
  response,
  statusCodes,
  type Request,
  Response,
} from '@lumo-framework/core';

export async function GET(req: Request): Promise<Response> {
  return response(statusCodes.OK, { message: 'Hello' });
}
```

The framework automatically generates AWS Lambda adapters that convert API Gateway events to the framework's Request/Response format.
