import { describe, it, expect } from 'vitest';
import { formatBatchAnalysisResult } from '../../src/utils/formatting.js';
import type { BatchAnalysisResult } from '../../src/types.js';

describe('formatBatchAnalysisResult', () => {
  it('should not list clean files individually', () => {
    const result: BatchAnalysisResult = {
      files: [
        { filePath: '/clean1.ts', language: 'typescript', issueCount: 0, issues: [] },
        { filePath: '/clean2.ts', language: 'typescript', issueCount: 0, issues: [] },
        {
          filePath: '/dirty.ts', language: 'typescript', issueCount: 1,
          issues: [{ line: 10, column: 0, endLine: 10, endColumn: 5, severity: 'MAJOR', rule: 'typescript:S3776', ruleDescription: '', message: 'Cognitive Complexity too high' }],
        },
      ],
      summary: {
        totalFiles: 3, totalIssues: 1, filesWithIssues: 1,
        bySeverity: { blocker: 0, critical: 0, major: 1, minor: 0, info: 0 },
      },
    };

    const output = formatBatchAnalysisResult(result);

    // Clean files should NOT appear as individual entries
    expect(output).not.toContain('/clean1.ts');
    expect(output).not.toContain('/clean2.ts');
    // But should have a summary line
    expect(output).toContain('2 files clean');
    // Dirty file should appear with table format
    expect(output).toContain('/dirty.ts');
    expect(output).toContain('| Line | Severity | Rule | Message |');
  });

  it('should show only summary when no issues found', () => {
    const result: BatchAnalysisResult = {
      files: [
        { filePath: '/a.ts', language: 'typescript', issueCount: 0, issues: [] },
      ],
      summary: {
        totalFiles: 1, totalIssues: 0, filesWithIssues: 0,
        bySeverity: { blocker: 0, critical: 0, major: 0, minor: 0, info: 0 },
      },
    };

    const output = formatBatchAnalysisResult(result);
    expect(output).toContain('1 files clean');
    expect(output).not.toContain('| Line |');
  });

  it('should use table format for issues', () => {
    const result: BatchAnalysisResult = {
      files: [
        {
          filePath: '/file.ts', language: 'typescript', issueCount: 2,
          issues: [
            { line: 5, column: 0, endLine: 5, endColumn: 10, severity: 'MAJOR', rule: 'typescript:S107', ruleDescription: '', message: 'Too many params' },
            { line: 20, column: 0, endLine: 20, endColumn: 10, severity: 'MINOR', rule: 'typescript:S1481', ruleDescription: '', message: 'Unused variable' },
          ],
        },
      ],
      summary: {
        totalFiles: 1, totalIssues: 2, filesWithIssues: 1,
        bySeverity: { blocker: 0, critical: 0, major: 1, minor: 1, info: 0 },
      },
    };

    const output = formatBatchAnalysisResult(result);
    expect(output).toContain('| 5 | MAJOR | `typescript:S107` | Too many params |');
    expect(output).toContain('| 20 | MINOR | `typescript:S1481` | Unused variable |');
  });

  it('should sort files by issue count descending', () => {
    const result: BatchAnalysisResult = {
      files: [
        {
          filePath: '/few.ts', language: 'typescript', issueCount: 1,
          issues: [{ line: 1, column: 0, endLine: 1, endColumn: 5, severity: 'MINOR', rule: 'r:1', ruleDescription: '', message: 'x' }],
        },
        {
          filePath: '/many.ts', language: 'typescript', issueCount: 3,
          issues: [
            { line: 1, column: 0, endLine: 1, endColumn: 5, severity: 'MAJOR', rule: 'r:1', ruleDescription: '', message: 'a' },
            { line: 2, column: 0, endLine: 2, endColumn: 5, severity: 'MAJOR', rule: 'r:2', ruleDescription: '', message: 'b' },
            { line: 3, column: 0, endLine: 3, endColumn: 5, severity: 'MAJOR', rule: 'r:3', ruleDescription: '', message: 'c' },
          ],
        },
      ],
      summary: {
        totalFiles: 2, totalIssues: 4, filesWithIssues: 2,
        bySeverity: { blocker: 0, critical: 0, major: 3, minor: 1, info: 0 },
      },
    };

    const output = formatBatchAnalysisResult(result);
    const manyIdx = output.indexOf('/many.ts');
    const fewIdx = output.indexOf('/few.ts');
    expect(manyIdx).toBeLessThan(fewIdx);
  });
});
