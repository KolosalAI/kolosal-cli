# Contributing to Kolosal Cli

Thanks for your interest in contributing! This guide explains how to set up your environment, make changes, and submit a pull request.

## Table of Contents
- [Project Overview](#project-overview)
- [Prerequisites](#prerequisites)
- [Repository Structure](#repository-structure)
- [Environment Setup](#environment-setup)
- [Development Workflow](#development-workflow)
- [Packages & Build](#packages--build)
- [Running Tests](#running-tests)
- [Coding Standards](#coding-standards)
- [Commit Messages](#commit-messages)
- [Pull Request Checklist](#pull-request-checklist)
- [Adding Dependencies](#adding-dependencies)
- [Versioning & Releases](#versioning--releases)
- [Security](#security)
- [License](#license)

## Project Overview
Kolosal Cli is a command-line AI workflow tool supporting OpenAI-compatible APIs and Hugging Face models. It is derived from Qwen Code and other Apache 2.0 licensed tooling. Our focus is on reliable developer experience, code-aware prompting, and multi-model support.

## Prerequisites
- Node.js >= 20.x (verify with `node -v`)
- npm >= 10
- macOS, Linux, or Windows (some packaging scripts are platform-specific)

## Repository Structure
```
packages/
  cli/            # User-facing CLI
  core/           # Shared core logic
  test-utils/     # Shared testing utilities
  vscode-ide-companion/ # VS Code extension (optional build)
scripts/          # Build, packaging, telemetry, versioning scripts
bundle/           # Generated artifacts (built sources)
```

## Environment Setup
Clone and bootstrap dependencies:
```bash
git clone <your-fork-url>
cd kolosal-code
npm install
```

Build all packages:
```bash
npm run build
```

Link the CLI globally for local use:
```bash
npm install -g packages/cli
# or
npm install -g .
```

Run the CLI:
```bash
kolosal --help
```

## Development Workflow
1. Fork the repository and create a feature branch:
   ```bash
   git checkout -b feat/short-description
   ```
2. Make focused changes (small PRs merge faster).
3. Add/modify tests where behavior changes.
4. Run build + tests locally.
5. Open a Pull Request (PR) against `main`.

## Packages & Build
Common scripts:
```bash
npm run build                # Build all packages
npm run build:mac:pkg        # Build macOS installer (.pkg)
npm run build:win:exe        # Build Windows executable
npm run bundle               # Generate bundle/gemini.js
```

To build only a specific workspace:
```bash
npm run build -w packages/core
npm run build -w packages/cli
```

## Running Tests
We use Vitest.
```bash
npm test                     # Run all tests
npm run -w packages/core test
npm run -w packages/cli test
```
Generate coverage (if configured by package):
```bash
npm run -w packages/cli test -- --coverage
```

## Coding Standards
- TypeScript strictness: keep or improve existing types.
- Lint before committing:
  ```bash
  npm run lint
  ```
- Prefer functional, side-effect-aware code in core logic.
- Avoid large PRs (> ~500 LOC diff) when possible.

## Commit Messages
Use conventional commit style:
```
feat(cli): add new auth flag
fix(core): correct token limit calculation
chore(deps): bump dependency versions
refactor(parser): simplify tree walk
docs(readme): clarify installation
```
Prefixes: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `build`.

## Pull Request Checklist
- [ ] Changes scoped & purposeful
- [ ] Build passes (`npm run build`)
- [ ] Tests added/updated & pass
- [ ] No unused exports or dead code
- [ ] Lint passes
- [ ] Updated docs (README / inline) if behavior changed
- [ ] License headers preserved where required

## Adding Dependencies
- Prefer minimal, actively maintained packages.
- Avoid introducing heavy transitive trees for trivial utilities.
- Document rationale in PR description for new runtime dependencies.

## Versioning & Releases
Releases are automated via scripts in `scripts/` (e.g. version bump + packaging). Do not manually edit published artifacts—open an issue if something breaks.

## Security
If you discover a vulnerability, DO NOT open a public issue. Instead, email the maintainers (add appropriate contact) or use the repository's security advisory workflow.

## License
By contributing, you agree that your contributions are licensed under the Apache License, Version 2.0. See `LICENSE` and `NOTICE` for attribution requirements.

---
Thanks for helping improve Kolosal Cli! 🚀
