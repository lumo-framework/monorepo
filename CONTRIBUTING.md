# Contributing to Lumo Framework

Thank you for your interest in contributing to Lumo Framework! This project aims to make serverless development with TypeScript simple and intuitive through conventions and a standard project layout. We welcome contributions from developers of all skill levels.

## Project Overview

Lumo Framework is a serverless framework that helps developers build, organise, and deploy serverless applications. The framework follows a "convention over configuration" approach - you simply define functions, export them, and Lumo handles routing, deployment, and infrastructure automatically.

The project consists of multiple repositories:

- **Monorepo**: The Lumo Framework CLI, Core Framework, and cloud adapters.
- **lumo**: The example app for new Lumo Framework projects.
- **Documentation Site**: The Lumo Framework website and developer guides.

## Ways to Contribute

### 🐛 Bug Reports

Found a bug in the framework or deployment process? Help us improve:

1. Check existing issues to avoid duplicates.
2. Use our bug report template.
3. Include reproduction steps with a minimal example project.
4. Provide environment details (Node.js version, cloud provider).
5. Include relevant logs from Lumo Framework or deployment output.

### 💡 Feature Requests

Have an idea for improving the serverless development experience?

1. Check if it's already been suggested.
2. Open a discussion to get feedback from the community.
3. Describe the serverless use case you're trying to solve.

### 📝 Documentation

Documentation improvements help the entire serverless community:

- Fix typos or unclear deployment instructions.
- Add examples for different serverless patterns.
- Improve getting started guides for various cloud providers.
- Create tutorials for common serverless architectures.

### 🔧 Code Contributions

Ready to contribute to Lumo Framework? Here's how:

## Getting Started

### Prerequisites

- Node.js 22+ (we recommend using the latest LTS version).
- npm / pnpm.
- Git for version control.
- TypeScript knowledge, any experience :)
- Basic familiarity with serverless concepts.
- Access to a cloud provider account for testing deployments.

### Development Setup

1. **Clone the repository**:

   ```bash
   git clone https://github.com/lumo-framework/monorepo.git
   cd monorepo
   ```

2. **Install dependencies**:

   ```bash
   pnpm install
   ```

3. **Build all packages**:

   ```bash
   pnpm build
   ```

4. **Verify setup by running tests**:
   ```bash
   pnpm test
   ```

### Multi-Repository Workflow

TODO

### Testing

We use a comprehensive testing strategy across the monorepo:

#### Running Tests

```bash
# Run all tests across packages
pnpm test

# Run tests for a specific package
cd packages/cli && pnpm test
cd packages/core && pnpm test
cd packages/adapter-aws && pnpm test
```

#### Code Quality

```bash
# Type checking
pnpm typecheck

# Linting
pnpm lint

# Code formatting
pnpm format

# Check formatting without changes
pnpm format:check
```

#### Testing Your Changes

1. **Unit tests**: Ensure your changes don't break existing functionality
2. **Build verification**: Run `pnpm build` to ensure all packages compile
3. **Integration testing**: Test CLI commands with a sample project

### Local Development

#### Development Workflow

```bash
# Build specific package during development
cd packages/cli && pnpm build
cd packages/core && pnpm build
cd packages/adapter-aws && pnpm build
```

### Commit Messages

We follow [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) format for clear project history:

## Submitting Changes

### Pull Request Process

1. **Before submitting**:

   - Run `pnpm test` to ensure all tests pass
   - Run `pnpm typecheck` to verify TypeScript compilation
   - Run `pnpm lint` to check code style
   - Run `pnpm format:check` to verify formatting

2. **Create your pull request**:

   - Use a descriptive title following conventional commits format
   - Provide a clear description of what your changes do
   - Reference any related issues

3. **After submission**:

   - Address any feedback from reviewers
   - Ensure CI checks pass
   - Be responsive to review comments

4. **Merge requirements**:
   - All tests must pass
   - Code must be properly formatted and linted
   - At least one approving review from a maintainer

## Community and Communication

### Getting Help

- **GitHub Discussions**: Best place for serverless architecture questions

### Code of Conduct

We're committed to providing a welcoming and inclusive environment for all developers. Please be respectful and constructive in all interactions.

### Recognition

All contributors will be recognised in our documentation and release notes. We appreciate every contribution that helps make serverless development more accessible!

## Release Process

Releases follow semantic versioning with special consideration for serverless deployments:

- **Patch** (x.x.1): Bug fixes, security updates, minor deployment improvements
- **Minor** (x.1.x): New features, additional cloud provider support, new conventions
- **Major** (1.x.x): Breaking changes that may require project migration

## Questions?

Don't hesitate to ask questions about serverless development with Lumo Framework:

- Open a GitHub Discussion for architecture and usage questions
- Reach out to maintainers in existing issues
- Check our comprehensive documentation at https://lumo-framework.dev.
- Browse example projects in our repository

Thank you for contributing to Lumo Framework!

---

_This contributing guide is a living document. If you have suggestions for improving it based on your serverless development experience, please let us know!_
