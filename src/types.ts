/**
 * Shared type definitions for the SonarLint MCP Server
 */

export interface AnalysisIssue {
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

export interface QuickFix {
  description: string;
  edits: TextEdit[];
}

export interface TextEdit {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  newText: string;
}

export interface AnalysisResult {
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

export interface BatchAnalysisResult {
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
