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

This is a monorepo for `tsc-run`, a TypeScript serverless framework that compiles routes and event subscribers into AWS Lambda functions.

### Package Structure

- **`packages/core`**: Framework core with HTTP types, event system, and configuration schema
- **`packages/cli`**: Command-line interface with build and deploy commands
- **`packages/adapter-aws`**: AWS-specific adapter with CDK constructs and Lambda adapters

### Key Concepts

**Routes**: TypeScript files in `src/routes/` that export HTTP handler functions (GET, POST, etc.) using the core Request/Response types. The CLI scans these files and generates individual Lambda functions for each HTTP method.

**Subscribers**: Event-driven functions that listen to EventBridge events. Configured in `tsc-run.config.ts` under `events.subscribers` and implemented as files that export a `listen` function.

**Configuration**: Projects use `tsc-run.config.ts` to define provider settings, resources (DynamoDB tables, etc.), and event subscriptions. The config is validated against the Zod schema in `packages/core/src/config/schema.ts`.

### Build Process

1. CLI scans `src/routes/` for route handlers and generates Lambda wrapper code
2. CLI scans for subscriber files based on config and generates wrapper code  
3. Each route/subscriber is bundled with esbuild into `dist/lambdas/`
4. AWS adapter uses CDK to deploy Lambda functions and infrastructure

### Development Workflow

Route handlers use the core framework types:
```typescript
import { response, statusCodes, type Request, Response } from '@tsc-run/core';

export async function GET(req: Request): Promise<Response> {
  return response(statusCodes.OK, { message: 'Hello' });
}
```

The framework automatically generates AWS Lambda adapters that convert API Gateway events to the framework's Request/Response format.