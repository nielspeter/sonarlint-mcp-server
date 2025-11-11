# Claude Code Development Guide

This document provides guidance for Claude Code when working on this project.

## Release Process

This project uses `standard-version` to manage releases and automatically generate the CHANGELOG.md file.

### How Versioning Works

1. **Commit Convention**: Use conventional commits format
   - `feat:` - New features (appears in CHANGELOG under "Features")
   - `fix:` - Bug fixes (appears in CHANGELOG under "Bug Fixes")
   - `docs:` - Documentation (appears in CHANGELOG under "Documentation")
   - `refactor:` - Code refactoring (appears in CHANGELOG under "Code Refactoring")
   - `perf:` - Performance improvements (appears in CHANGELOG)
   - `chore:`, `style:`, `test:` - Hidden from CHANGELOG

2. **Creating a Release**:
   ```bash
   # Patch release (0.1.2 → 0.1.3)
   npm run release:patch

   # Minor release (0.1.3 → 0.2.0)
   npm run release:minor

   # Major release (0.1.3 → 1.0.0)
   npm run release:major
   ```

3. **What `standard-version` Does**:
   - Bumps version in `package.json` and `package-lock.json`
   - **Automatically generates CHANGELOG.md** from conventional commits
   - Creates a release commit: `chore(release): X.Y.Z`
   - Does NOT create git tags (configured with `skip.tag: true`)

4. **Publishing to npm**:
   - After running `npm run release:patch`, manually create and push the tag:
     ```bash
     git tag vX.Y.Z
     git push && git push --tags
     ```
   - This triggers the GitHub Actions workflow `.github/workflows/publish.yml`
   - The workflow uses OIDC trusted publishing (no npm tokens needed)
   - It automatically publishes to npm and creates a GitHub release

### Important: DO NOT Manually Edit CHANGELOG.md

The CHANGELOG.md file is **automatically generated** by `standard-version` based on git commit messages. Do not manually edit it.

## Configuration Files

- `.versionrc.json` - Configures `standard-version` behavior
  - Defines which commit types appear in changelog
  - Configured to skip automatic tag creation

- `.github/workflows/publish.yml` - Automates npm publishing
  - Triggers on git tags matching `v*`
  - Uses OIDC trusted publishing (no secrets needed)
  - Runs tests, builds, and publishes to npm
  - Creates GitHub releases automatically

## Testing

```bash
# Run all tests
npm test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

All tests must pass before creating a release.

## Building

```bash
# Build TypeScript
npm run build

# Watch mode for development
npm run dev
```

The build output goes to the `dist/` directory.

## MCP Server Development

When adding new MCP tools:

1. Add tool definition to the `tools` array in `src/index.ts`
2. Implement handler function (e.g., `async function handleToolName()`)
3. Add case to the tool call handler switch statement
4. Write unit tests in `tests/unit/`
5. Write integration tests in `tests/integration/` (skip by default)
6. Update tool list in error messages

Tool descriptions should:
- Clearly explain what the tool does
- Specify when to use it vs other similar tools
- Include examples in parameter descriptions
- Mention efficiency benefits when relevant

## Git Workflow

1. Make changes and commit with conventional commit messages
2. When ready to release:
   ```bash
   npm run release:patch  # or minor/major
   git push
   git tag vX.Y.Z
   git push --tags
   ```
3. GitHub Actions will automatically publish to npm

## Notes

- Current version: Check `package.json`
- Node.js requirement: 20+ (for vitest 4.x)
- The project uses ES modules (`"type": "module"`)
- SLOOP backend is downloaded automatically via postinstall script
