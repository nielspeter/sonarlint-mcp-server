import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'path';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

import { existsSync } from 'fs';
import { findProjectRoot } from '../../src/utils/scope.js';

const mockExistsSync = vi.mocked(existsSync);

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('findProjectRoot', () => {
  it('should return directory containing .git', () => {
    mockExistsSync.mockImplementation((p) => String(p) === join('/repo', '.git'));

    expect(findProjectRoot('/repo/src/utils')).toBe('/repo');
  });

  it('should return directory containing package.json when no VCS marker', () => {
    mockExistsSync.mockImplementation((p) => String(p) === join('/project', 'package.json'));

    expect(findProjectRoot('/project/src')).toBe('/project');
  });

  it('should prefer .git over package.json (monorepo support)', () => {
    // Monorepo: workspace has package.json, repo root has .git
    mockExistsSync.mockImplementation((p) => {
      const s = String(p);
      return s === join('/repo/packages/app', 'package.json') || s === join('/repo', '.git');
    });

    expect(findProjectRoot('/repo/packages/app/src')).toBe('/repo');
  });

  it('should return first package.json dir if no VCS marker found anywhere', () => {
    mockExistsSync.mockImplementation((p) => String(p) === join('/workspace/app', 'package.json'));

    expect(findProjectRoot('/workspace/app/src/utils')).toBe('/workspace/app');
  });

  it('should return startPath if no markers found', () => {
    mockExistsSync.mockReturnValue(false);

    expect(findProjectRoot('/some/random/dir')).toBe('/some/random/dir');
  });

  it('should detect pom.xml as VCS/build marker', () => {
    mockExistsSync.mockImplementation((p) => String(p) === join('/java-project', 'pom.xml'));

    expect(findProjectRoot('/java-project/src/main')).toBe('/java-project');
  });

  it('should detect pyproject.toml as VCS/build marker', () => {
    mockExistsSync.mockImplementation((p) => String(p) === join('/py-project', 'pyproject.toml'));

    expect(findProjectRoot('/py-project/src')).toBe('/py-project');
  });

  it('should detect go.mod as VCS/build marker', () => {
    mockExistsSync.mockImplementation((p) => String(p) === join('/go-project', 'go.mod'));

    expect(findProjectRoot('/go-project/cmd')).toBe('/go-project');
  });

  it('should detect build.gradle as VCS/build marker', () => {
    mockExistsSync.mockImplementation((p) => String(p) === join('/android-project', 'build.gradle'));

    expect(findProjectRoot('/android-project/app/src')).toBe('/android-project');
  });

  it('should skip nested package.json and find .git at repo root in deep monorepo', () => {
    // /repo/.git exists, /repo/packages/lib/package.json exists, /repo/packages/lib/src/package.json does NOT
    mockExistsSync.mockImplementation((p) => {
      const s = String(p);
      return s === join('/repo/packages/lib', 'package.json') || s === join('/repo', '.git');
    });

    expect(findProjectRoot('/repo/packages/lib/src/utils')).toBe('/repo');
  });
});
