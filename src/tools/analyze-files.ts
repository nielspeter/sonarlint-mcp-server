import { existsSync } from "fs";
import { SloopError } from "../errors.js";
import { ensureSloopBridge } from "../utils/sloop.js";
import { getOrCreateScope } from "../utils/scope.js";
import { detectLanguage } from "../utils/language.js";
import { transformSloopIssues } from "../utils/transforms.js";
import { formatBatchAnalysisResult } from "../utils/formatting.js";
import { batchResults } from "../state.js";
import type { AnalysisIssue, BatchAnalysisResult } from "../types.js";

export async function handleAnalyzeFiles(args: any) {
  const { filePaths, minSeverity, excludeRules } = args as {
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
        type: "text" as const,
        text: formattedResult,
      },
    ],
  };
}
