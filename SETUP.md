# SonarLint MCP Server - Setup Guide

This guide will walk you through setting up the SonarLint MCP Server for use with Claude Desktop.

## Prerequisites

Before starting, ensure you have:

- **Node.js** version 22.7.5 or higher
- **npm** package manager
- **Claude Desktop** application installed
- **Operating System**: macOS (ARM64/x64), Linux (ARM64/x64), or Windows (x64)

You can verify your Node.js version:
```bash
node --version  # Should be v22.7.5 or higher
npm --version
```

## Installation Methods

### Method 1: NPX (Recommended - No Installation)

The easiest way to use the server is with `npx` - no installation needed:

```bash
npx @nielspeter/sonarlint-mcp-server
```

The SLOOP backend (~70MB) downloads automatically on first run via postinstall script.

### Method 2: Global Installation

Install once and use anywhere:

```bash
npm install -g @nielspeter/sonarlint-mcp-server
```

### Method 3: From Source (For Development)

#### 1. Clone the Repository

```bash
git clone https://github.com/nielspeter/sonarlint-mcp-server.git
cd sonarlint-mcp-server
```

#### 2. Install Dependencies

```bash
npm install
```

This will automatically:
- Install all Node.js dependencies including `@modelcontextprotocol/sdk`
- Download the SonarLint backend via postinstall script (~70MB)
- Download and extract language plugins
- Set up the bundled JRE (Java Runtime Environment)

The postinstall script downloads:
- **SonarLint Backend** (10.32.0.82302) - Platform-specific with bundled JRE
- **JavaScript/TypeScript Plugin** (11.3.0.34350) - 265 rules
- **Python Plugin** (5.9.0.23806)
- **eslint-bridge** - Extracted from JavaScript plugin

Files are placed in `./sonarlint-backend/` directory.

#### 3. Build the Project

```bash
npm run build
```

This compiles the TypeScript source code to JavaScript in the `dist/` directory.

#### 4. Verify Installation

You can verify the installation using the test suite:

```bash
npm test
```

This runs the Vitest test suite which validates:
- SLOOP bridge functionality
- File analysis capabilities
- JavaScript and Python plugin detection
- Quick fix support

## Claude Desktop Configuration

You can configure Claude Desktop using the CLI (recommended) or manually edit the config file.

### Method 1: Using Claude Code CLI (Recommended)

```bash
claude mcp add --transport stdio sonarlint -- npx -y @nielspeter/sonarlint-mcp-server
```

This automatically updates your Claude Desktop configuration. Skip to "Restart Claude Desktop" below.

### Method 2: Manual Configuration

#### 1. Locate Claude Desktop Config

Find your Claude Desktop configuration file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### 2. Add MCP Server Configuration

Edit the config file and add the SonarLint MCP server:

```json
{
  "mcpServers": {
    "sonarlint": {
      "command": "npx",
      "args": ["-y", "@nielspeter/sonarlint-mcp-server"]
    }
  }
}
```

The `-y` flag automatically accepts the npx prompt.

### 3. Restart Claude Desktop

After saving the configuration:

1. Quit Claude Desktop completely
2. Restart Claude Desktop
3. The SonarLint server will start automatically when Claude loads

## Verification

### 1. Check Server Connection

In Claude Desktop, you should see the SonarLint tools available. Start a new conversation and ask:

```
Can you run a health check on the SonarLint server?
```

Claude should be able to call the `health_check` tool and show:
- Server status (healthy/degraded/unhealthy)
- Backend status and uptime
- Active plugins and versions
- Memory usage

### 2. Test File Analysis

Create a test JavaScript file with intentional issues:

```javascript
// test-code.js
function add(a, b) {
  var result = a + b;  // 'var' is discouraged
  return result;
}

if (x == null) {  // Use === instead of ==
  console.log("x is null");
}
```

Then ask Claude:

```
Analyze test-code.js using SonarLint
```

You should see analysis results showing:
- Use of `var` instead of `let`/`const`
- Use of `==` instead of `===`

### 3. Test Content Analysis

You can also analyze code snippets directly:

```
Analyze this TypeScript code for issues:

function process(data: any) {
  return data;
}
```

Claude will use the `analyze_content` tool to analyze unsaved code.

## Available Tools

The SonarLint MCP server provides these tools to Claude:

| Tool | Description |
|------|-------------|
| `analyze_file` | Analyze a single file for code quality issues |
| `analyze_files` | Batch analyze multiple files |
| `analyze_content` | Analyze code snippets (unsaved content) |
| `list_active_rules` | Show all active SonarLint rules by language |
| `health_check` | Check server status, uptime, memory, plugins |

## Supported Languages

Currently supported languages:

- **JavaScript** (.js, .jsx, .mjs, .cjs)
- **TypeScript** (.ts, .tsx)
- **Python** (.py)

## Features

- **Quick Fixes**: Automated fix suggestions
- **Batch Analysis**: Analyze multiple files efficiently
- **Content Analysis**: Analyze unsaved code snippets
- **MCP Resources**: Persistent analysis results
- **Standalone Mode**: No IDE or SonarQube server required

## Troubleshooting

If you encounter issues, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common problems and solutions.

### Quick Checks

1. **Server won't start**:
   ```bash
   # Check if dist/ directory exists
   ls dist/index.js

   # Rebuild if needed
   npm run build
   ```

2. **Plugins not found**:
   ```bash
   # Verify plugins directory
   ls -la sonarlint-backend/plugins/

   # Re-download if needed
   npm run setup
   ```

3. **Node.js version issues**:
   ```bash
   # Check version
   node --version

   # Should be v22.7.5 or higher
   ```

4. **Claude Desktop not seeing server**:
   - Verify the absolute path in `claude_desktop_config.json`
   - Restart Claude Desktop completely
   - Check Claude Desktop logs for connection errors

## Development Mode

For development and testing:

```bash
# Watch mode (auto-rebuild on changes)
npm run dev

# Run tests
npm test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage

# Inspect MCP server with MCP Inspector
npm run inspect
```

## Updating

To update to the latest version:

```bash
git pull
npm install
npm run build
```

Restart Claude Desktop after updating.

## Next Steps

- Read the [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) guide for common issues
- Review [README.md](./README.md) for architecture details and features
- Check [docs/](./docs/) for technical documentation:
  - SLOOP RPC protocol details
  - Testing documentation
- Explore available SonarLint rules: Ask Claude to run `list_active_rules`

## Support

For issues and questions:
- Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- Review Claude Desktop MCP logs
- Run `npm test` to verify your installation
- Open an issue in the repository
