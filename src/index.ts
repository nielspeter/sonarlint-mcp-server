#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { handleToolError } from "./errors.js";

// LLMs sometimes pass arrays as JSON strings — coerce transparently
const stringArray = z.preprocess(
  (val) => typeof val === 'string' ? JSON.parse(val) : val,
  z.array(z.string())
);
import { registerResources } from "./resources/session.js";
import { handleAnalyzeFile } from "./tools/analyze-file.js";
import { handleAnalyzeFiles } from "./tools/analyze-files.js";
import { handleAnalyzeContent } from "./tools/analyze-content.js";
import { handleListActiveRules } from "./tools/list-active-rules.js";
import { handleHealthCheck } from "./tools/health-check.js";
import { handleApplyQuickFix } from "./tools/apply-quick-fix.js";
import { handleApplyAllQuickFixes } from "./tools/apply-all-quick-fixes.js";
import { getSloopBridge } from "./state.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

// Initialize the MCP server
const server = new McpServer({
  name: "sonarlint-mcp-server",
  version: packageJson.version,
});

// Register tool: check_quality
server.registerTool(
  'check_quality',
  {
    description: "Check a file for code quality issues — bugs, code smells, security vulnerabilities, and complexity problems. Like having SonarLint in your IDE. Use after writing or modifying code to catch issues early. Returns issues with exact line numbers, severity, and available quick fixes. For multiple files use check_files.",
    inputSchema: {
      filePath: z.string().describe("Absolute path to the file to analyze (e.g., /path/to/file.js)"),
      minSeverity: z.enum(["INFO", "MINOR", "MAJOR", "CRITICAL", "BLOCKER"]).optional().describe("Minimum severity level to include. Filters out issues below this level. Default: INFO (show all)"),
      excludeRules: stringArray.optional().describe("List of rule IDs to exclude (e.g., ['typescript:S1135', 'javascript:S125'])"),
    },
  },
  async (args) => {
    try {
      return await handleAnalyzeFile(args);
    } catch (error) {
      return handleToolError(error);
    }
  }
);

// Register tool: check_files
server.registerTool(
  'check_files',
  {
    description: "Check multiple files for code quality issues in one call — bugs, code smells, security vulnerabilities. Use when reviewing or modifying several files. Supports glob patterns (e.g. 'src/**/*.ts'). Output is compact: only files with issues are shown, clean files get a summary count. For a single file use check_quality.",
    inputSchema: {
      filePaths: stringArray.describe("Array of file paths or glob patterns to analyze (e.g., ['/path/to/file.ts', 'src/**/*.js'])"),
      groupByFile: z.boolean().optional().default(true).describe("Group issues by file in output (default: true)"),
      minSeverity: z.enum(["INFO", "MINOR", "MAJOR", "CRITICAL", "BLOCKER"]).optional().describe("Minimum severity level to include. Filters out issues below this level. Default: INFO (show all)"),
      excludeRules: stringArray.optional().describe("List of rule IDs to exclude (e.g., ['typescript:S1135', 'javascript:S125'])"),
    },
  },
  async (args) => {
    try {
      return await handleAnalyzeFiles(args);
    } catch (error) {
      return handleToolError(error);
    }
  }
);

// Register tool: check_code
server.registerTool(
  'check_code',
  {
    description: "Check code quality of a code snippet or content you have in hand — catches bugs, code smells, security issues, and complexity problems. Use to validate code before writing it to disk, review generated code, or check code you've read into context. No file on disk needed.",
    inputSchema: {
      content: z.string().describe("The code content to analyze"),
      language: z.enum(["javascript", "typescript", "python", "java", "go", "php", "ruby"]).describe("Programming language of the content"),
      fileName: z.string().optional().describe("Optional filename for context (e.g., 'MyComponent.tsx')"),
    },
  },
  async (args) => {
    try {
      return await handleAnalyzeContent(args);
    } catch (error) {
      return handleToolError(error);
    }
  }
);

// Register tool: list_rules
server.registerTool(
  'list_rules',
  {
    description: "List all active code quality rules with ID, name, and severity. Use to look up what a rule means (e.g., S3776 = Cognitive Complexity), discover what issues can be detected, or see which rules apply to a language. Covers bugs, code smells, security vulnerabilities, and security hotspots.",
    inputSchema: {
      language: z.enum(["javascript", "typescript", "python", "java", "go", "php", "ruby"]).optional().describe("Filter rules by language (optional)"),
    },
  },
  async (args) => {
    try {
      return await handleListActiveRules(args);
    } catch (error) {
      return handleToolError(error);
    }
  }
);

// Register tool: health_check (keeping name - it's standard)
server.registerTool(
  'health_check',
  {
    description: "Check if the code quality analysis backend is running and healthy. Shows installed language plugins, cache stats, and version info. Use to diagnose when analysis isn't working as expected.",
    inputSchema: {},
  },
  async () => {
    try {
      return await handleHealthCheck();
    } catch (error) {
      return handleToolError(error);
    }
  }
);

// Register tool: fix_issue
server.registerTool(
  'fix_issue',
  {
    description: "Automatically fix one specific code quality issue. Applies the SonarLint-suggested fix for the issue at the given file, line, and rule. The file is modified directly. To fix all issues in a file at once, use fix_all_issues instead.",
    inputSchema: {
      filePath: z.string().describe("Absolute path to the file to fix"),
      line: z.number().describe("Line number of the issue"),
      rule: z.string().describe("Rule ID (e.g., 'javascript:S3504')"),
    },
  },
  async (args) => {
    try {
      return await handleApplyQuickFix(args);
    } catch (error) {
      return handleToolError(error);
    }
  }
);

// Register tool: fix_all_issues
server.registerTool(
  'fix_all_issues',
  {
    description: "Automatically fix all code quality issues in a file that have available quick fixes. Applies all SonarLint-suggested fixes in one operation. Returns what was fixed and what remains (some issues require manual fixes like reducing complexity).",
    inputSchema: {
      filePath: z.string().describe("Absolute path to the file to fix"),
    },
  },
  async (args) => {
    try {
      return await handleApplyAllQuickFixes(args);
    } catch (error) {
      return handleToolError(error);
    }
  }
);

// Register MCP resources
registerResources(server);

// Graceful shutdown
async function shutdown() {
  console.error("[MCP] Shutting down...");
  const sloopBridge = getSloopBridge();
  if (sloopBridge) {
    try {
      await sloopBridge.disconnect();
      console.error("[MCP] SLOOP bridge disconnected");
    } catch (error) {
      console.error("[MCP] Error disconnecting SLOOP:", error);
    }
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the server
async function main() {
  console.error("[MCP] Starting SonarLint MCP Server...");
  console.error(`[MCP] Version: ${packageJson.version}`);
  console.error("[MCP] Mode: Standalone (no IDE required)");
  console.error("[MCP] Tools: check_quality, check_files, check_code, list_rules, fix_issue, fix_all_issues, health_check");
  console.error("[MCP] Features:");
  console.error("[MCP]   - Session storage for multi-turn conversations");
  console.error("[MCP]   - Batch analysis for multiple files");
  console.error("[MCP]   - Content analysis (unsaved files)");
  console.error("[MCP]   - MCP resources for persistent results");
  console.error("[MCP]   - Quick fixes support");

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[MCP] Server ready! Waiting for tool calls...");
}

main().catch((error) => {
  console.error("[MCP] Fatal error:", error);
  process.exit(1);
});
