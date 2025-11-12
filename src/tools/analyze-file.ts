import { existsSync } from "fs";
import { extname } from "path";
import { SloopError } from "../errors.js";
import { ensureSloopBridge } from "../utils/sloop.js";
import { getOrCreateScope } from "../utils/scope.js";
import { detectLanguage } from "../utils/language.js";
import { transformSloopIssues, createSummary } from "../utils/transforms.js";
import { formatAnalysisResult } from "../utils/formatting.js";
import { sessionResults } from "../state.js";
import type { AnalysisResult } from "../types.js";

export async function handleAnalyzeFile(args: any) {
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
        type: "text" as const,
        text: formattedResult,
      },
    ],
  };
}
