# SonarLint MCP Server

A Model Context Protocol (MCP) server that brings enterprise-grade code analysis to Claude Desktop and other MCP clients using SonarLint's standalone SLOOP backend.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)

## Features

- **🔍 Real-time Code Analysis** - Detect bugs, code smells, and security vulnerabilities
- **🚀 Fast & Standalone** - No IDE or SonarQube server required
- **📦 Multiple Languages** - JavaScript, TypeScript, Python (265+ JS rules)
- **⚡ Smart Caching** - 5-minute TTL for lightning-fast repeat analyses
- **🔧 Quick Fixes** - Automated suggestions for common issues
- **💾 Persistent Results** - MCP resources for multi-turn conversations
- **🎯 Batch Analysis** - Analyze multiple files efficiently

## Quick Start

### Prerequisites

- Node.js 20.0.0 or higher
- Claude Desktop (or any MCP client)

### Installation

No installation required! Use `npx` to run directly:

```bash
npx @nielspeter/sonarlint-mcp-server
```

The SLOOP backend (~70MB) downloads automatically on first run.

#### Or install globally:

```bash
npm install -g @nielspeter/sonarlint-mcp-server
```

#### Or from source (for development):

```bash
git clone https://github.com/nielspeter/sonarlint-mcp-server.git
cd sonarlint-mcp-server
npm install  # Auto-downloads SLOOP backend (~70MB)
npm run build
```

### Configure Claude Desktop

#### Using Claude Code CLI (Recommended)

```bash
claude mcp add --transport stdio sonarlint -- npx -y @nielspeter/sonarlint-mcp-server
```

This automatically updates your Claude Desktop configuration.

#### Manual Configuration

Add to your `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Linux:** `~/.config/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

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

Restart Claude Desktop and you're ready!

## Usage

Once configured, Claude can analyze your code:

```
Analyze my JavaScript file for code quality issues: /path/to/file.js
```

```
Check these files for bugs: src/app.ts, src/utils.ts
```

```
Analyze this code snippet:
function process(data) {
  var result = data;  // Issues with 'var'
  return result;
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `analyze_file` | Analyze a single file for issues |
| `analyze_files` | Batch analyze multiple files |
| `analyze_content` | Analyze code snippets (no file needed) |
| `list_active_rules` | Show all active SonarLint rules |
| `health_check` | Check server status and diagnostics |

## Example Analysis Output

```javascript
{
  file: "/path/to/file.js",
  language: "javascript",
  issues: [
    {
      line: 4,
      column: 2,
      severity: "MAJOR",
      rule: "javascript:S3504",
      message: "Unexpected var, use let or const instead.",
      quickFix: {
        message: "Replace with 'const'",
        edits: [...]
      }
    }
  ],
  summary: {
    total: 5,
    critical: 0,
    major: 3,
    minor: 2
  }
}
```

## Supported Languages

| Language | Extensions | Rules |
|----------|------------|-------|
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` | 265 |
| TypeScript | `.ts`, `.tsx` | 265 |
| Python | `.py` | ~100 |

## Architecture

```
Claude Desktop
      ↓ MCP Protocol (stdio)
SonarLint MCP Server (this project)
      ↓ JSON-RPC
SLOOP Backend (SonarLint Local Operations)
      ↓ Plugin API
Language Analyzers (JS/TS, Python)
```

The server uses SonarLint's standalone SLOOP backend with:
- **Version:** 10.32.0.82302 (WebStorm-compatible)
- **Bundled JRE:** Java 17
- **Bi-directional RPC:** Client request handlers implemented
- **Analysis Caching:** 5-minute TTL with modification detection

## Development

```bash
# Install dependencies (auto-downloads backend)
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode (auto-rebuild)
npm run dev

# Inspect with MCP Inspector
npm run inspect
```

## Testing

```bash
# Run test suite
npm test

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage
```

Tests validate:
- SLOOP bridge functionality
- File and content analysis
- JavaScript and Python plugin detection
- Quick fix support
- Error handling

## Documentation

- **[SETUP.md](./SETUP.md)** - Detailed installation guide
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Common issues and solutions
- **[docs/SLOOP_RPC_PROTOCOL.md](./docs/SLOOP_RPC_PROTOCOL.md)** - Complete RPC protocol documentation
- **[docs/TESTING.md](./docs/TESTING.md)** - Testing guide

## Technical Highlights

This project demonstrates several key technical achievements:

1. **Standalone SLOOP** - First documented standalone use of SonarLint's SLOOP backend
2. **Bi-directional RPC** - Complete client request handler implementation
3. **MCP Integration** - Full Model Context Protocol implementation with resources
4. **Smart Caching** - File modification tracking with TTL-based invalidation
5. **Production Ready** - Comprehensive testing, error handling, and monitoring

### Critical Implementation Details

For anyone using SLOOP programmatically:
- `listFiles` must return `ClientFileDto` with file content (not just URIs)
- `isUserDefined: true` is mandatory (SLOOP filters out false values)
- `bundlePath` should be parent directory (SLOOP appends `/package/bin/server.cjs`)
- Client must implement 4 request handlers (listFiles, getBaseDir, etc.)
- `backendCapabilities` required for proper initialization

## Why This Approach?

### Advantages
- ✅ No IDE dependency - runs completely standalone
- ✅ Full API access - all SLOOP services available
- ✅ Better control - configure for specific needs
- ✅ More reliable - direct process communication
- ✅ CI/CD capable - can run in automated environments
- ✅ Faster - no IDE overhead

### Comparison to IDE Integration
We initially investigated connecting to IDE servers (WebStorm port 64120) but discovered:
- IDE server is only for "Open in IDE" from SonarQube Server/Cloud
- Limited API access
- IDE must be running
- Not suitable for programmatic access

## Related Projects

- **[SonarQube MCP Server](https://github.com/SonarSource/sonarqube-mcp-server)** - Official server for SonarQube Server/Cloud APIs
  - Complementary approach requiring server setup
  - This project provides local, standalone analysis

## Contributing

Contributions welcome! Areas for improvement:
- Additional language support (Java, Go, PHP)
- Custom rule development
- Advanced rule configuration
- Performance optimizations
- CI/CD integrations

## License

MIT License - see [LICENSE](./LICENSE)

## Acknowledgments

- **SonarSource** for building SLOOP and SonarLint
- **Anthropic** for the Model Context Protocol
- **Claude Code** for enabling this development

---

**Status:** ✅ Production Ready - All phases complete with comprehensive testing
