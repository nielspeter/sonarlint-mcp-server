import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { createTestClient, MCPTestClient } from '../helpers/e2e-setup.js';

/**
 * E2E tests for apply_all_quick_fixes tool
 *
 * These tests start a real MCP server and test the complete workflow:
 * 1. Start MCP server
 * 2. Connect MCP client
 * 3. Call tools via MCP protocol
 * 4. Verify results
 * 5. Clean up
 */

describe('apply_all_quick_fixes E2E', () => {
  let client: MCPTestClient;
  const testFilePath = join(process.cwd(), 'test-e2e-apply-all-fixes.js');

  const testFileContent = `// Test file with multiple fixable issues
function exampleFunction() {
  var oldStyleVar = 42;           // S3504: Use const or let
  var anotherOldVar = "hello";    // S3504: Use const or let

  const x = true;
  if (x) {
    console.log("Always true");
  }

  return;                          // S3626: Redundant return
}

function tooManyParameters(a, b, c, d, e, f, g, h) { // S107: Too many params (not fixable)
  return a + b + c + d + e + f + g + h;
}
`;

  beforeAll(async () => {
    // Create test file
    writeFileSync(testFilePath, testFileContent, 'utf-8');

    // Start MCP server and connect client
    client = await createTestClient();
  }, 30000); // 30 second timeout for server startup

  afterAll(async () => {
    // Stop MCP server
    if (client) {
      await client.stop();
    }

    // Cleanup test file
    try {
      if (existsSync(testFilePath)) {
        unlinkSync(testFilePath);
      }
    } catch (err) {
      console.error('Failed to cleanup test file:', err);
    }
  });

  it('should connect to MCP server and verify it is healthy', async () => {
    const result = await client.healthCheck();

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    // Health check returns diagnostic info, just verify it has content
    expect(result.content[0].text.length).toBeGreaterThan(50);
  }, 10000);

  it('should analyze file and find issues', async () => {
    const result = await client.analyzeFile(testFilePath);

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();

    const analysisText = result.content[0].text;
    // Check for issue markers - could be "issues found" or markdown format
    expect(analysisText.length).toBeGreaterThan(100); // Should have substantial content
    expect(analysisText).toContain('S3504'); // var declaration issue
    expect(analysisText).toContain('S3626'); // redundant return issue
  }, 10000);

  it('should apply all quick fixes in one operation', async () => {
    const result = await client.applyAllQuickFixes(testFilePath);

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();

    const summaryText = result.content[0].text;
    expect(summaryText).toContain('Quick fixes applied');
    expect(summaryText).toContain('Applied:');
    expect(summaryText).toContain('Remaining issues:');
  }, 15000);

  it('should have modified the file correctly', async () => {
    const modifiedContent = readFileSync(testFilePath, 'utf-8');

    // Var declarations should be changed (to const or let)
    // Note: They might be changed to 'const' or 'let' depending on SonarLint's fix
    const hasOldVar = modifiedContent.includes('var oldStyleVar');
    const hasAnotherVar = modifiedContent.includes('var anotherOldVar');

    // At least one should be fixed (we can't guarantee both in one run)
    expect(hasOldVar && hasAnotherVar).toBe(false);

    // Non-fixable code should remain
    expect(modifiedContent).toContain('tooManyParameters');
  }, 5000);

  it('should show fewer issues after applying fixes', async () => {
    const result = await client.analyzeFile(testFilePath);

    const analysisText = result.content[0].text;

    // Should not have S3504 (var declarations) anymore
    expect(analysisText).not.toContain('S3504');

    // Should not have S3626 (redundant return) anymore
    expect(analysisText).not.toContain('S3626');

    // Might still have S107 (too many params) - not fixable
    // This depends on SonarLint's active rules
  }, 10000);

  it('should handle file with no fixable issues', async () => {
    const cleanFilePath = join(process.cwd(), 'test-e2e-no-fixes.js');
    const cleanContent = `
function tooManyParams(a, b, c, d, e, f, g, h) {
  return a + b + c + d + e + f + g + h;
}
`;

    try {
      writeFileSync(cleanFilePath, cleanContent, 'utf-8');

      const result = await client.applyAllQuickFixes(cleanFilePath);

      const summaryText = result.content[0].text;
      expect(summaryText).toContain('No quick fixes available');
    } finally {
      if (existsSync(cleanFilePath)) {
        unlinkSync(cleanFilePath);
      }
    }
  }, 10000);

  it('should handle non-existent file', async () => {
    const nonExistentPath = '/path/that/does/not/exist.js';

    const result = await client.applyAllQuickFixes(nonExistentPath);

    // MCP returns errors in the result, not as exceptions
    expect(result).toBeDefined();
    expect(result.isError).toBe(true);
    const errorText = result.content[0].text;
    expect(errorText).toContain('does not exist');
  }, 5000);

  it('should list available tools', async () => {
    const result = await client.listTools();

    expect(result.tools).toBeDefined();
    expect(result.tools.length).toBeGreaterThan(0);

    const toolNames = result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('check_quality');
    expect(toolNames).toContain('fix_issue');
    expect(toolNames).toContain('fix_all_issues');
  }, 5000);
});
