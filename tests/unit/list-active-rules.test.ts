import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock sloop module
const mockListAllStandaloneRulesDefinitions = vi.fn();
vi.mock('../../src/utils/sloop.js', () => ({
  ensureSloopBridge: vi.fn(() => ({
    listAllStandaloneRulesDefinitions: mockListAllStandaloneRulesDefinitions,
  })),
}));

import { handleListActiveRules } from '../../src/tools/list-active-rules.js';

const SAMPLE_RULES = {
  'javascript:S3776': {
    key: 'javascript:S3776',
    name: 'Cognitive Complexity',
    language: 'JS',
    isActiveByDefault: true,
    cleanCodeAttribute: 'CONVENTIONAL',
    softwareImpacts: [{ softwareQuality: 'MAINTAINABILITY', impactSeverity: 'HIGH' }],
    paramsByKey: {
      threshold: { key: 'threshold', defaultValue: '15', type: 'INTEGER', name: 'threshold' },
    },
  },
  'typescript:S3776': {
    key: 'typescript:S3776',
    name: 'Cognitive Complexity',
    language: 'TS',
    isActiveByDefault: true,
    cleanCodeAttribute: 'CONVENTIONAL',
    softwareImpacts: [{ softwareQuality: 'MAINTAINABILITY', impactSeverity: 'HIGH' }],
    paramsByKey: {
      threshold: { key: 'threshold', defaultValue: '15', type: 'INTEGER', name: 'threshold' },
    },
  },
  'javascript:S1481': {
    key: 'javascript:S1481',
    name: 'Unused local variables',
    language: 'JS',
    isActiveByDefault: true,
    cleanCodeAttribute: 'CLEAR',
    softwareImpacts: [{ softwareQuality: 'MAINTAINABILITY', impactSeverity: 'LOW' }],
    paramsByKey: {},
  },
  'python:S3776': {
    key: 'python:S3776',
    name: 'Cognitive Complexity',
    language: 'PYTHON',
    isActiveByDefault: true,
    cleanCodeAttribute: 'CONVENTIONAL',
    softwareImpacts: [],
    paramsByKey: {
      threshold: { key: 'threshold', defaultValue: '15', type: 'INTEGER', name: 'threshold' },
    },
  },
  'javascript:S1234': {
    key: 'javascript:S1234',
    name: 'Inactive rule',
    language: 'JS',
    isActiveByDefault: false,
    cleanCodeAttribute: 'CLEAR',
    softwareImpacts: [],
    paramsByKey: {},
  },
};

beforeEach(() => {
  vi.restoreAllMocks();
  mockListAllStandaloneRulesDefinitions.mockResolvedValue({ rulesByKey: SAMPLE_RULES });
});

describe('list_rules tool', () => {
  describe('language filtering', () => {
    it('should filter by "javascript" and match SLOOP language "JS"', async () => {
      const result = await handleListActiveRules({ language: 'javascript' });
      const text = result.content[0].text;

      expect(text).toContain('javascript:S3776');
      expect(text).toContain('javascript:S1481');
      expect(text).not.toContain('typescript:S3776');
      expect(text).not.toContain('python:S3776');
    });

    it('should filter by "typescript" and match SLOOP language "TS"', async () => {
      const result = await handleListActiveRules({ language: 'typescript' });
      const text = result.content[0].text;

      expect(text).toContain('typescript:S3776');
      expect(text).not.toContain('javascript:S3776');
      expect(text).not.toContain('python:S3776');
    });

    it('should filter by "python" and match SLOOP language "PYTHON"', async () => {
      const result = await handleListActiveRules({ language: 'python' });
      const text = result.content[0].text;

      expect(text).toContain('python:S3776');
      expect(text).not.toContain('javascript:S3776');
      expect(text).not.toContain('typescript:S3776');
    });

    it('should return all languages when no filter is provided', async () => {
      const result = await handleListActiveRules({});
      const text = result.content[0].text;

      expect(text).toContain('javascript:S3776');
      expect(text).toContain('typescript:S3776');
      expect(text).toContain('python:S3776');
      expect(text).toContain('javascript:S1481');
    });

    it('should be case-insensitive for language filter', async () => {
      const result = await handleListActiveRules({ language: 'TypeScript' });
      const text = result.content[0].text;

      expect(text).toContain('typescript:S3776');
      expect(text).not.toContain('javascript:S3776');
    });
  });

  describe('isActiveByDefault filtering', () => {
    it('should exclude inactive rules', async () => {
      const result = await handleListActiveRules({});
      const text = result.content[0].text;

      expect(text).not.toContain('javascript:S1234');
      expect(text).not.toContain('Inactive rule');
    });
  });

  describe('parameter display', () => {
    it('should show configurable parameters for rules that have them', async () => {
      const result = await handleListActiveRules({ language: 'javascript' });
      const text = result.content[0].text;

      expect(text).toContain('threshold=15 (INTEGER)');
    });

    it('should count configurable rules correctly', async () => {
      const result = await handleListActiveRules({ language: 'javascript' });
      const text = result.content[0].text;

      // S3776 has params, S1481 does not → 1 configurable
      expect(text).toContain('1 configurable');
    });

    it('should show empty parameters for non-configurable rules', async () => {
      const result = await handleListActiveRules({ language: 'javascript' });
      const text = result.content[0].text;

      // S1481 row should have empty params column
      const lines = text.split('\n');
      const s1481Line = lines.find((l: string) => l.includes('S1481'));
      expect(s1481Line).toBeDefined();
      // The params column should be empty (two consecutive pipes with only spaces)
      expect(s1481Line).toMatch(/S1481.*\|[^|]*\| +\|/);
    });
  });

  describe('output format', () => {
    it('should include total rule count', async () => {
      const result = await handleListActiveRules({});
      const text = result.content[0].text;

      // 4 active rules (S1234 is inactive)
      expect(text).toContain('Total Active Rules**: 4');
    });

    it('should group rules by language with section headers', async () => {
      const result = await handleListActiveRules({});
      const text = result.content[0].text;

      expect(text).toContain('## JS');
      expect(text).toContain('## TS');
      expect(text).toContain('## PYTHON');
    });

    it('should sort rules by key within each language', async () => {
      const result = await handleListActiveRules({ language: 'javascript' });
      const text = result.content[0].text;

      const s1481Pos = text.indexOf('S1481');
      const s3776Pos = text.indexOf('S3776');
      expect(s1481Pos).toBeLessThan(s3776Pos);
    });
  });

  describe('error handling', () => {
    it('should return error message when SLOOP call fails', async () => {
      mockListAllStandaloneRulesDefinitions.mockRejectedValue(new Error('Connection refused'));

      const result = await handleListActiveRules({});
      const text = result.content[0].text;

      expect(text).toContain('Failed to retrieve rules');
      expect(text).toContain('Connection refused');
    });
  });
});
