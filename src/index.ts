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
import { handleAnalyzeProject } from "./tools/analyze-project.js";
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

// Register tool: analyze_file
server.registerTool(
  'analyze_file',
  {
    description: "Analyze a single file for bugs, code smells, and security vulnerabilities. Best for 1-3 files. First call may take 30-60s (starts backend + JS/TS analyzer). Subsequent calls are fast. Returns issues with line numbers, severity, and quick fixes. For many files use analyze_files or analyze_project instead.",
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

// Register tool: analyze_files
server.registerTool(
  'analyze_files',
  {
    description: "Analyze multiple files in a single batch. More efficient than calling analyze_file repeatedly. Returns a compact summary: only files with issues are listed (clean files get a one-line count). Use for targeted multi-file analysis. For whole projects, prefer analyze_project.",
    inputSchema: {
      filePaths: stringArray.describe("Array of absolute file paths to analyze"),
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

// Register tool: analyze_content
server.registerTool(
  'analyze_content',
  {
    description: "Analyze code content directly without project-level resolution. Faster than analyze_file for large projects since it skips import/type graph analysis. Use as a fallback when file-based analysis times out, or for unsaved changes, code snippets, and generated code.",
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

// Register tool: list_active_rules
server.registerTool(
  'list_active_rules',
  {
    description: "List all active SonarLint rules from the backend with rule ID, name, clean code attribute, and severity impacts. Use to understand what a rule ID means (e.g., S3776 = Cognitive Complexity), discover available rules, or filter by language. Starts the backend if not already running.",
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

// Register tool: health_check
server.registerTool(
  'health_check',
  {
    description: "Check server health, backend status, installed plugins, and cache stats. Use to diagnose issues (e.g., backend not started, missing plugins) or verify the server is working before analysis.",
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

// Register tool: analyze_project
server.registerTool(
  'analyze_project',
  {
    description: "Scan an entire project directory for code quality issues. Recursively finds all source files and analyzes in batch. Output is compact: only files with issues are shown in table format, clean files get a single count line. Use for broad project-wide quality checks. Excludes node_modules, dist, build, .git automatically.",
    inputSchema: {
      projectPath: z.string().describe("Absolute path to the project directory to scan"),
      maxFiles: z.number().optional().default(100).describe("Maximum number of files to analyze (default: 100, prevents overwhelming output)"),
      minSeverity: z.enum(["INFO", "MINOR", "MAJOR", "CRITICAL", "BLOCKER"]).optional().describe("Minimum severity level to include. Filters out issues below this level. Default: INFO (show all)"),
      excludeRules: stringArray.optional().describe("List of rule IDs to exclude (e.g., ['typescript:S1135', 'javascript:S125'])"),
      includePatterns: stringArray.optional().describe("File glob patterns to include (e.g., ['src/**/*.ts', 'lib/**/*.js']). Default: all supported extensions"),
    },
  },
  async (args) => {
    try {
      return await handleAnalyzeProject(args);
    } catch (error) {
      return handleToolError(error);
    }
  }
);

// Register tool: apply_quick_fix
server.registerTool(
  'apply_quick_fix',
  {
    description: "Apply a quick fix for one specific issue identified by file + line + rule. Modifies the file directly. To fix all issues at once, use apply_all_quick_fixes instead. Only works for issues that have SonarLint quick fixes available (indicated in analysis output).",
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

// Register tool: apply_all_quick_fixes
server.registerTool(
  'apply_all_quick_fixes',
  {
    description: "Apply all available quick fixes for a file in one operation. More efficient than calling apply_quick_fix repeatedly. Returns a summary of what was fixed and what remains (issues without quick fixes need manual intervention).",
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
  console.error("[MCP] Tools: analyze_file, analyze_files, analyze_content, list_active_rules");
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
