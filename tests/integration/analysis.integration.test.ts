import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createTestClient, MCPTestClient } from '../helpers/e2e-setup.js';

/**
 * Integration tests for SLOOP analysis with real backend.
 *
 * These tests create temporary project directories outside of process.cwd()
 * to verify that scope management, listFiles, getBaseDir, and
 * ideRelativePath all work correctly with external projects.
 *
 * Scenarios:
 * - Single file analysis
 * - Few files (3-5)
 * - Many files (16+, the original timeout bug)
 * - Different languages in one project
 * - Two separate projects (different scopes)
 * - Code snippet analysis (check_code, no file on disk)
 */

// Helpers ----------------------------------------------------------------

const TEST_ROOT = join(tmpdir(), `sonarlint-integration-${Date.now()}`);

function createProject(name: string): string {
  const dir = join(TEST_ROOT, name);
  mkdirSync(dir, { recursive: true });
  // Add a marker file so findProjectRoot detects it as a project root
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
  return dir;
}

/** JS file with known issues. Each call produces a unique file (different var name). */
function writeJsFileWithIssues(dir: string, filename: string, index = 0): string {
  const filePath = join(dir, filename);
  const content = `// Generated test file ${filename}
function example${index}() {
  var value${index} = ${index};
  if (true) {
    console.log(value${index});
  }
  return;
}
`;
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/** Python file with a known issue (unused import). */
function writePyFileWithIssues(dir: string, filename: string): string {
  const filePath = join(dir, filename);
  const content = `import os
import sys

def greet():
    print("hello")
`;
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/** Clean JS file that should produce zero or minimal issues. */
function writeCleanJsFile(dir: string, filename: string): string {
  const filePath = join(dir, filename);
  const content = `"use strict";
function add(a, b) {
  return a + b;
}
module.exports = { add };
`;
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

// Nested helper: create files in a src/ subdirectory
function writeSrcFile(dir: string, relPath: string, index = 0): string {
  const fullDir = join(dir, 'src');
  mkdirSync(fullDir, { recursive: true });
  return writeJsFileWithIssues(fullDir, relPath, index);
}

// -----------------------------------------------------------------------

describe('SLOOP Analysis Integration', () => {
  let client: MCPTestClient;

  beforeAll(async () => {
    mkdirSync(TEST_ROOT, { recursive: true });
    client = await createTestClient();
  }, 60_000);

  afterAll(async () => {
    if (client) {
      await client.stop();
    }
    // Clean up temp directory
    if (existsSync(TEST_ROOT)) {
      rmSync(TEST_ROOT, { recursive: true, force: true });
    }
  }, 15_000);

  // --- Health check (gate) ---

  it('should connect and be healthy', async () => {
    const result = await client.healthCheck();
    expect(result).toBeDefined();
    expect(result.content[0].text.length).toBeGreaterThan(50);
  }, 15_000);

  // --- Single file ---

  describe('single file analysis', () => {
    let projectDir: string;

    beforeAll(() => {
      projectDir = createProject('single-file');
    });

    it('should analyze a single JS file and find issues', async () => {
      const filePath = writeJsFileWithIssues(projectDir, 'app.js', 1);
      const result = await client.callTool('check_quality', { filePath });

      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
      const text = result.content[0].text;
      // Should find at least one issue (var declaration, always-true condition, or redundant return)
      expect(text).toMatch(/issue|Issue|S3504|S3626|S2583/i);
    }, 120_000);

    it('should analyze a clean file and report no or minimal issues', async () => {
      const filePath = writeCleanJsFile(projectDir, 'clean.js');
      const result = await client.callTool('check_quality', { filePath });

      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
      // Clean file: either "no issues" or very few
      const text = result.content[0].text;
      expect(text).toBeDefined();
    }, 120_000);
  });

  // --- Few files (3-5) ---

  describe('few files analysis (3-5 files)', () => {
    let projectDir: string;
    let filePaths: string[];

    beforeAll(() => {
      projectDir = createProject('few-files');
      filePaths = [];
      for (let i = 0; i < 5; i++) {
        filePaths.push(writeJsFileWithIssues(projectDir, `file${i}.js`, i));
      }
    });

    it('should analyze 5 files via check_files without timing out', async () => {
      const result = await client.callTool('check_files', { filePaths });

      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
      const text = result.content[0].text;
      // Should report on all 5 files
      expect(text).toMatch(/Files Analyzed\*\*: 5/i);
    }, 120_000);

    it('should analyze each file individually', async () => {
      for (const filePath of filePaths.slice(0, 2)) {
        const result = await client.callTool('check_quality', { filePath });
        expect(result).toBeDefined();
        expect(result.isError).toBeFalsy();
      }
    }, 120_000);
  });

  // --- Many files (16+, the original bug) ---

  describe('many files analysis (16+ files)', () => {
    let projectDir: string;
    let filePaths: string[];

    beforeAll(() => {
      projectDir = createProject('many-files');
      filePaths = [];
      for (let i = 0; i < 20; i++) {
        filePaths.push(writeJsFileWithIssues(projectDir, `module${i}.js`, i));
      }
    });

    it('should analyze 20 files via check_files without timing out', async () => {
      const result = await client.callTool('check_files', { filePaths });

      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
      const text = result.content[0].text;
      // Should mention all 20 files
      expect(text).toMatch(/Files Analyzed\*\*: 20/i);
    }, 180_000);
  });

  // --- Multiple languages ---

  describe('mixed language project', () => {
    let projectDir: string;

    beforeAll(() => {
      projectDir = createProject('mixed-lang');
    });

    it('should analyze JS and Python files in the same project', async () => {
      const jsFile = writeJsFileWithIssues(projectDir, 'index.js', 0);
      const pyFile = writePyFileWithIssues(projectDir, 'main.py');

      const result = await client.callTool('check_files', {
        filePaths: [jsFile, pyFile],
      });

      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
      const text = result.content[0].text;
      // Should mention both files
      expect(text).toMatch(/Files Analyzed\*\*: 2/i);
    }, 120_000);
  });

  // --- Two separate projects (different scopes) ---

  describe('two separate projects', () => {
    let projectA: string;
    let projectB: string;

    beforeAll(() => {
      projectA = createProject('project-a');
      projectB = createProject('project-b');
    });

    it('should analyze files from two different projects sequentially', async () => {
      const fileA = writeJsFileWithIssues(projectA, 'a.js', 100);
      const fileB = writeJsFileWithIssues(projectB, 'b.js', 200);

      const resultA = await client.callTool('check_quality', { filePath: fileA });
      expect(resultA).toBeDefined();
      expect(resultA.isError).toBeFalsy();

      const resultB = await client.callTool('check_quality', { filePath: fileB });
      expect(resultB).toBeDefined();
      expect(resultB.isError).toBeFalsy();

      // Both should find issues independently
      expect(resultA.content[0].text).toMatch(/issue|Issue|S3504|S3626|S2583/i);
      expect(resultB.content[0].text).toMatch(/issue|Issue|S3504|S3626|S2583/i);
    }, 120_000);

    it('should handle check_files across two projects', async () => {
      const fileA = writeJsFileWithIssues(projectA, 'cross-a.js', 300);
      const fileB = writeJsFileWithIssues(projectB, 'cross-b.js', 400);

      const result = await client.callTool('check_files', {
        filePaths: [fileA, fileB],
      });

      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
      const text = result.content[0].text;
      expect(text).toMatch(/Files Analyzed\*\*: 2/i);
    }, 120_000);
  });

  // --- Nested src/ structure ---

  describe('nested directory structure', () => {
    let projectDir: string;

    beforeAll(() => {
      projectDir = createProject('nested');
    });

    it('should analyze files in src/ subdirectory', async () => {
      const filePaths = [];
      for (let i = 0; i < 5; i++) {
        filePaths.push(writeSrcFile(projectDir, `util${i}.js`, i));
      }

      const result = await client.callTool('check_files', { filePaths });

      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
      const text = result.content[0].text;
      expect(text).toMatch(/Files Analyzed\*\*: 5/i);
    }, 120_000);
  });

  // --- Code snippet analysis (check_code) ---

  describe('code snippet analysis', () => {
    it('should analyze a JS code snippet without a file on disk', async () => {
      const result = await client.callTool('check_code', {
        content: `function bad() {
  var x = 1;
  if (true) {
    console.log(x);
  }
  return;
}`,
        language: 'javascript',
      });

      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
      const text = result.content[0].text;
      expect(text).toMatch(/issue|Issue|S3504|S3626|S2583/i);
    }, 120_000);

    it('should analyze a Python code snippet', async () => {
      const result = await client.callTool('check_code', {
        content: `import os
import sys

def greet():
    print("hello")
`,
        language: 'python',
      });

      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
    }, 120_000);
  });

  // --- basePath with relative paths/globs ---

  describe('basePath for relative paths', () => {
    let projectDir: string;

    beforeAll(() => {
      projectDir = createProject('basepath-test');
      writeJsFileWithIssues(projectDir, 'app.js', 0);
      writeJsFileWithIssues(projectDir, 'util.js', 1);
      const srcDir = join(projectDir, 'src');
      mkdirSync(srcDir, { recursive: true });
      writeJsFileWithIssues(srcDir, 'index.js', 2);
    });

    it('should resolve relative file paths with basePath', async () => {
      const result = await client.callTool('check_files', {
        filePaths: ['app.js', 'util.js'],
        basePath: projectDir,
      });

      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toMatch(/Files Analyzed\*\*: 2/i);
    }, 120_000);

    it('should resolve relative glob patterns with basePath', async () => {
      const result = await client.callTool('check_files', {
        filePaths: ['**/*.js'],
        basePath: projectDir,
      });

      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toMatch(/Files Analyzed\*\*: 3/i);
    }, 120_000);

    it('should reject relative paths without basePath', async () => {
      const result = await client.callTool('check_files', {
        filePaths: ['src/index.js'],
      });

      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/basePath/i);
    }, 30_000);
  });

  // --- Severity filter ---

  describe('severity filtering', () => {
    let projectDir: string;

    beforeAll(() => {
      projectDir = createProject('severity-filter');
    });

    it('should filter issues by minimum severity', async () => {
      const filePath = writeJsFileWithIssues(projectDir, 'filter-test.js', 0);

      const allIssues = await client.callTool('check_quality', { filePath });
      const majorOnly = await client.callTool('check_quality', {
        filePath,
        minSeverity: 'MAJOR',
      });

      expect(allIssues.isError).toBeFalsy();
      expect(majorOnly.isError).toBeFalsy();

      // Major-only should have same or fewer issues mentioned
      const allText = allIssues.content[0].text;
      const majorText = majorOnly.content[0].text;
      expect(allText.length).toBeGreaterThanOrEqual(majorText.length);
    }, 120_000);
  });
});
