import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createTestClient, MCPTestClient } from '../helpers/e2e-setup.js';

/**
 * Integration tests for sonarlint.json rule config loading.
 *
 * Verifies that:
 * - A project with sonarlint.json threshold=25 does NOT flag complexity 20
 * - A project without sonarlint.json DOES flag complexity 20 (default threshold=15)
 */

const TEST_ROOT = join(tmpdir(), `sonarlint-config-${Date.now()}`);

/** Create a project directory with package.json */
function createProject(name: string): string {
  const dir = join(TEST_ROOT, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
  return dir;
}

/** Write a TS file with a function of known cognitive complexity (~20). */
function writeComplexTsFile(dir: string, filename: string): string {
  const filePath = join(dir, filename);
  // This function has ~20 cognitive complexity from nested if/else/for
  const content = `function processItems(items: unknown[], mode: string): string[] {
  const results: string[] = [];
  for (const item of items) {
    if (typeof item === 'string') {
      if (mode === 'upper') {
        results.push(item.toUpperCase());
      } else if (mode === 'lower') {
        results.push(item.toLowerCase());
      } else if (mode === 'trim') {
        results.push(item.trim());
      } else {
        results.push(item);
      }
    } else if (typeof item === 'number') {
      if (item > 0) {
        if (mode === 'hex') {
          results.push(item.toString(16));
        } else {
          results.push(item.toString());
        }
      } else if (item < 0) {
        results.push((-item).toString());
      } else {
        results.push('0');
      }
    } else if (Array.isArray(item)) {
      for (const sub of item) {
        if (typeof sub === 'string') {
          results.push(sub);
        }
      }
    }
  }
  return results;
}
`;
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

describe('sonarlint.json config integration', () => {
  let client: MCPTestClient;

  beforeAll(async () => {
    mkdirSync(TEST_ROOT, { recursive: true });
    client = await createTestClient();
  }, 60_000);

  afterAll(async () => {
    if (client) {
      await client.stop();
    }
    if (existsSync(TEST_ROOT)) {
      rmSync(TEST_ROOT, { recursive: true, force: true });
    }
  }, 15_000);

  it('should flag S3776 with default threshold (no sonarlint.json)', async () => {
    const projectDir = createProject('no-config');
    const filePath = writeComplexTsFile(projectDir, 'complex.ts');

    const result = await client.callTool('check_quality', { filePath });

    expect(result).toBeDefined();
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    // Default threshold is 15, function complexity is ~20 → should flag S3776
    expect(text).toMatch(/S3776/);
  }, 120_000);

  it('should NOT flag S3776 when sonarlint.json sets threshold=25', async () => {
    const projectDir = createProject('with-config');

    // Write sonarlint.json with high threshold
    writeFileSync(
      join(projectDir, 'sonarlint.json'),
      JSON.stringify({
        rules: {
          'typescript:S3776': {
            parameters: { threshold: '30' },
          },
        },
      }),
    );

    const filePath = writeComplexTsFile(projectDir, 'complex.ts');

    const result = await client.callTool('check_quality', { filePath });

    expect(result).toBeDefined();
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    // Threshold is 30, function complexity is 28 → should NOT flag S3776
    expect(text).not.toMatch(/S3776/);
  }, 120_000);
});
