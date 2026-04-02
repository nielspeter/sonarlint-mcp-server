import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findConfigFile, transformRuleConfig, loadRuleConfig } from '../../src/utils/config.js';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

import { existsSync, readFileSync } from 'fs';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('findConfigFile', () => {
  it('should return sonarlint.json when it exists', () => {
    mockExistsSync.mockImplementation((p) => String(p).endsWith('sonarlint.json') && !String(p).includes('.sonarlint'));

    const result = findConfigFile('/project');
    expect(result).toBe('/project/sonarlint.json');
  });

  it('should fall back to .sonarlint/settings.json', () => {
    mockExistsSync.mockImplementation((p) => String(p).includes('.sonarlint/settings.json'));

    const result = findConfigFile('/project');
    expect(result).toBe('/project/.sonarlint/settings.json');
  });

  it('should return null when neither exists', () => {
    mockExistsSync.mockReturnValue(false);

    const result = findConfigFile('/project');
    expect(result).toBeNull();
  });

  it('should prefer sonarlint.json over .sonarlint/settings.json', () => {
    mockExistsSync.mockReturnValue(true);

    const result = findConfigFile('/project');
    expect(result).toBe('/project/sonarlint.json');
  });
});

describe('transformRuleConfig', () => {
  it('should transform level "on" to isActive true', () => {
    const result = transformRuleConfig({
      rules: { 'javascript:S3776': { level: 'on' } },
    });

    expect(result['javascript:S3776']).toEqual({
      isActive: true,
      paramValueByKey: {},
    });
  });

  it('should transform level "off" to isActive false', () => {
    const result = transformRuleConfig({
      rules: { 'javascript:S1481': { level: 'off' } },
    });

    expect(result['javascript:S1481']).toEqual({
      isActive: false,
      paramValueByKey: {},
    });
  });

  it('should default to isActive true when level is omitted', () => {
    const result = transformRuleConfig({
      rules: { 'javascript:S3776': { parameters: { threshold: '20' } } },
    });

    expect(result['javascript:S3776'].isActive).toBe(true);
  });

  it('should map parameters to paramValueByKey', () => {
    const result = transformRuleConfig({
      rules: {
        'javascript:S3776': {
          level: 'on',
          parameters: { threshold: '20' },
        },
      },
    });

    expect(result['javascript:S3776'].paramValueByKey).toEqual({ threshold: '20' });
  });

  it('should default paramValueByKey to empty object', () => {
    const result = transformRuleConfig({
      rules: { 'javascript:S1481': { level: 'off' } },
    });

    expect(result['javascript:S1481'].paramValueByKey).toEqual({});
  });

  it('should return empty object for empty rules', () => {
    expect(transformRuleConfig({ rules: {} })).toEqual({});
  });

  it('should return empty object for missing rules key', () => {
    expect(transformRuleConfig({} as any)).toEqual({});
  });

  it('should handle multiple rules', () => {
    const result = transformRuleConfig({
      rules: {
        'javascript:S3776': { level: 'on', parameters: { threshold: '20' } },
        'javascript:S1481': { level: 'off' },
        'typescript:S3776': { parameters: { threshold: '25' } },
      },
    });

    expect(Object.keys(result)).toHaveLength(3);
    expect(result['javascript:S3776'].isActive).toBe(true);
    expect(result['javascript:S1481'].isActive).toBe(false);
    expect(result['typescript:S3776'].paramValueByKey.threshold).toBe('25');
  });
});

describe('loadRuleConfig', () => {
  it('should return empty object when no config file exists', () => {
    mockExistsSync.mockReturnValue(false);

    const result = loadRuleConfig('/project');
    expect(result).toEqual({});
  });

  it('should load and transform valid config', () => {
    mockExistsSync.mockImplementation((p) => String(p).endsWith('sonarlint.json') && !String(p).includes('.sonarlint'));
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        rules: {
          'javascript:S3776': { level: 'on', parameters: { threshold: '20' } },
        },
      }),
    );

    const result = loadRuleConfig('/project');
    expect(result['javascript:S3776']).toEqual({
      isActive: true,
      paramValueByKey: { threshold: '20' },
    });
  });

  it('should return empty object for malformed JSON', () => {
    mockExistsSync.mockImplementation((p) => String(p).endsWith('sonarlint.json') && !String(p).includes('.sonarlint'));
    mockReadFileSync.mockReturnValue('not valid json {{{');

    const result = loadRuleConfig('/project');
    expect(result).toEqual({});
  });

  it('should return empty object when rules is not an object', () => {
    mockExistsSync.mockImplementation((p) => String(p).endsWith('sonarlint.json') && !String(p).includes('.sonarlint'));
    mockReadFileSync.mockReturnValue(JSON.stringify({ rules: 'not an object' }));

    const result = loadRuleConfig('/project');
    expect(result).toEqual({});
  });
});
