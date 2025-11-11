#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { SloopBridge } from "./sloop-bridge.js";
import { existsSync, statSync, writeFileSync, unlinkSync, readdirSync, readFileSync } from "fs";
import { join, dirname, extname, basename, relative } from "path";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

// Get package root directory (where sonarlint-backend is installed)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = join(__dirname, '..');  // Go up from dist/ to package root

// Type definitions for better type safety
interface AnalysisIssue {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  severity: "INFO" | "MINOR" | "MAJOR" | "CRITICAL" | "BLOCKER";
  rule: string;
  ruleDescription: string;
  message: string;
  quickFix?: QuickFix;
}

interface QuickFix {
  description: string;
  edits: TextEdit[];
}

interface TextEdit {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  newText: string;
}

interface AnalysisResult {
  filePath: string;
  language: string;
  issues: AnalysisIssue[];
  summary: {
    total: number;
    bySeverity: {
      blocker: number;
      critical: number;
      major: number;
      minor: number;
      info: number;
    };
    rulesChecked: number;
  };
}

interface BatchAnalysisResult {
  files: Array<{
    filePath: string;
    language: string;
    issueCount: number;
    issues: AnalysisIssue[];
  }>;
  summary: {
    totalFiles: number;
    totalIssues: number;
    filesWithIssues: number;
    bySeverity: {
      blocker: number;
      critical: number;
      major: number;
      minor: number;
      info: number;
    };
  };
}

// Custom error class for better error handling
class SloopError extends Error {
  constructor(
    message: string,
    public userMessage: string,
    public recoverable: boolean = false
  ) {
    super(message);
    this.name = 'SloopError';
  }
}

// Global SLOOP bridge instance (lazy initialized)
let sloopBridge: SloopBridge | null = null;
const scopeMap = new Map<string, string>(); // projectRoot -> scopeId

// File system tracking (removed - using didUpdateFileSystem instead)

// Session storage for analysis results (for MCP resources)
const sessionResults = new Map<string, AnalysisResult>();
const batchResults = new Map<string, BatchAnalysisResult>();

// Server start time for uptime tracking
const serverStartTime = Date.now();

// Initialize the MCP server
const server = new Server(
  {
    name: "sonarlint-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Helper: Ensure SLOOP bridge is initialized
async function ensureSloopBridge(): Promise<SloopBridge> {
  if (!sloopBridge) {
    console.error("[MCP] Initializing SLOOP bridge...");

    // Check if plugins are downloaded
    const pluginsDir = join(PACKAGE_ROOT, "sonarlint-backend", "plugins");
    if (!existsSync(pluginsDir)) {
      throw new SloopError(
        "Backend not found",
        "SonarLint backend not installed. The postinstall script may have failed. Try reinstalling: npm install -g @nielspeter/sonarlint-mcp-server",
        false
      );
    }

    try {
      sloopBridge = new SloopBridge(PACKAGE_ROOT);
      await sloopBridge.connect();
      console.error("[MCP] SLOOP bridge initialized successfully");
    } catch (error) {
      throw new SloopError(
        `Failed to initialize SLOOP: ${error}`,
        "Failed to start SonarLint backend. Please check that Java is installed and try again.",
        true
      );
    }
  }
  return sloopBridge;
}

// Helper: Get or create configuration scope for a project
function getOrCreateScope(filePath: string): string {
  const projectRoot = dirname(filePath);
  const scopeId = scopeMap.get(projectRoot);

  if (scopeId) {
    return scopeId;
  }

  // Create new scope ID based on project root hash
  const hash = createHash('md5').update(projectRoot).digest('hex').substring(0, 8);
  const newScopeId = `scope-${hash}`;

  console.error(`[MCP] Creating new configuration scope: ${newScopeId} for ${projectRoot}`);

  // Add scope to SLOOP
  if (sloopBridge) {
    sloopBridge.addConfigurationScope(newScopeId, {
      name: `Project: ${projectRoot}`,
    });
  }

  scopeMap.set(projectRoot, newScopeId);
  return newScopeId;
}

// Helper: Detect language from file extension
function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const languageMap: Record<string, string> = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.java': 'java',
    '.go': 'go',
    '.php': 'php',
    '.rb': 'ruby',
    '.html': 'html',
    '.css': 'css',
    '.xml': 'xml',
  };
  return languageMap[ext] || 'unknown';
}

// Helper: Map language name to SLOOP Language enum
function languageToEnum(language: string): string {
  const enumMap: Record<string, string> = {
    'javascript': 'JS',
    'typescript': 'TS',
    'python': 'PYTHON',
    'java': 'JAVA',
    'go': 'GO',
    'php': 'PHP',
    'ruby': 'RUBY',
    'html': 'HTML',
    'css': 'CSS',
    'xml': 'XML',
  };
  return enumMap[language] || language.toUpperCase();
}

// Helper: Notify SLOOP that file system was updated (proper cache invalidation)
async function notifyFileSystemChanged(filePath: string, configScopeId: string): Promise<void> {
  const uri = `file://${filePath}`;

  // Get project root from scopeMap (reverse lookup)
  let projectRoot: string | undefined;
  for (const [root, scopeId] of scopeMap.entries()) {
    if (scopeId === configScopeId) {
      projectRoot = root;
      break;
    }
  }

  // If no project root found, use file's directory
  if (!projectRoot) {
    projectRoot = dirname(filePath);
  }

  const relativePath = relative(projectRoot, filePath);

  try {
    const bridge = await ensureSloopBridge();

    // Detect language from file extension
    const language = detectLanguage(filePath);
    const languageEnum = languageToEnum(language);

    // CRITICAL: Tell SLOOP the file is "open" so it will re-analyze on file system updates
    // Without this, SLOOP ignores changes to "closed" files
    bridge.sendNotification('file/didOpenFile', {
      configurationScopeId: configScopeId,
      fileUri: uri
    });
    console.error(`[FS] Marked file as open: ${filePath}`);

    // Read the actual file content to pass to SLOOP
    // This ensures SLOOP gets the latest content instead of reading from its cache
    const fileContent = readFileSync(filePath, 'utf-8');

    // Build ClientFileDto
    // Pass BOTH fsPath and content - fromDto will call setDirty(content) which takes precedence
    const clientFileDto = {
      uri,
      ideRelativePath: relativePath,
      configScopeId,
      isTest: null,
      charset: 'UTF-8',
      fsPath: filePath, // Provide fsPath for analyzers that need it
      content: fileContent, // Providing content calls setDirty(), which takes precedence over fsPath
      detectedLanguage: languageEnum, // e.g., "JS", "TS", "PYTHON"
      isUserDefined: true // CRITICAL: Must be true for SLOOP to analyze!
    };

    // Send file/didUpdateFileSystem notification
    bridge.sendNotification('file/didUpdateFileSystem', {
      addedFiles: [],
      changedFiles: [clientFileDto],
      removedFiles: []
    });

    console.error(`[FS] Notified file system update:`);
    console.error(`[FS]   URI: ${uri}`);
    console.error(`[FS]   Language: ${languageEnum}`);
    console.error(`[FS]   Relative: ${relativePath}`);
    console.error(`[FS]   ConfigScopeId: ${configScopeId}`);
    console.error(`[FS]   Content length: ${fileContent.length} chars`);
    console.error(`[FS]   First 100 chars: ${fileContent.substring(0, 100)}`);
  } catch (err) {
    console.error(`[FS] Failed to notify file system update for ${filePath}:`, err);
    // Don't throw - this is not critical
  }
}

// Helper: Transform raw SLOOP issues to simplified format
function transformSloopIssues(rawIssues: any[]): AnalysisIssue[] {
  return rawIssues.map((issue) => {
    // Debug: Log raw issue to understand structure
    if (!issue.startLine && !issue.textRange?.startLine) {
      console.error('[DEBUG] Issue missing line info:', JSON.stringify(issue, null, 2).substring(0, 500));
    }

    const transformed: AnalysisIssue = {
      line: issue.textRange?.startLine || issue.startLine || 1,
      column: issue.textRange?.startLineOffset || issue.startColumn || 0,
      endLine: issue.textRange?.endLine || issue.endLine || issue.textRange?.startLine || issue.startLine || 1,
      endColumn: issue.textRange?.endLineOffset || issue.endColumn || issue.textRange?.startLineOffset || issue.startColumn || 0,
      severity: issue.severity || 'MAJOR',
      rule: issue.ruleKey || 'unknown',
      ruleDescription: issue.ruleDescriptionContextKey || '',
      message: issue.primaryMessage || issue.message || 'No description',
    };

    // Add quick fix if available
    if (issue.quickFixes && issue.quickFixes.length > 0) {
      const firstFix = issue.quickFixes[0];
      const fileEdits = firstFix.inputFileEdits || firstFix.fileEdits || [];
      transformed.quickFix = {
        description: firstFix.message || 'Apply fix',
        edits: fileEdits.flatMap((fileEdit: any) =>
          (fileEdit.textEdits || []).map((edit: any) => ({
            startLine: edit.range?.startLine || 1,
            startColumn: edit.range?.startLineOffset || 0,
            endLine: edit.range?.endLine || 1,
            endColumn: edit.range?.endLineOffset || 0,
            newText: edit.newText || '',
          }))
        ),
      };
    }

    return transformed;
  });
}

// Helper: Create analysis summary
function createSummary(issues: AnalysisIssue[], rulesChecked: number) {
  const summary = {
    total: issues.length,
    bySeverity: {
      blocker: 0,
      critical: 0,
      major: 0,
      minor: 0,
      info: 0,
    },
    rulesChecked,
  };

  for (const issue of issues) {
    const severity = issue.severity.toLowerCase() as keyof typeof summary.bySeverity;
    if (severity in summary.bySeverity) {
      summary.bySeverity[severity]++;
    }
  }

  return summary;
}

// Helper: Format analysis result for display
function formatAnalysisResult(result: AnalysisResult): string {
  const { filePath, language, issues, summary } = result;

  let output = `# Analysis Results: ${filePath}\n\n`;
  output += `**Language**: ${language}\n`;
  output += `**Rules Checked**: ${summary.rulesChecked}\n`;
  output += `**Total Issues**: ${summary.total}\n\n`;

  if (summary.total === 0) {
    output += "✅ No issues found!\n";
    return output;
  }

  // Severity breakdown
  output += `## Issues by Severity\n\n`;
  if (summary.bySeverity.blocker > 0) output += `- 🔴 **BLOCKER**: ${summary.bySeverity.blocker}\n`;
  if (summary.bySeverity.critical > 0) output += `- 🟠 **CRITICAL**: ${summary.bySeverity.critical}\n`;
  if (summary.bySeverity.major > 0) output += `- 🟡 **MAJOR**: ${summary.bySeverity.major}\n`;
  if (summary.bySeverity.minor > 0) output += `- 🔵 **MINOR**: ${summary.bySeverity.minor}\n`;
  if (summary.bySeverity.info > 0) output += `- ⚪ **INFO**: ${summary.bySeverity.info}\n`;
  output += `\n`;

  // Detailed issues
  output += `## Detailed Issues\n\n`;

  // Sort by line number
  const sortedIssues = [...issues].sort((a, b) => a.line - b.line);

  for (const issue of sortedIssues) {
    output += `### Line ${issue.line}:${issue.column} - ${issue.severity}\n\n`;
    output += `**Rule**: \`${issue.rule}\`\n\n`;
    output += `**Message**: ${issue.message}\n\n`;

    if (issue.quickFix) {
      output += `**Quick Fix Available**: ${issue.quickFix.description}\n\n`;
    }

    output += `---\n\n`;
  }

  return output;
}

// Helper: Format batch analysis result
function formatBatchAnalysisResult(result: BatchAnalysisResult): string {
  const { files, summary } = result;

  let output = `# Batch Analysis Results\n\n`;
  output += `**Total Files**: ${summary.totalFiles}\n`;
  output += `**Files with Issues**: ${summary.filesWithIssues}\n`;
  output += `**Total Issues**: ${summary.totalIssues}\n\n`;

  // Overall severity breakdown
  output += `## Overall Issues by Severity\n\n`;
  if (summary.bySeverity.blocker > 0) output += `- 🔴 **BLOCKER**: ${summary.bySeverity.blocker}\n`;
  if (summary.bySeverity.critical > 0) output += `- 🟠 **CRITICAL**: ${summary.bySeverity.critical}\n`;
  if (summary.bySeverity.major > 0) output += `- 🟡 **MAJOR**: ${summary.bySeverity.major}\n`;
  if (summary.bySeverity.minor > 0) output += `- 🔵 **MINOR**: ${summary.bySeverity.minor}\n`;
  if (summary.bySeverity.info > 0) output += `- ⚪ **INFO**: ${summary.bySeverity.info}\n`;
  output += `\n`;

  // File-by-file breakdown
  output += `## Issues by File\n\n`;

  for (const file of files) {
    if (file.issueCount === 0) {
      output += `### ✅ ${file.filePath}\n\nNo issues found.\n\n`;
    } else {
      output += `### ${file.filePath} (${file.issueCount} issue${file.issueCount > 1 ? 's' : ''})\n\n`;

      // Group by severity
      const bySeverity: Record<string, AnalysisIssue[]> = {};
      for (const issue of file.issues) {
        if (!bySeverity[issue.severity]) {
          bySeverity[issue.severity] = [];
        }
        bySeverity[issue.severity].push(issue);
      }

      for (const [severity, issues] of Object.entries(bySeverity)) {
        output += `**${severity}** (${issues.length}):\n`;
        for (const issue of issues) {
          output += `- Line ${issue.line}: ${issue.message} [\`${issue.rule}\`]\n`;
        }
        output += `\n`;
      }
    }
  }

  return output;
}

// Tool definitions
const tools: Tool[] = [
  {
    name: "analyze_file",
    description: "Analyze a single file for code quality issues, bugs, and security vulnerabilities using SonarLint rules. Returns detailed issues with line numbers, severity levels, and quick fixes.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Absolute path to the file to analyze (e.g., /path/to/file.js)",
        },
        minSeverity: {
          type: "string",
          enum: ["INFO", "MINOR", "MAJOR", "CRITICAL", "BLOCKER"],
          description: "Minimum severity level to include. Filters out issues below this level. Default: INFO (show all)",
        },
        excludeRules: {
          type: "array",
          items: { type: "string" },
          description: "List of rule IDs to exclude (e.g., ['typescript:S1135', 'javascript:S125'])",
        },
      },
      required: ["filePath"],
    },
  },
  {
    name: "analyze_files",
    description: "Analyze multiple files in batch for better performance. Returns issues grouped by file with an overall summary. Ideal for analyzing entire directories or project-wide scans.",
    inputSchema: {
      type: "object",
      properties: {
        filePaths: {
          type: "array",
          items: { type: "string" },
          description: "Array of absolute file paths to analyze",
        },
        groupByFile: {
          type: "boolean",
          description: "Group issues by file in output (default: true)",
          default: true,
        },
        minSeverity: {
          type: "string",
          enum: ["INFO", "MINOR", "MAJOR", "CRITICAL", "BLOCKER"],
          description: "Minimum severity level to include. Filters out issues below this level. Default: INFO (show all)",
        },
        excludeRules: {
          type: "array",
          items: { type: "string" },
          description: "List of rule IDs to exclude (e.g., ['typescript:S1135', 'javascript:S125'])",
        },
      },
      required: ["filePaths"],
    },
  },
  {
    name: "analyze_content",
    description: "Analyze code content without requiring a saved file. Useful for analyzing unsaved changes, code snippets, or generated code. Creates a temporary file for analysis.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The code content to analyze",
        },
        language: {
          type: "string",
          enum: ["javascript", "typescript", "python", "java", "go", "php", "ruby"],
          description: "Programming language of the content",
        },
        fileName: {
          type: "string",
          description: "Optional filename for context (e.g., 'MyComponent.tsx')",
        },
      },
      required: ["content", "language"],
    },
  },
  {
    name: "list_active_rules",
    description: "List all active SonarLint rules, optionally filtered by language. Shows which rules are being used to analyze code.",
    inputSchema: {
      type: "object",
      properties: {
        language: {
          type: "string",
          enum: ["javascript", "typescript", "python", "java", "go", "php", "ruby"],
          description: "Filter rules by language (optional)",
        },
      },
    },
  },
  {
    name: "health_check",
    description: "Check the health and status of the SonarLint MCP server. Returns backend status, plugin information, cache statistics, and performance metrics.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "analyze_project",
    description: "Scan an entire project directory for code quality issues. Recursively finds all supported source files and analyzes them in batch. Excludes common non-source directories (node_modules, dist, build, etc.).",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: {
          type: "string",
          description: "Absolute path to the project directory to scan",
        },
        maxFiles: {
          type: "number",
          description: "Maximum number of files to analyze (default: 100, prevents overwhelming output)",
          default: 100,
        },
        minSeverity: {
          type: "string",
          enum: ["INFO", "MINOR", "MAJOR", "CRITICAL", "BLOCKER"],
          description: "Minimum severity level to include. Filters out issues below this level. Default: INFO (show all)",
        },
        excludeRules: {
          type: "array",
          items: { type: "string" },
          description: "List of rule IDs to exclude (e.g., ['typescript:S1135', 'javascript:S125'])",
        },
        includePatterns: {
          type: "array",
          items: { type: "string" },
          description: "File glob patterns to include (e.g., ['src/**/*.ts', 'lib/**/*.js']). Default: all supported extensions",
        },
      },
      required: ["projectPath"],
    },
  },
  {
    name: "apply_quick_fix",
    description: "Apply a quick fix for ONE SPECIFIC ISSUE at a time. Fixes only the single issue identified by filePath + line + rule. To fix multiple issues, call this tool multiple times (once per issue). The file is modified directly.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Absolute path to the file to fix",
        },
        line: {
          type: "number",
          description: "Line number of the issue",
        },
        rule: {
          type: "string",
          description: "Rule ID (e.g., 'javascript:S3504')",
        },
      },
      required: ["filePath", "line", "rule"],
    },
  },
  {
    name: "apply_all_quick_fixes",
    description: "Apply ALL available quick fixes for a file in one operation. Automatically identifies and fixes all issues that have SonarLint quick fixes available. More efficient than calling apply_quick_fix multiple times. Returns summary of what was fixed and what issues remain (issues without quick fixes must be fixed manually).",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Absolute path to the file to fix",
        },
      },
      required: ["filePath"],
    },
  },
];

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

// Register MCP resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const resources = [];

  // Add session analysis results as resources
  for (const [filePath, result] of sessionResults) {
    const resourceId = `analysis-${createHash('md5').update(filePath).digest('hex').substring(0, 8)}`;
    resources.push({
      uri: `sonarlint://session/${resourceId}`,
      name: `Analysis: ${basename(filePath)}`,
      description: `${result.summary.total} issues found`,
      mimeType: "application/json",
    });
  }

  // Add batch results
  for (const [batchId, result] of batchResults) {
    resources.push({
      uri: `sonarlint://batch/${batchId}`,
      name: `Batch Analysis: ${result.summary.totalFiles} files`,
      description: `${result.summary.totalIssues} total issues`,
      mimeType: "application/json",
    });
  }

  return { resources };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  if (uri.startsWith('sonarlint://session/')) {
    const resourceId = uri.replace('sonarlint://session/', '');

    // Find matching result
    for (const [filePath, result] of sessionResults) {
      const fileResourceId = createHash('md5').update(filePath).digest('hex').substring(0, 8);
      if (fileResourceId === resourceId) {
        return {
          contents: [{
            uri,
            mimeType: "application/json",
            text: JSON.stringify(result, null, 2),
          }],
        };
      }
    }
  }

  if (uri.startsWith('sonarlint://batch/')) {
    const batchId = uri.replace('sonarlint://batch/', '');
    const result = batchResults.get(batchId);

    if (result) {
      return {
        contents: [{
          uri,
          mimeType: "application/json",
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  }

  throw new Error(`Resource not found: ${uri}`);
});

// Tool handler functions (extracted to reduce cognitive complexity)
async function handleAnalyzeFile(args: any) {
  const { filePath, minSeverity, excludeRules } = args as {
    filePath: string;
    minSeverity?: string;
    excludeRules?: string[]
  };

  // Validate file exists
  if (!existsSync(filePath)) {
    throw new SloopError(
      `File not found: ${filePath}`,
      `The file ${filePath} does not exist. Please check the path and try again.`,
      false
    );
  }

  // Detect language
  const language = detectLanguage(filePath);
  if (language === 'unknown') {
    const ext = extname(filePath);
    throw new SloopError(
      `Unknown language for ${filePath}`,
      `No analyzer available for ${ext} files. Supported extensions: .js, .jsx, .ts, .tsx, .py, .java, .go, .php, .rb, .html, .css, .xml`,
      false
    );
  }

  // Ensure SLOOP is initialized
  const bridge = await ensureSloopBridge();

  // Get or create scope
  const scopeId = getOrCreateScope(filePath);

  console.error(`[MCP] Analyzing file: ${filePath}`);
  console.error(`[MCP] Scope: ${scopeId}, Language: ${language}`);

  // Analyze the file
  console.error(`[MCP] Calling analyzeFilesAndTrack...`);
  const rawResult = await bridge.analyzeFilesAndTrack(scopeId, [filePath]);
  console.error(`[MCP] analyzeFilesAndTrack returned`);

  // Extract issues from raw result
  const rawIssues = rawResult.rawIssues || [];
  console.error(`[MCP] Found ${rawIssues.length} raw issues`);

  // Transform to simplified format
  let issues = transformSloopIssues(rawIssues);

  // Apply filtering if requested
  if (minSeverity) {
    const severityOrder = { INFO: 0, MINOR: 1, MAJOR: 2, CRITICAL: 3, BLOCKER: 4 };
    const minLevel = severityOrder[minSeverity as keyof typeof severityOrder];
    issues = issues.filter(issue =>
      (severityOrder[issue.severity as keyof typeof severityOrder] || 0) >= minLevel
    );
  }

  if (excludeRules && excludeRules.length > 0) {
    issues = issues.filter(issue =>
      !excludeRules.includes(issue.rule)
    );
  }

  // Create result
  const result: AnalysisResult = {
    filePath,
    language,
    issues,
    summary: createSummary(issues, 265), // TODO: Get actual rule count from SLOOP
  };

  // Store in session for MCP resources
  sessionResults.set(filePath, result);

  // Format for display
  const formattedResult = formatAnalysisResult(result);

  return {
    content: [
      {
        type: "text",
        text: formattedResult,
      },
    ],
  };
}

async function handleAnalyzeFiles(args: any) {
  const { filePaths, groupByFile = true, minSeverity, excludeRules } = args as {
    filePaths: string[];
    groupByFile?: boolean;
    minSeverity?: string;
    excludeRules?: string[]
  };

  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    throw new SloopError(
      "No files provided",
      "Please provide at least one file path to analyze.",
      false
    );
  }

  // Validate all files exist
  const missingFiles = filePaths.filter(fp => !existsSync(fp));
  if (missingFiles.length > 0) {
    throw new SloopError(
      `Files not found: ${missingFiles.join(', ')}`,
      `The following files do not exist:\n${missingFiles.map(f => `- ${f}`).join('\n')}`,
      false
    );
  }

  console.error(`[MCP] Batch analyzing ${filePaths.length} files...`);

  // Group files by project root for scope management
  const filesByScope = new Map<string, string[]>();
  for (const filePath of filePaths) {
    const scopeId = getOrCreateScope(filePath);
    if (!filesByScope.has(scopeId)) {
      filesByScope.set(scopeId, []);
    }
    filesByScope.get(scopeId)!.push(filePath);
  }

  // Ensure SLOOP is initialized
  const bridge = await ensureSloopBridge();

  // Analyze each scope
  const allResults: Array<{
    filePath: string;
    language: string;
    issueCount: number;
    issues: AnalysisIssue[];
  }> = [];

  for (const [scopeId, scopeFiles] of filesByScope) {
    console.error(`[MCP] Analyzing ${scopeFiles.length} files in scope ${scopeId}`);

    const rawResult = await bridge.analyzeFilesAndTrack(scopeId, scopeFiles);
    const rawIssues = rawResult.rawIssues || [];

    // Group issues by file
    const issuesByFile = new Map<string, any[]>();
    for (const issue of rawIssues) {
      const fileUri = issue.fileUri;
      if (!issuesByFile.has(fileUri)) {
        issuesByFile.set(fileUri, []);
      }
      issuesByFile.get(fileUri)!.push(issue);
    }

    // Create results for each file
    for (const filePath of scopeFiles) {
      const fileUri = `file://${filePath}`;
      const fileIssues = issuesByFile.get(fileUri) || [];
      let transformedIssues = transformSloopIssues(fileIssues);

      // Apply filtering if requested
      if (minSeverity) {
        const severityOrder = { INFO: 0, MINOR: 1, MAJOR: 2, CRITICAL: 3, BLOCKER: 4 };
        const minLevel = severityOrder[minSeverity as keyof typeof severityOrder];
        transformedIssues = transformedIssues.filter(issue =>
          (severityOrder[issue.severity as keyof typeof severityOrder] || 0) >= minLevel
        );
      }

      if (excludeRules && excludeRules.length > 0) {
        transformedIssues = transformedIssues.filter(issue =>
          !excludeRules.includes(issue.rule)
        );
      }

      allResults.push({
        filePath,
        language: detectLanguage(filePath),
        issueCount: transformedIssues.length,
        issues: transformedIssues,
      });
    }
  }

  // Calculate overall summary
  const overallSummary = {
    totalFiles: allResults.length,
    totalIssues: allResults.reduce((sum, r) => sum + r.issueCount, 0),
    filesWithIssues: allResults.filter(r => r.issueCount > 0).length,
    bySeverity: {
      blocker: 0,
      critical: 0,
      major: 0,
      minor: 0,
      info: 0,
    },
  };

  for (const result of allResults) {
    for (const issue of result.issues) {
      const severity = issue.severity.toLowerCase() as keyof typeof overallSummary.bySeverity;
      if (severity in overallSummary.bySeverity) {
        overallSummary.bySeverity[severity]++;
      }
    }
  }

  const batchResult: BatchAnalysisResult = {
    files: allResults,
    summary: overallSummary,
  };

  // Store in batch results for MCP resources
  const batchId = `batch-${Date.now()}`;
  batchResults.set(batchId, batchResult);

  const formattedResult = formatBatchAnalysisResult(batchResult);

  return {
    content: [
      {
        type: "text",
        text: formattedResult,
      },
    ],
  };
}

async function handleAnalyzeContent(args: any) {
  const { content, language, fileName } = args as { content: string; language: string; fileName?: string };

  if (!content || content.trim().length === 0) {
    throw new SloopError(
      "Empty content",
      "Please provide non-empty content to analyze.",
      false
    );
  }

  // Generate filename with appropriate extension
  const languageExtMap: Record<string, string> = {
    'javascript': '.js',
    'typescript': '.ts',
    'python': '.py',
    'java': '.java',
    'go': '.go',
    'php': '.php',
    'ruby': '.rb',
  };

  const ext = languageExtMap[language] || '.txt';
  const tempFileName = fileName || `.sonarlint-tmp-${Date.now()}${ext}`;
  // Create temp file in project root so SLOOP's listFiles can find it
  const tempFilePath = join(process.cwd(), tempFileName);

  console.error(`[MCP] Analyzing content as ${language}, temp file: ${tempFilePath}`);

  try {
    // Ensure temp directory exists
    const tempDir = dirname(tempFilePath);
    if (!existsSync(tempDir)) {
      const { mkdirSync } = await import('fs');
      mkdirSync(tempDir, { recursive: true });
    }

    // Write content to temp file
    writeFileSync(tempFilePath, content, 'utf-8');

    // Ensure SLOOP is initialized
    const bridge = await ensureSloopBridge();

    // Get or create scope
    const scopeId = getOrCreateScope(tempFilePath);

    // Analyze the temp file
    const rawResult = await bridge.analyzeFilesAndTrack(scopeId, [tempFilePath]);

    // Extract issues from raw result
    const rawIssues = rawResult.rawIssues || [];
    console.error(`[MCP] Found ${rawIssues.length} raw issues in content`);

    // Transform to simplified format
    const issues = transformSloopIssues(rawIssues);

    // Create result
    const result: AnalysisResult = {
      filePath: fileName || 'content',
      language,
      issues,
      summary: createSummary(issues, 265),
    };

    // Format for display
    const formattedResult = formatAnalysisResult(result);

    return {
      content: [
        {
          type: "text",
          text: `${formattedResult}\n\n---\n*Note: Analyzed unsaved content*`,
        },
      ],
    };
  } finally {
    // Clean up temp file
    try {
      if (existsSync(tempFilePath)) {
        unlinkSync(tempFilePath);
      }
    } catch (cleanupError) {
      console.error(`[MCP] Failed to clean up temp file: ${cleanupError}`);
    }
  }
}

async function handleListActiveRules(args: any) {
  const { language } = args as { language?: string };

  console.error(`[MCP] Listing active rules${language ? ` for ${language}` : ''}`);

  // TODO: Extract actual rules from SLOOP plugins via RPC
  // For now, return a summary of known rules
  let output = `# Active SonarLint Rules\n\n`;

  if (!language || language === 'javascript' || language === 'typescript') {
    output += `## JavaScript/TypeScript Rules\n\n`;
    output += `**Total Rules**: 265\n\n`;
    output += `### Rule Categories\n\n`;
    output += `- **Code Smells**: Rules that detect maintainability issues\n`;
    output += `  - \`S1481\`: Unused local variables\n`;
    output += `  - \`S1854\`: Useless assignments\n`;
    output += `  - \`S3504\`: Prefer let/const over var\n`;
    output += `  - \`S107\`: Too many parameters\n`;
    output += `  - \`S4144\`: Duplicate implementations\n`;
    output += `  - \`S2589\`: Always-truthy expressions\n\n`;
    output += `- **Bugs**: Rules that detect potential errors\n`;
    output += `  - \`S2259\`: Null pointer dereference\n`;
    output += `  - \`S3776\`: Cognitive complexity\n\n`;
    output += `- **Security**: Rules that detect security vulnerabilities\n`;
    output += `  - \`S5852\`: Regular expression DoS\n`;
    output += `  - \`S2068\`: Hard-coded credentials\n\n`;
  }

  if (!language || language === 'python') {
    output += `## Python Rules\n\n`;
    output += `**Total Rules**: ~200\n\n`;
    output += `### Rule Categories\n\n`;
    output += `- **Code Smells**: Maintainability issues\n`;
    output += `  - \`S1066\`: Nested if statements\n`;
    output += `  - \`S1192\`: String literals duplicated\n\n`;
    output += `- **Bugs**: Potential errors\n`;
    output += `  - \`S5754\`: Unreachable code\n\n`;
    output += `- **Security**: Security vulnerabilities\n`;
    output += `  - \`S5659\`: Weak encryption\n\n`;
  }

  output += `\n---\n\n`;
  output += `*Note: This is a summary of active rules. Full rule details are available at https://rules.sonarsource.com/*\n`;

  return {
    content: [
      {
        type: "text",
        text: output,
      },
    ],
  };
}

async function handleHealthCheck() {
  console.error(`[MCP] Running health check...`);

  const uptimeMs = Date.now() - serverStartTime;
  const uptimeSeconds = Math.floor(uptimeMs / 1000);
  const uptimeMinutes = Math.floor(uptimeSeconds / 60);
  const uptimeHours = Math.floor(uptimeMinutes / 60);

  const memoryUsage = process.memoryUsage();
  const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);

  // Check SLOOP status
  const sloopStatus = sloopBridge ? "running" : "not started";

  // Get plugin information
  const pluginsDir = join(process.cwd(), "sonarlint-backend", "plugins");
  const pluginsExist = existsSync(pluginsDir);

  let plugins = [];
  if (pluginsExist) {
    const { readdirSync } = await import('fs');
    const files = readdirSync(pluginsDir);
    const jarFiles = files.filter(f => f.endsWith('.jar'));

    for (const jarFile of jarFiles) {
      // Parse plugin name and version from filename
      const match = jarFile.match(/sonar-(\w+)-plugin-([\d.]+)\.jar/);
      if (match) {
        plugins.push({
          name: match[1].charAt(0).toUpperCase() + match[1].slice(1),
          version: match[2],
          status: "active",
        });
      }
    }
  }

  // Cache statistics
  const cacheStats = {
    sessionResults: sessionResults.size,
    batchResults: batchResults.size,
  };

  const healthStatus = {
    status: sloopStatus === "running" && pluginsExist ? "healthy" : "degraded",
    version: "1.0.0 (Phase 3)",
    uptime: {
      milliseconds: uptimeMs,
      seconds: uptimeSeconds,
      minutes: uptimeMinutes,
      hours: uptimeHours,
      formatted: `${uptimeHours}h ${uptimeMinutes % 60}m ${uptimeSeconds % 60}s`,
    },
    backend: {
      status: sloopStatus,
      pluginsDirectory: pluginsExist ? "found" : "missing",
    },
    plugins,
    memory: {
      heapUsed: `${memoryMB}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
    },
    cache: cacheStats,
    tools: ["analyze_file", "analyze_files", "analyze_content", "list_active_rules", "health_check"],
    features: [
      "Session storage for multi-turn conversations",
      "Batch analysis",
      "Content analysis (unsaved files)",
      "MCP resources",
      "Quick fixes support",
    ],
  };

  let output = `# SonarLint MCP Server Health Check\n\n`;
  output += `**Status**: ${healthStatus.status === "healthy" ? "✅ Healthy" : "⚠️ Degraded"}\n`;
  output += `**Version**: ${healthStatus.version}\n`;
  output += `**Uptime**: ${healthStatus.uptime.formatted}\n\n`;

  output += `## Backend Status\n\n`;
  output += `- **SLOOP Backend**: ${healthStatus.backend.status}\n`;
  output += `- **Plugins Directory**: ${healthStatus.backend.pluginsDirectory}\n\n`;

  if (plugins.length > 0) {
    output += `## Active Plugins\n\n`;
    for (const plugin of plugins) {
      output += `- **${plugin.name}**: v${plugin.version} (${plugin.status})\n`;
    }
    output += `\n`;
  }

  output += `## Memory Usage\n\n`;
  output += `- **Heap Used**: ${healthStatus.memory.heapUsed}\n`;
  output += `- **Heap Total**: ${healthStatus.memory.heapTotal}\n`;
  output += `- **RSS**: ${healthStatus.memory.rss}\n\n`;

  output += `## Cache Statistics\n\n`;
  output += `- **Session Results**: ${healthStatus.cache.sessionResults} stored\n`;
  output += `- **Batch Results**: ${healthStatus.cache.batchResults} stored\n\n`;

  output += `## Available Tools\n\n`;
  for (const tool of healthStatus.tools) {
    output += `- ${tool}\n`;
  }
  output += `\n`;

  output += `## Features\n\n`;
  for (const feature of healthStatus.features) {
    output += `- ${feature}\n`;
  }

  return {
    content: [
      {
        type: "text",
        text: output,
      },
    ],
  };
}

async function handleAnalyzeProject(args: any) {
  const { projectPath, maxFiles = 100, minSeverity, excludeRules, includePatterns } = args as {
    projectPath: string;
    maxFiles?: number;
    minSeverity?: string;
    excludeRules?: string[];
    includePatterns?: string[];
  };

  // Validate project path exists
  if (!existsSync(projectPath)) {
    throw new SloopError(
      `Project path not found: ${projectPath}`,
      `The directory ${projectPath} does not exist. Please check the path and try again.`,
      false
    );
  }

  const stats = statSync(projectPath);
  if (!stats.isDirectory()) {
    throw new SloopError(
      `Not a directory: ${projectPath}`,
      `The path ${projectPath} is not a directory. Please provide a directory path.`,
      false
    );
  }

  console.error(`[MCP] Scanning project: ${projectPath}`);

  // Define supported extensions
  const supportedExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.php', '.rb', '.html', '.css', '.xml'];

  // Directories to exclude
  const excludeDirs = new Set([
    'node_modules', 'dist', 'build', '.git', '.svn', '.hg',
    'coverage', '.next', '.nuxt', 'out', 'target', 'bin',
    '__pycache__', '.pytest_cache', '.mypy_cache', 'venv', '.venv'
  ]);

  // Recursively find all source files
  function findSourceFiles(dir: string, files: string[] = []): string[] {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        // Skip excluded directories
        if (entry.isDirectory() && excludeDirs.has(entry.name)) {
          continue;
        }

        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          findSourceFiles(fullPath, files);
        } else if (entry.isFile()) {
          const ext = extname(entry.name);
          if (supportedExtensions.includes(ext)) {
            // Check includePatterns if specified
            if (includePatterns && includePatterns.length > 0) {
              const relativePath = relative(projectPath, fullPath);
              // Simple pattern matching (supports ** and *)
              const matches = includePatterns.some(pattern => {
                const regex = new RegExp(
                  '^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$'
                );
                return regex.test(relativePath);
              });
              if (matches) {
                files.push(fullPath);
              }
            } else {
              files.push(fullPath);
            }
          }
        }
      }
    } catch (err) {
      console.error(`[MCP] Error scanning directory ${dir}:`, err);
    }

    return files;
  }

  const allFiles = findSourceFiles(projectPath);
  console.error(`[MCP] Found ${allFiles.length} source files`);

  if (allFiles.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `No source files found in ${projectPath}.\n\nSupported extensions: ${supportedExtensions.join(', ')}`,
        },
      ],
    };
  }

  // Limit number of files
  const filesToAnalyze = allFiles.slice(0, maxFiles);
  if (allFiles.length > maxFiles) {
    console.error(`[MCP] Limiting analysis to ${maxFiles} files (found ${allFiles.length})`);
  }

  // Use handleAnalyzeFiles to do the actual analysis
  const result = await handleAnalyzeFiles({
    filePaths: filesToAnalyze,
    groupByFile: true,
    minSeverity,
    excludeRules,
  });

  // Add project-specific context to the output
  const resultText = result.content[0].text;
  const projectSummary = `
📦 Project Scan: ${basename(projectPath)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Project Path: ${projectPath}
Total Source Files: ${allFiles.length}
Files Analyzed: ${filesToAnalyze.length}
${allFiles.length > maxFiles ? `⚠️  Limited to ${maxFiles} files (use maxFiles parameter to adjust)\n` : ''}
${resultText}
`;

  return {
    content: [
      {
        type: "text",
        text: projectSummary,
      },
    ],
  };
}

async function handleApplyQuickFix(args: any) {
  const { filePath, line, rule } = args as { filePath: string; line: number; rule: string };

  console.error(`[MCP] Applying quick fix for ${rule} at ${filePath}:${line}`);

  // Validate file exists
  if (!existsSync(filePath)) {
    throw new SloopError(
      `File not found: ${filePath}`,
      `The file ${filePath} does not exist. Please check the path and try again.`,
      false
    );
  }

  // Re-analyze the file to get current issues with quick fixes
  const bridge = await ensureSloopBridge();
  const scopeId = getOrCreateScope(filePath);
  const rawResult = await bridge.analyzeFilesAndTrack(scopeId, [filePath]);
  const rawIssues = rawResult.rawIssues || [];

  // Find the issue at the specified line with the specified rule
  const targetIssue = rawIssues.find((issue: any) => {
    const issueLine = issue.textRange?.startLine || issue.startLine || 0;
    return issueLine === line && issue.ruleKey === rule;
  });

  if (!targetIssue) {
    throw new SloopError(
      `Issue not found`,
      `No issue found at line ${line} with rule ${rule}. The file may have changed since the last analysis.`,
      false
    );
  }

  if (!targetIssue.quickFixes || targetIssue.quickFixes.length === 0) {
    throw new SloopError(
      `No quick fix available`,
      `The issue at line ${line} (${rule}) does not have an automated quick fix available.`,
      false
    );
  }

  // Apply the first quick fix
  const quickFix = targetIssue.quickFixes[0];
  console.error('[DEBUG] Quick fix structure:', JSON.stringify(quickFix, null, 2).substring(0, 1000));

  // Write debug info to a file we can read
  writeFileSync('/tmp/quickfix-debug.json', JSON.stringify({
    targetIssue: {
      ruleKey: targetIssue.ruleKey,
      textRange: targetIssue.textRange,
      quickFixes: targetIssue.quickFixes
    },
    quickFix: quickFix
  }, null, 2), 'utf-8');

  let fileContent = readFileSync(filePath, 'utf-8');
  const lines = fileContent.split('\n');

  // Apply each edit in the quick fix
  const fileEdits = quickFix.inputFileEdits || quickFix.fileEdits || [];
  if (fileEdits.length > 0) {
    console.error(`[DEBUG] Found ${fileEdits.length} file edits`);
    for (const fileEdit of fileEdits) {
      if (fileEdit.textEdits) {
        console.error(`[DEBUG] Found ${fileEdit.textEdits.length} text edits`);
        // Sort edits in reverse order to maintain line numbers
        const sortedEdits = [...fileEdit.textEdits].sort((a, b) => {
          const aStart = a.range?.startLine || 0;
          const bStart = b.range?.startLine || 0;
          return bStart - aStart; // Reverse order
        });

        for (const edit of sortedEdits) {
          const startLine = (edit.range?.startLine || 1) - 1; // Convert to 0-based
          const startCol = edit.range?.startLineOffset || 0;
          const endLine = (edit.range?.endLine || startLine + 1) - 1;
          const endCol = edit.range?.endLineOffset || lines[endLine]?.length || 0;
          const newText = edit.newText || '';

          console.error(`[DEBUG] Applying edit at line ${startLine + 1}:${startCol} to ${endLine + 1}:${endCol}`);
          console.error(`[DEBUG] Old text: "${lines[startLine].substring(startCol, endCol)}"`);
          console.error(`[DEBUG] New text: "${newText}"`);

          // Apply the edit
          if (startLine === endLine) {
            const line = lines[startLine];
            lines[startLine] = line.substring(0, startCol) + newText + line.substring(endCol);
            console.error(`[DEBUG] Result: "${lines[startLine]}"`);
          } else {
            // Multi-line edit
            const firstLine = lines[startLine].substring(0, startCol) + newText;
            const lastLine = lines[endLine].substring(endCol);
            lines.splice(startLine, endLine - startLine + 1, firstLine + lastLine);
          }
        }
      }
    }
  } else {
    console.error('[DEBUG] No fileEdits found in quick fix!');
  }

  // Write the modified content back
  fileContent = lines.join('\n');
  console.error(`[DEBUG] About to write file: ${filePath}`);
  console.error(`[DEBUG] File content length: ${fileContent.length} chars`);
  console.error(`[DEBUG] First 200 chars: ${fileContent.substring(0, 200)}`);

  try {
    writeFileSync(filePath, fileContent, 'utf-8');
    console.error(`[DEBUG] File written successfully`);
  } catch (err) {
    console.error(`[DEBUG] Error writing file:`, err);
    throw err;
  }

  // Notify SLOOP that file system was updated (proper cache invalidation)
  console.error(`[Cache] Sending file system update notification...`);
  await notifyFileSystemChanged(filePath, scopeId);

  console.error(`[Cache] File system update notification sent, waiting for SLOOP to process...`);

  // CRITICAL: Give SLOOP time to process the file system notification
  // Without this delay, the next analysis request may arrive before SLOOP updates its registry
  await new Promise(resolve => setTimeout(resolve, 500));

  return {
    content: [
      {
        type: "text",
        text: `✅ **Quick fix applied successfully**\n\nFile: ${filePath}\nLine: ${line}\nRule: ${rule}\nFix: ${quickFix.message || 'Applied automated fix'}\n\nThe file has been modified. You may want to re-analyze it to confirm the issue is resolved.`,
      },
    ],
  };
}

async function handleApplyAllQuickFixes(args: any) {
  const { filePath } = args as { filePath: string };

  console.error(`[MCP] Applying all quick fixes for ${filePath}`);

  // Validate file exists
  if (!existsSync(filePath)) {
    throw new SloopError(
      `File not found: ${filePath}`,
      `The file ${filePath} does not exist. Please check the path and try again.`,
      false
    );
  }

  // Analyze the file to get all issues with quick fixes
  const bridge = await ensureSloopBridge();
  const scopeId = getOrCreateScope(filePath);
  const rawResult = await bridge.analyzeFilesAndTrack(scopeId, [filePath]);
  const rawIssues = rawResult.rawIssues || [];

  console.error(`[MCP] Found ${rawIssues.length} total issues`);

  // Filter issues that have quick fixes
  const issuesWithQuickFixes = rawIssues.filter((issue: any) => {
    const hasQuickFixes = issue.quickFixes && issue.quickFixes.length > 0;
    if (hasQuickFixes) {
      console.error(`[DEBUG] Issue at line ${issue.textRange?.startLine || issue.startLine}: ${issue.ruleKey} has ${issue.quickFixes.length} quick fixes`);
    }
    return hasQuickFixes;
  });

  console.error(`[MCP] Found ${issuesWithQuickFixes.length} issues with quick fixes`);

  if (issuesWithQuickFixes.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `ℹ️ **No quick fixes available**\n\nFile: ${filePath}\nTotal issues: ${rawIssues.length}\n\nNone of the issues in this file have automated quick fixes available. All issues must be fixed manually.`,
        },
      ],
    };
  }

  // Sort issues by line number (descending) to avoid line number shifts
  const sortedIssues = [...issuesWithQuickFixes].sort((a, b) => {
    const aLine = a.textRange?.startLine || a.startLine || 0;
    const bLine = b.textRange?.startLine || b.startLine || 0;
    return bLine - aLine; // Descending order
  });

  // Apply each quick fix
  const appliedFixes: Array<{ line: number; rule: string; message: string }> = [];
  const failedFixes: Array<{ line: number; rule: string; error: string }> = [];

  for (const issue of sortedIssues) {
    const line = issue.textRange?.startLine || issue.startLine || 0;
    const rule = issue.ruleKey;
    const quickFix = issue.quickFixes[0]; // Use first available quick fix

    console.error(`[MCP] Applying fix for ${rule} at line ${line}`);

    try {
      // Read current file content
      let fileContent = readFileSync(filePath, 'utf-8');
      const lines = fileContent.split('\n');

      // Apply the quick fix edits
      const fileEdits = quickFix.inputFileEdits || quickFix.fileEdits || [];
      if (fileEdits.length > 0) {
        for (const fileEdit of fileEdits) {
          if (fileEdit.textEdits) {
            // Sort edits in reverse order to maintain line numbers
            const sortedEdits = [...fileEdit.textEdits].sort((a, b) => {
              const aStart = a.range?.startLine || 0;
              const bStart = b.range?.startLine || 0;
              return bStart - aStart;
            });

            for (const edit of sortedEdits) {
              const startLine = (edit.range?.startLine || 1) - 1;
              const startCol = edit.range?.startLineOffset || 0;
              const endLine = (edit.range?.endLine || startLine + 1) - 1;
              const endCol = edit.range?.endLineOffset || lines[endLine]?.length || 0;
              const newText = edit.newText || '';

              if (startLine === endLine) {
                const currentLine = lines[startLine];
                lines[startLine] = currentLine.substring(0, startCol) + newText + currentLine.substring(endCol);
              } else {
                const firstLine = lines[startLine].substring(0, startCol) + newText;
                const lastLine = lines[endLine].substring(endCol);
                lines.splice(startLine, endLine - startLine + 1, firstLine + lastLine);
              }
            }
          }
        }
      }

      // Write back to file
      fileContent = lines.join('\n');
      writeFileSync(filePath, fileContent, 'utf-8');

      appliedFixes.push({
        line,
        rule,
        message: quickFix.message || 'Applied automated fix',
      });

      console.error(`[MCP] Successfully applied fix for ${rule} at line ${line}`);
    } catch (error) {
      console.error(`[MCP] Failed to apply fix for ${rule} at line ${line}:`, error);
      failedFixes.push({
        line,
        rule,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Notify SLOOP about file changes
  console.error(`[Cache] Sending file system update notification...`);
  await notifyFileSystemChanged(filePath, scopeId);
  await new Promise(resolve => setTimeout(resolve, 500));

  // Re-analyze to get remaining issues
  const finalResult = await bridge.analyzeFilesAndTrack(scopeId, [filePath]);
  const remainingIssues = finalResult.rawIssues || [];
  const transformedRemaining = transformSloopIssues(remainingIssues);

  // Format summary
  let summary = `✅ **Quick fixes applied**\n\n`;
  summary += `File: ${filePath}\n`;
  summary += `Applied: ${appliedFixes.length} fixes\n`;
  if (failedFixes.length > 0) {
    summary += `Failed: ${failedFixes.length} fixes\n`;
  }
  summary += `Remaining issues: ${remainingIssues.length}\n\n`;

  if (appliedFixes.length > 0) {
    summary += `**Fixed Issues:**\n`;
    for (const fix of appliedFixes) {
      summary += `- Line ${fix.line}: ${fix.rule} - ${fix.message}\n`;
    }
    summary += `\n`;
  }

  if (failedFixes.length > 0) {
    summary += `**Failed Fixes:**\n`;
    for (const fail of failedFixes) {
      summary += `- Line ${fail.line}: ${fail.rule} - ${fail.error}\n`;
    }
    summary += `\n`;
  }

  if (remainingIssues.length > 0) {
    summary += `**Remaining Issues (require manual fixing):**\n`;
    const groupedBySeverity = transformedRemaining.reduce((acc, issue) => {
      if (!acc[issue.severity]) acc[issue.severity] = [];
      acc[issue.severity].push(issue);
      return acc;
    }, {} as Record<string, typeof transformedRemaining>);

    for (const severity of ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO']) {
      const issues = groupedBySeverity[severity] || [];
      if (issues.length > 0) {
        summary += `\n${severity} (${issues.length}):\n`;
        for (const issue of issues) {
          summary += `- Line ${issue.line}: ${issue.rule} - ${issue.message}\n`;
        }
      }
    }
  } else {
    summary += `🎉 All issues resolved! The file has no remaining code quality issues.\n`;
  }

  return {
    content: [
      {
        type: "text",
        text: summary,
      },
    ],
  };
}

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "analyze_file":
        return await handleAnalyzeFile(args);

      case "analyze_files":
        return await handleAnalyzeFiles(args);

      case "analyze_content":
        return await handleAnalyzeContent(args);

      case "list_active_rules":
        return await handleListActiveRules(args);

      case "health_check":
        return await handleHealthCheck();

      case "analyze_project":
        return await handleAnalyzeProject(args);

      case "apply_quick_fix":
        return await handleApplyQuickFix(args);

      case "apply_all_quick_fixes":
        return await handleApplyAllQuickFixes(args);

      default:
        throw new SloopError(
          `Unknown tool: ${name}`,
          `The tool '${name}' is not recognized. Available tools: analyze_file, analyze_files, analyze_content, list_active_rules, health_check, analyze_project, apply_quick_fix, apply_all_quick_fixes`,
          false
        );
    }
  } catch (error) {
    console.error("[MCP] Error handling tool call:", error);

    if (error instanceof SloopError) {
      return {
        content: [
          {
            type: "text",
            text: `❌ **Error**: ${error.userMessage}`,
          },
        ],
        isError: true,
      };
    }

    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      content: [
        {
          type: "text",
          text: `❌ **Error**: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Graceful shutdown
async function shutdown() {
  console.error("[MCP] Shutting down...");
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

  // Initialize SLOOP backend eagerly to avoid first-request delays
  console.error("[MCP] Initializing SLOOP backend...");
  try {
    await ensureSloopBridge();
    console.error("[MCP] SLOOP backend ready");
  } catch (error) {
    console.error("[MCP] Warning: SLOOP backend initialization failed:", error);
    console.error("[MCP] Server will continue, but analysis requests will fail until backend starts");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[MCP] Server ready! Waiting for tool calls...");
}

main().catch((error) => {
  console.error("[MCP] Fatal error:", error);
  process.exit(1);
});
