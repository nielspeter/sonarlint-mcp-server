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
 * Format batch analysis result for display.
 * Only shows files with issues; clean files get a single summary line.
 */
export function formatBatchAnalysisResult(result: BatchAnalysisResult): string {
  const { files, summary } = result;
  const cleanFiles = summary.totalFiles - summary.filesWithIssues;

  let output = `# Batch Analysis Results\n\n`;
  output += `**Files Analyzed**: ${summary.totalFiles}\n`;
  output += `**Files with Issues**: ${summary.filesWithIssues}\n`;
  output += `**Total Issues**: ${summary.totalIssues}\n\n`;

  if (summary.totalIssues === 0) {
    output += `✅ ${cleanFiles} files clean — no issues found.\n`;
    return output;
  }

  // Severity breakdown
  const severities: [string, string, number][] = [
    ['🔴', 'BLOCKER', summary.bySeverity.blocker],
    ['🟠', 'CRITICAL', summary.bySeverity.critical],
    ['🟡', 'MAJOR', summary.bySeverity.major],
    ['🔵', 'MINOR', summary.bySeverity.minor],
    ['⚪', 'INFO', summary.bySeverity.info],
  ];
  for (const [icon, label, count] of severities) {
    if (count > 0) output += `- ${icon} **${label}**: ${count}\n`;
  }
  output += `\n`;

  // Only show files with issues, sorted by issue count descending
  const filesWithIssues = files
    .filter(f => f.issueCount > 0)
    .sort((a, b) => b.issueCount - a.issueCount);

  for (const file of filesWithIssues) {
    output += `### ${file.filePath} (${file.issueCount} issue${file.issueCount > 1 ? 's' : ''})\n\n`;
    output += `| Line | Severity | Rule | Message |\n`;
    output += `|------|----------|------|---------|\n`;

    const sorted = [...file.issues].sort((a, b) => a.line - b.line);
    for (const issue of sorted) {
      const qf = issue.quickFix ? ' 🔧' : '';
      output += `| ${issue.line} | ${issue.severity} | \`${issue.rule}\` | ${issue.message}${qf} |\n`;
    }
    output += `\n`;
  }

  if (cleanFiles > 0) {
    output += `✅ ${cleanFiles} file${cleanFiles > 1 ? 's' : ''} clean\n`;
  }

  return output;
}
