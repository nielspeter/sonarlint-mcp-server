/**
 * Data transformation utilities
 */

import type { AnalysisIssue } from "../types.js";

/**
 * Transform raw SLOOP issues to simplified format
 */
export function transformSloopIssues(rawIssues: any[]): AnalysisIssue[] {
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

/**
 * Create analysis summary from issues
 */
export function createSummary(issues: AnalysisIssue[], rulesChecked: number) {
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
