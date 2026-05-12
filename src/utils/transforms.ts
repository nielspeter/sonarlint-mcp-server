/**
 * Data transformation utilities
 */

import type { AnalysisIssue } from '../types.js';

type LegacySeverity = 'INFO' | 'MINOR' | 'MAJOR' | 'CRITICAL' | 'BLOCKER';

const LEGACY_SEVERITIES: ReadonlySet<string> = new Set(['INFO', 'MINOR', 'MAJOR', 'CRITICAL', 'BLOCKER']);

// MQR ImpactSeverity → legacy IssueSeverity. INFO and BLOCKER are shared between scales.
const MQR_TO_LEGACY: Record<string, LegacySeverity> = {
  INFO: 'INFO',
  LOW: 'MINOR',
  MEDIUM: 'MAJOR',
  HIGH: 'CRITICAL',
  BLOCKER: 'BLOCKER',
};

const SEVERITY_RANK: Record<LegacySeverity, number> = {
  INFO: 0,
  MINOR: 1,
  MAJOR: 2,
  CRITICAL: 3,
  BLOCKER: 4,
};

// SLOOP's severityMode is Either<StandardModeDetails, MQRModeDetails> — we read whichever shape is present.
function extractSeverity(issue: any): LegacySeverity {
  const mode = issue.severityMode;
  if (mode && typeof mode === 'object') {
    if (typeof mode.severity === 'string' && LEGACY_SEVERITIES.has(mode.severity)) {
      return mode.severity as LegacySeverity;
    }
    if (Array.isArray(mode.impacts) && mode.impacts.length > 0) {
      let worst: LegacySeverity | null = null;
      for (const impact of mode.impacts) {
        const mapped = MQR_TO_LEGACY[impact?.impactSeverity];
        if (mapped && (worst === null || SEVERITY_RANK[mapped] > SEVERITY_RANK[worst])) {
          worst = mapped;
        }
      }
      if (worst) return worst;
    }
  }
  return 'MAJOR';
}

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
      endColumn:
        issue.textRange?.endLineOffset || issue.endColumn || issue.textRange?.startLineOffset || issue.startColumn || 0,
      severity: extractSeverity(issue),
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
          })),
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
