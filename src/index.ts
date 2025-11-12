#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { handleToolError } from "./errors.js";
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

// Initialize the MCP server
const server = new McpServer({
  name: "sonarlint-mcp-server",
  version: "1.0.0",
});

// Register tool: analyze_file
server.registerTool(
  'analyze_file',
  {
    description: "Analyze a single file for code quality issues, bugs, and security vulnerabilities using SonarLint rules. Returns detailed issues with line numbers, severity levels, and quick fixes.",
    inputSchema: {
      filePath: z.string().describe("Absolute path to the file to analyze (e.g., /path/to/file.js)"),
      minSeverity: z.enum(["INFO", "MINOR", "MAJOR", "CRITICAL", "BLOCKER"]).optional().describe("Minimum severity level to include. Filters out issues below this level. Default: INFO (show all)"),
      excludeRules: z.array(z.string()).optional().describe("List of rule IDs to exclude (e.g., ['typescript:S1135', 'javascript:S125'])"),
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
    description: "Analyze multiple files in batch for better performance. Returns issues grouped by file with an overall summary. Ideal for analyzing entire directories or project-wide scans.",
    inputSchema: {
      filePaths: z.array(z.string()).describe("Array of absolute file paths to analyze"),
      groupByFile: z.boolean().optional().default(true).describe("Group issues by file in output (default: true)"),
      minSeverity: z.enum(["INFO", "MINOR", "MAJOR", "CRITICAL", "BLOCKER"]).optional().describe("Minimum severity level to include. Filters out issues below this level. Default: INFO (show all)"),
      excludeRules: z.array(z.string()).optional().describe("List of rule IDs to exclude (e.g., ['typescript:S1135', 'javascript:S125'])"),
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
    description: "Analyze code content without requiring a saved file. Useful for analyzing unsaved changes, code snippets, or generated code. Creates a temporary file for analysis.",
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
    description: "List all active SonarLint rules, optionally filtered by language. Shows which rules are being used to analyze code.",
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
    description: "Check the health and status of the SonarLint MCP server. Returns backend status, plugin information, cache statistics, and performance metrics.",
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
    description: "Scan an entire project directory for code quality issues. Recursively finds all supported source files and analyzes them in batch. Excludes common non-source directories (node_modules, dist, build, etc.).",
    inputSchema: {
      projectPath: z.string().describe("Absolute path to the project directory to scan"),
      maxFiles: z.number().optional().default(100).describe("Maximum number of files to analyze (default: 100, prevents overwhelming output)"),
      minSeverity: z.enum(["INFO", "MINOR", "MAJOR", "CRITICAL", "BLOCKER"]).optional().describe("Minimum severity level to include. Filters out issues below this level. Default: INFO (show all)"),
      excludeRules: z.array(z.string()).optional().describe("List of rule IDs to exclude (e.g., ['typescript:S1135', 'javascript:S125'])"),
      includePatterns: z.array(z.string()).optional().describe("File glob patterns to include (e.g., ['src/**/*.ts', 'lib/**/*.js']). Default: all supported extensions"),
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
    description: "Apply a quick fix for ONE SPECIFIC ISSUE at a time. Fixes only the single issue identified by filePath + line + rule. To fix multiple issues, call this tool multiple times (once per issue). The file is modified directly.",
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
    description: "Apply ALL available quick fixes for a file in one operation. Automatically identifies and fixes all issues that have SonarLint quick fixes available. More efficient than calling apply_quick_fix multiple times. Returns summary of what was fixed and what issues remain (issues without quick fixes must be fixed manually).",
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
  console.error("[MCP] Version: 1.0.0 (Phase 3)");
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
