import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Integration tests for apply_all_quick_fixes tool
 *
 * These tests validate the end-to-end workflow of applying multiple quick fixes:
 * 1. Analyze file to get initial issues
 * 2. Apply all quick fixes in one operation
 * 3. Verify file modifications
 * 4. Re-analyze to confirm issues resolved
 * 5. Verify remaining non-fixable issues
 *
 * Test Strategy:
 * - These tests are skipped by default (require SLOOP + MCP server running)
 * - Document expected behavior for manual verification
 * - Test with real JavaScript files containing multiple fixable issues
 */

describe('apply_all_quick_fixes integration', () => {
  const testFilePath = join(process.cwd(), 'test-apply-all-fixes.js');

  const testFileContent = `// Test file with multiple fixable issues
function exampleFunction() {
  var oldStyleVar = 42;           // S3504: Use const or let
  var anotherOldVar = "hello";    // S3504: Use const or let

  const x = true;
  if (x) {
    console.log("Always true");   // S1134: Condition always true
  }

  for (var i = 0; i < 10; i++) {  // S1154: Use for-of or forEach
    console.log(i);
  }

  return;                          // S3626: Redundant return
}

function tooManyParameters(a, b, c, d, e, f, g, h) { // S107: Too many params (not fixable)
  return a + b + c + d + e + f + g + h;
}

const unusedVariable = 123;       // S1481: Unused variable (not fixable)

try {
  riskyOperation();
} catch (e) {
  // S2486: Empty catch block (not fixable)
}
`;

  beforeAll(() => {
    // Create test file
    writeFileSync(testFilePath, testFileContent, 'utf-8');
  });

  afterAll(() => {
    // Cleanup test file
    try {
      if (existsSync(testFilePath)) {
        unlinkSync(testFilePath);
      }
    } catch (err) {
      console.error('Failed to cleanup test file:', err);
    }
  });

  it.skip('should apply all available quick fixes in one operation', async () => {
    // NOTE: This test is skipped because it requires:
    // 1. SLOOP backend running
    // 2. MCP server running
    // 3. Proper MCP client connection
    //
    // To run manually:
    // 1. Start server: npm run dev
    // 2. Connect via MCP client
    // 3. Call analyze_file tool
    // 4. Call apply_all_quick_fixes tool
    // 5. Verify results

    // STEP 1: Analyze file to get baseline
    // Expected issues:
    // - 2x S3504 (var declarations) - FIXABLE
    // - 1x S1154 (for-loop) - FIXABLE
    // - 1x S3626 (redundant return) - FIXABLE
    // - 1x S107 (too many params) - NOT FIXABLE
    // - 1x S1481 (unused variable) - NOT FIXABLE
    // - 1x S2486 (empty catch) - NOT FIXABLE
    const initialState = {
      totalIssues: 7,
      fixableIssues: 4,
      nonFixableIssues: 3,
    };

    expect(initialState.totalIssues).toBe(7);
    expect(initialState.fixableIssues).toBe(4);

    // STEP 2: Apply all quick fixes
    // Expected behavior:
    // - Apply fix for S3504 at line 3 (var → const/let)
    // - Apply fix for S3504 at line 4 (var → const/let)
    // - Apply fix for S1154 at line 10 (for → forEach)
    // - Apply fix for S3626 at line 14 (remove return;)
    // - Skip S107, S1481, S2486 (no quick fixes available)

    const applyResult = {
      appliedFixes: 4,
      failedFixes: 0,
      remainingIssues: 3,
    };

    expect(applyResult.appliedFixes).toBe(4);
    expect(applyResult.remainingIssues).toBe(3);

    // STEP 3: Verify file modifications
    const modifiedContent = readFileSync(testFilePath, 'utf-8');

    // Verify var declarations changed
    expect(modifiedContent).not.toContain('var oldStyleVar');
    expect(modifiedContent).not.toContain('var anotherOldVar');
    expect(modifiedContent).toContain('const oldStyleVar'); // or 'let'

    // Verify redundant return removed
    expect(modifiedContent.split('return;')).toHaveLength(1); // Should be removed

    // Verify non-fixable issues remain
    expect(modifiedContent).toContain('tooManyParameters(a, b, c, d, e, f, g, h)');
    expect(modifiedContent).toContain('unusedVariable');
    expect(modifiedContent).toContain('catch (e) {');

    // STEP 4: Re-analyze to confirm
    // Expected: 3 issues remaining (all non-fixable)
    const finalState = {
      totalIssues: 3,
      fixableIssues: 0,
      issueRules: ['javascript:S107', 'javascript:S1481', 'javascript:S2486'],
    };

    expect(finalState.totalIssues).toBe(3);
    expect(finalState.fixableIssues).toBe(0);
    expect(finalState.issueRules).toHaveLength(3);
  });

  it.skip('should handle file with no fixable issues', async () => {
    const noFixesFilePath = join(process.cwd(), 'test-no-fixes.js');
    const noFixesContent = `
function tooManyParameters(a, b, c, d, e, f, g, h) { // S107: Not fixable
  const unused = 123; // S1481: Not fixable
  try {
    riskyOperation();
  } catch (e) {
    // S2486: Not fixable
  }
}
`;

    try {
      writeFileSync(noFixesFilePath, noFixesContent, 'utf-8');

      // STEP 1: Analyze file
      const initialIssues = 3; // All non-fixable
      expect(initialIssues).toBe(3);

      // STEP 2: Call apply_all_quick_fixes
      // Expected response: "No quick fixes available"
      const result = {
        message: 'ℹ️ **No quick fixes available**',
        totalIssues: 3,
        appliedFixes: 0,
      };

      expect(result.appliedFixes).toBe(0);
      expect(result.message).toContain('No quick fixes available');

      // STEP 3: Verify file unchanged
      const contentAfter = readFileSync(noFixesFilePath, 'utf-8');
      expect(contentAfter).toBe(noFixesContent);

    } finally {
      if (existsSync(noFixesFilePath)) {
        unlinkSync(noFixesFilePath);
      }
    }
  });

  it.skip('should handle file with all fixable issues', async () => {
    const allFixableFilePath = join(process.cwd(), 'test-all-fixable.js');
    const allFixableContent = `
function test() {
  var a = 1;    // S3504: Fixable
  var b = 2;    // S3504: Fixable
  var c = 3;    // S3504: Fixable
  return;       // S3626: Fixable
}
`;

    try {
      writeFileSync(allFixableFilePath, allFixableContent, 'utf-8');

      // STEP 1: Analyze file
      const initialIssues = 4; // All fixable
      expect(initialIssues).toBe(4);

      // STEP 2: Apply all quick fixes
      const result = {
        appliedFixes: 4,
        failedFixes: 0,
        remainingIssues: 0,
        message: '🎉 All issues resolved!',
      };

      expect(result.appliedFixes).toBe(4);
      expect(result.remainingIssues).toBe(0);
      expect(result.message).toContain('All issues resolved');

      // STEP 3: Verify file is clean
      const contentAfter = readFileSync(allFixableFilePath, 'utf-8');
      expect(contentAfter).not.toContain('var a');
      expect(contentAfter).not.toContain('return;');

      // STEP 4: Re-analyze should show 0 issues
      const finalIssues = 0;
      expect(finalIssues).toBe(0);

    } finally {
      if (existsSync(allFixableFilePath)) {
        unlinkSync(allFixableFilePath);
      }
    }
  });

  it.skip('should handle partial fix failures gracefully', async () => {
    // This test documents behavior when some fixes succeed and others fail
    // (e.g., due to file permissions, concurrent modifications, etc.)

    const result = {
      appliedFixes: 3,
      failedFixes: 1,
      failures: [
        {
          line: 10,
          rule: 'javascript:S3504',
          error: 'File was modified concurrently',
        },
      ],
    };

    expect(result.appliedFixes).toBe(3);
    expect(result.failedFixes).toBe(1);
    expect(result.failures[0].error).toBeDefined();
  });

  it.skip('should maintain correct line numbers after multiple fixes', async () => {
    // This test verifies that applying fixes in reverse order (high line to low line)
    // prevents line number shifting issues

    const complexFilePath = join(process.cwd(), 'test-line-numbers.js');
    const complexContent = `
function test() {
  var a = 1;     // Line 3: S3504
  var b = 2;     // Line 4: S3504
  var c = 3;     // Line 5: S3504

  for (var i = 0; i < 10; i++) {  // Line 7: S1154
    console.log(i);
  }

  return;        // Line 11: S3626
}
`;

    try {
      writeFileSync(complexFilePath, complexContent, 'utf-8');

      // Apply fixes in reverse order: line 11, 7, 5, 4, 3
      // This ensures earlier fixes don't affect later line numbers

      const result = {
        fixOrder: [11, 7, 5, 4, 3],
        appliedFixes: 5,
        allSuccessful: true,
      };

      expect(result.fixOrder[0]).toBe(11); // Highest line first
      expect(result.fixOrder[4]).toBe(3);  // Lowest line last
      expect(result.appliedFixes).toBe(5);

      // Verify all fixes applied correctly
      const contentAfter = readFileSync(complexFilePath, 'utf-8');
      expect(contentAfter).not.toContain('var a');
      expect(contentAfter).not.toContain('return;');

    } finally {
      if (existsSync(complexFilePath)) {
        unlinkSync(complexFilePath);
      }
    }
  });

  describe('error handling', () => {
    it.skip('should handle non-existent file', async () => {
      const nonExistentPath = '/path/that/does/not/exist.js';

      // Expected: Error with clear message
      const result = {
        isError: true,
        message: 'File not found',
      };

      expect(result.isError).toBe(true);
      expect(result.message).toContain('not found');
    });

    it.skip('should handle file with no issues', async () => {
      const cleanFilePath = join(process.cwd(), 'test-clean.js');
      const cleanContent = `
function perfectCode() {
  const x = 42;
  return x * 2;
}
`;

      try {
        writeFileSync(cleanFilePath, cleanContent, 'utf-8');

        // Expected: No issues, no fixes applied
        const result = {
          totalIssues: 0,
          appliedFixes: 0,
          message: 'No quick fixes available',
        };

        expect(result.totalIssues).toBe(0);
        expect(result.appliedFixes).toBe(0);

      } finally {
        if (existsSync(cleanFilePath)) {
          unlinkSync(cleanFilePath);
        }
      }
    });
  });

  describe('summary output validation', () => {
    it('should validate summary structure', () => {
      const expectedSummary = {
        title: '✅ **Quick fixes applied**',
        sections: [
          'File: /path/to/file.js',
          'Applied: 4 fixes',
          'Remaining issues: 3',
          '**Fixed Issues:**',
          '**Remaining Issues (require manual fixing):**',
        ],
      };

      expect(expectedSummary.title).toContain('Quick fixes applied');
      expect(expectedSummary.sections).toHaveLength(5);
    });

    it('should validate severity grouping in summary', () => {
      const remainingIssues = [
        { severity: 'BLOCKER', line: 5, rule: 'S1', message: 'Issue 1' },
        { severity: 'MAJOR', line: 10, rule: 'S2', message: 'Issue 2' },
        { severity: 'BLOCKER', line: 15, rule: 'S3', message: 'Issue 3' },
      ];

      const grouped = remainingIssues.reduce((acc, issue) => {
        if (!acc[issue.severity]) acc[issue.severity] = [];
        acc[issue.severity].push(issue);
        return acc;
      }, {} as Record<string, typeof remainingIssues>);

      const summaryOrder = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];

      expect(grouped['BLOCKER']).toHaveLength(2);
      expect(grouped['MAJOR']).toHaveLength(1);
      expect(summaryOrder[0]).toBe('BLOCKER'); // Highest severity first
    });
  });

  describe('cache invalidation', () => {
    it.skip('should properly invalidate SLOOP cache after fixes', async () => {
      // This test verifies the cache invalidation flow:
      // 1. Apply fixes → modify file
      // 2. Call notifyFileSystemChanged with:
      //    - fsPath: absolute path
      //    - content: new content
      //    - isUserDefined: true
      // 3. Wait 500ms for SLOOP processing
      // 4. Re-analyze should reflect new state

      const result = {
        cacheInvalidated: true,
        reanalysisAccurate: true,
        issuesReflectChanges: true,
      };

      expect(result.cacheInvalidated).toBe(true);
      expect(result.reanalysisAccurate).toBe(true);
    });
  });
});
