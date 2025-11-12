/**
 * Output formatting utilities
 */

import type { AnalysisResult, BatchAnalysisResult, AnalysisIssue } from "../types.js";

/**
 * Format analysis result for display
 */
export function formatAnalysisResult(result: AnalysisResult): string {
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

/**
 * Format batch analysis result for display
 */
export function formatBatchAnalysisResult(result: BatchAnalysisResult): string {
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
