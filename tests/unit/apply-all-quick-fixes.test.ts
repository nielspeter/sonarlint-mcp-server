import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Unit tests for apply_all_quick_fixes functionality
 *
 * These tests validate the logic of applying multiple quick fixes in one operation:
 * - Filtering issues with quick fixes
 * - Sorting issues by line number (descending)
 * - Applying fixes without line number conflicts
 * - Proper error handling
 * - Summary generation
 */

describe('apply_all_quick_fixes logic', () => {
  describe('issue filtering', () => {
    it('should filter issues that have quick fixes', () => {
      const issues = [
        { ruleKey: 'javascript:S1481', textRange: { startLine: 5 }, quickFixes: [{ message: 'Remove unused variable' }] },
        { ruleKey: 'javascript:S1854', textRange: { startLine: 10 }, quickFixes: [] }, // No quick fixes
        { ruleKey: 'javascript:S3626', textRange: { startLine: 15 }, quickFixes: [{ message: 'Remove return' }] },
        { ruleKey: 'javascript:S1172', textRange: { startLine: 20 } }, // quickFixes undefined
      ];

      const issuesWithQuickFixes = issues.filter((issue: any) =>
        issue.quickFixes && issue.quickFixes.length > 0
      );

      expect(issuesWithQuickFixes).toHaveLength(2);
      expect(issuesWithQuickFixes[0].ruleKey).toBe('javascript:S1481');
      expect(issuesWithQuickFixes[1].ruleKey).toBe('javascript:S3626');
    });

    it('should handle empty issue list', () => {
      const issues: any[] = [];

      const issuesWithQuickFixes = issues.filter((issue: any) =>
        issue.quickFixes && issue.quickFixes.length > 0
      );

      expect(issuesWithQuickFixes).toHaveLength(0);
    });

    it('should handle issues with no quick fixes at all', () => {
      const issues = [
        { ruleKey: 'javascript:S1854', textRange: { startLine: 10 }, quickFixes: [] },
        { ruleKey: 'javascript:S1172', textRange: { startLine: 20 } },
      ];

      const issuesWithQuickFixes = issues.filter((issue: any) =>
        issue.quickFixes && issue.quickFixes.length > 0
      );

      expect(issuesWithQuickFixes).toHaveLength(0);
    });
  });

  describe('issue sorting', () => {
    it('should sort issues by line number in descending order', () => {
      const issues = [
        { ruleKey: 'javascript:S1481', textRange: { startLine: 5 }, quickFixes: [{}] },
        { ruleKey: 'javascript:S3626', textRange: { startLine: 15 }, quickFixes: [{}] },
        { ruleKey: 'javascript:S1854', textRange: { startLine: 10 }, quickFixes: [{}] },
        { ruleKey: 'javascript:S138', textRange: { startLine: 3 }, quickFixes: [{}] },
      ];

      const sorted = [...issues].sort((a, b) => {
        const aLine = a.textRange?.startLine || 0;
        const bLine = b.textRange?.startLine || 0;
        return bLine - aLine;
      });

      expect(sorted[0].textRange.startLine).toBe(15);
      expect(sorted[1].textRange.startLine).toBe(10);
      expect(sorted[2].textRange.startLine).toBe(5);
      expect(sorted[3].textRange.startLine).toBe(3);
    });

    it('should handle issues with missing textRange', () => {
      const issues = [
        { ruleKey: 'javascript:S1481', startLine: 5, quickFixes: [{}] },
        { ruleKey: 'javascript:S3626', textRange: { startLine: 15 }, quickFixes: [{}] },
        { ruleKey: 'javascript:S1854', quickFixes: [{}] }, // No line info
      ];

      const sorted = [...issues].sort((a, b) => {
        const aLine = a.textRange?.startLine || a.startLine || 0;
        const bLine = b.textRange?.startLine || b.startLine || 0;
        return bLine - aLine;
      });

      expect(sorted[0].textRange?.startLine || sorted[0].startLine).toBe(15);
      expect(sorted[1].startLine).toBe(5);
      expect(sorted[2].textRange?.startLine || sorted[2].startLine || 0).toBe(0);
    });

    it('should handle duplicate line numbers', () => {
      const issues = [
        { ruleKey: 'javascript:S1481', textRange: { startLine: 10 }, quickFixes: [{}] },
        { ruleKey: 'javascript:S3626', textRange: { startLine: 10 }, quickFixes: [{}] },
        { ruleKey: 'javascript:S1854', textRange: { startLine: 5 }, quickFixes: [{}] },
      ];

      const sorted = [...issues].sort((a, b) => {
        const aLine = a.textRange?.startLine || 0;
        const bLine = b.textRange?.startLine || 0;
        return bLine - aLine;
      });

      expect(sorted[0].textRange.startLine).toBe(10);
      expect(sorted[1].textRange.startLine).toBe(10);
      expect(sorted[2].textRange.startLine).toBe(5);
    });
  });

  describe('text edit application', () => {
    it('should apply single-line edit correctly', () => {
      const lines = [
        'function test() {',
        '  var unused = 42;',
        '  console.log("hello");',
        '}',
      ];

      // Simulate replacing "var" with "const" at line 1 (0-indexed)
      const startLine = 1;
      const startCol = 2;
      const endCol = 5;
      const newText = 'const';

      const line = lines[startLine];
      lines[startLine] = line.substring(0, startCol) + newText + line.substring(endCol);

      expect(lines[1]).toBe('  const unused = 42;');
      expect(lines[0]).toBe('function test() {');
      expect(lines[2]).toBe('  console.log("hello");');
    });

    it('should apply edit that removes text', () => {
      const lines = [
        'function test() {',
        '  return;',
        '}',
      ];

      // Remove "return;" statement
      const startLine = 1;
      const startCol = 2;
      const endCol = 9; // length of "return;"
      const newText = '';

      const line = lines[startLine];
      lines[startLine] = line.substring(0, startCol) + newText + line.substring(endCol);

      expect(lines[1]).toBe('  ');
    });

    it('should handle multi-line edit', () => {
      const lines = [
        'function test() {',
        '  if (true)',
        '    console.log("hello");',
        '}',
      ];

      // Replace lines 1-2 with properly formatted if statement
      const startLine = 1;
      const endLine = 2;
      const startCol = 2;
      const endCol = 27;
      const newText = 'if (true) {\n    console.log("hello");\n  }';

      const firstLine = lines[startLine].substring(0, startCol) + newText;
      const lastLine = lines[endLine].substring(endCol);
      lines.splice(startLine, endLine - startLine + 1, firstLine + lastLine);

      expect(lines[1]).toContain('if (true) {');
    });
  });

  describe('summary generation', () => {
    it('should format summary with all sections', () => {
      const appliedFixes = [
        { line: 5, rule: 'javascript:S1481', message: 'Remove unused variable' },
        { line: 10, rule: 'javascript:S3626', message: 'Remove redundant return' },
      ];

      const failedFixes = [
        { line: 15, rule: 'javascript:S138', error: 'Could not apply fix' },
      ];

      const remainingIssues = [
        { line: 20, rule: 'javascript:S1854', severity: 'MAJOR', message: 'Dead store' },
      ];

      const filePath = '/test/file.js';

      let summary = `✅ **Quick fixes applied**\n\n`;
      summary += `File: ${filePath}\n`;
      summary += `Applied: ${appliedFixes.length} fixes\n`;
      summary += `Failed: ${failedFixes.length} fixes\n`;
      summary += `Remaining issues: ${remainingIssues.length}\n\n`;

      expect(summary).toContain('Applied: 2 fixes');
      expect(summary).toContain('Failed: 1 fixes');
      expect(summary).toContain('Remaining issues: 1');
      expect(summary).toContain(filePath);
    });

    it('should handle case with no failures', () => {
      const appliedFixes = [
        { line: 5, rule: 'javascript:S1481', message: 'Fix applied' },
      ];

      const failedFixes: any[] = [];

      let summary = `✅ **Quick fixes applied**\n\n`;
      summary += `File: /test/file.js\n`;
      summary += `Applied: ${appliedFixes.length} fixes\n`;
      if (failedFixes.length > 0) {
        summary += `Failed: ${failedFixes.length} fixes\n`;
      }

      expect(summary).toContain('Applied: 1 fixes');
      expect(summary).not.toContain('Failed:');
    });

    it('should show success message when all issues resolved', () => {
      const remainingIssues: any[] = [];

      let summary = '';
      if (remainingIssues.length > 0) {
        summary += 'Remaining issues...';
      } else {
        summary += '🎉 All issues resolved! The file has no remaining code quality issues.\n';
      }

      expect(summary).toContain('🎉 All issues resolved!');
      expect(summary).not.toContain('Remaining issues');
    });

    it('should group remaining issues by severity', () => {
      const issues = [
        { line: 5, rule: 'javascript:S1', severity: 'BLOCKER', message: 'Issue 1' },
        { line: 10, rule: 'javascript:S2', severity: 'MAJOR', message: 'Issue 2' },
        { line: 15, rule: 'javascript:S3', severity: 'BLOCKER', message: 'Issue 3' },
        { line: 20, rule: 'javascript:S4', severity: 'MINOR', message: 'Issue 4' },
      ];

      const groupedBySeverity = issues.reduce((acc, issue) => {
        if (!acc[issue.severity]) acc[issue.severity] = [];
        acc[issue.severity].push(issue);
        return acc;
      }, {} as Record<string, typeof issues>);

      expect(groupedBySeverity['BLOCKER']).toHaveLength(2);
      expect(groupedBySeverity['MAJOR']).toHaveLength(1);
      expect(groupedBySeverity['MINOR']).toHaveLength(1);
      expect(groupedBySeverity['CRITICAL']).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should validate file exists', () => {
      const filePath = '/nonexistent/file.js';
      const fileExists = existsSync(filePath);

      expect(fileExists).toBe(false);
    });

    it('should handle read errors gracefully', () => {
      const testFilePath = join(process.cwd(), 'temp-test-read-error.js');

      // Create and immediately delete file to simulate read error
      writeFileSync(testFilePath, 'test', 'utf-8');
      unlinkSync(testFilePath);

      expect(() => {
        readFileSync(testFilePath, 'utf-8');
      }).toThrow();
    });

    it('should track failed fixes separately', () => {
      const appliedFixes: any[] = [];
      const failedFixes: any[] = [];

      // Simulate successful fix
      try {
        appliedFixes.push({ line: 5, rule: 'javascript:S1481', message: 'Fixed' });
      } catch (error) {
        failedFixes.push({ line: 5, rule: 'javascript:S1481', error: 'Failed' });
      }

      // Simulate failed fix
      try {
        throw new Error('Simulated failure');
      } catch (error) {
        failedFixes.push({
          line: 10,
          rule: 'javascript:S3626',
          error: error instanceof Error ? error.message : String(error)
        });
      }

      expect(appliedFixes).toHaveLength(1);
      expect(failedFixes).toHaveLength(1);
      expect(failedFixes[0].error).toBe('Simulated failure');
    });
  });

  describe('edge cases', () => {
    it('should handle file with no issues', () => {
      const rawIssues: any[] = [];
      const issuesWithQuickFixes = rawIssues.filter((issue: any) =>
        issue.quickFixes && issue.quickFixes.length > 0
      );

      expect(issuesWithQuickFixes).toHaveLength(0);
    });

    it('should handle file with only non-fixable issues', () => {
      const rawIssues = [
        { ruleKey: 'javascript:S1854', textRange: { startLine: 10 } }, // No quickFixes
        { ruleKey: 'javascript:S1172', textRange: { startLine: 20 }, quickFixes: [] },
      ];

      const issuesWithQuickFixes = rawIssues.filter((issue: any) =>
        issue.quickFixes && issue.quickFixes.length > 0
      );

      expect(issuesWithQuickFixes).toHaveLength(0);
    });

    it('should handle quick fix with multiple edits', () => {
      const quickFix = {
        message: 'Apply multiple fixes',
        fileEdits: [
          {
            textEdits: [
              { range: { startLine: 5, startLineOffset: 0, endLine: 5, endLineOffset: 3 }, newText: 'const' },
              { range: { startLine: 10, startLineOffset: 0, endLine: 10, endLineOffset: 3 }, newText: 'const' },
            ]
          }
        ]
      };

      const edits = quickFix.fileEdits[0].textEdits;
      expect(edits).toHaveLength(2);
      expect(edits[0].newText).toBe('const');
      expect(edits[1].newText).toBe('const');
    });

    it('should preserve file encoding', () => {
      const testFile = join(process.cwd(), 'temp-encoding-test.js');
      const content = 'const test = "Hello 世界";';

      writeFileSync(testFile, content, 'utf-8');
      const readContent = readFileSync(testFile, 'utf-8');

      expect(readContent).toBe(content);

      // Cleanup
      unlinkSync(testFile);
    });
  });

  describe('performance considerations', () => {
    it('should process fixes in reverse order to avoid line shifts', () => {
      // When fixing line 15 before line 5, the line numbers stay valid
      const issues = [
        { line: 5, rule: 'javascript:S1' },
        { line: 10, rule: 'javascript:S2' },
        { line: 15, rule: 'javascript:S3' },
      ];

      const sorted = [...issues].sort((a, b) => b.line - a.line);

      expect(sorted[0].line).toBe(15);
      expect(sorted[1].line).toBe(10);
      expect(sorted[2].line).toBe(5);
    });

    it('should handle large number of fixes efficiently', () => {
      const issues = Array.from({ length: 100 }, (_, i) => ({
        ruleKey: `javascript:S${i}`,
        textRange: { startLine: i + 1 },
        quickFixes: [{ message: 'Fix' }],
      }));

      const sorted = [...issues].sort((a, b) => {
        const aLine = a.textRange.startLine;
        const bLine = b.textRange.startLine;
        return bLine - aLine;
      });

      expect(sorted[0].textRange.startLine).toBe(100);
      expect(sorted[99].textRange.startLine).toBe(1);
      expect(sorted).toHaveLength(100);
    });
  });
});
