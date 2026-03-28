import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

/**
 * Tests for raiseIssues notification handling in SloopBridge.
 *
 * SLOOP delivers analysis issues via client notifications (raiseIssues),
 * NOT in the analyzeFilesAndTrack response. The bridge must collect these
 * notifications and return them from analyzeFilesAndTrack.
 */

// We test the issue collection logic directly rather than spawning a real SLOOP process.
// The bridge stores raised issues per analysis ID and returns them when analysis completes.

describe('SloopBridge raiseIssues handling', () => {
  // Simulated raiseIssues notification payload (based on SLOOP protocol)
  const sampleRaiseIssuesParams = {
    analysisId: 'test-analysis-123',
    issuesByFileUri: {
      'file:///path/to/file.ts': [
        {
          ruleKey: 'typescript:S3776',
          primaryMessage: 'Refactor this function to reduce its Cognitive Complexity from 25 to the 15 allowed.',
          severity: 'CRITICAL',
          type: 'CODE_SMELL',
          textRange: {
            startLine: 10,
            startLineOffset: 2,
            endLine: 10,
            endLineOffset: 20,
          },
          quickFixes: [],
        },
        {
          ruleKey: 'typescript:S1854',
          primaryMessage: 'Remove this useless assignment to local variable "temp".',
          severity: 'MAJOR',
          type: 'CODE_SMELL',
          textRange: {
            startLine: 25,
            startLineOffset: 4,
            endLine: 25,
            endLineOffset: 30,
          },
          quickFixes: [
            {
              message: 'Remove assignment',
              inputFileEdits: [
                {
                  target: 'file:///path/to/file.ts',
                  textEdits: [
                    {
                      range: { startLine: 25, startLineOffset: 4, endLine: 25, endLineOffset: 30 },
                      newText: '',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    isIntermediatePublication: false,
  };

  const sampleRaiseHotspotsParams = {
    analysisId: 'test-analysis-123',
    hotspotsByFileUri: {
      'file:///path/to/file.ts': [
        {
          ruleKey: 'typescript:S5122',
          primaryMessage: 'Make sure that enabling CORS is safe here.',
          severity: 'MINOR',
          textRange: {
            startLine: 42,
            startLineOffset: 0,
            endLine: 42,
            endLineOffset: 40,
          },
        },
      ],
    },
    isIntermediatePublication: false,
  };

  describe('IssueCollector', () => {
    // We import the IssueCollector which manages per-analysis issue storage
    let IssueCollector: any;

    beforeEach(async () => {
      const mod = await import('../../src/utils/issue-collector.js');
      IssueCollector = mod.IssueCollector;
    });

    it('should store issues from raiseIssues notifications', () => {
      const collector = new IssueCollector();

      collector.addIssues('test-analysis-123', sampleRaiseIssuesParams.issuesByFileUri);

      const issues = collector.getAndClear('test-analysis-123');
      expect(issues).toHaveLength(2);
      expect(issues[0].ruleKey).toBe('typescript:S3776');
      expect(issues[1].ruleKey).toBe('typescript:S1854');
    });

    it('should store hotspots from raiseHotspots notifications', () => {
      const collector = new IssueCollector();

      collector.addHotspots('test-analysis-123', sampleRaiseHotspotsParams.hotspotsByFileUri);

      const hotspots = collector.getHotspotsAndClear('test-analysis-123');
      expect(hotspots).toHaveLength(1);
      expect(hotspots[0].ruleKey).toBe('typescript:S5122');
    });

    it('should accumulate issues from multiple notifications for the same analysis', () => {
      const collector = new IssueCollector();

      // First notification (intermediate)
      collector.addIssues('test-analysis-123', {
        'file:///path/to/a.ts': [
          { ruleKey: 'typescript:S1', primaryMessage: 'Issue 1', severity: 'MAJOR' },
        ],
      });

      // Second notification (final)
      collector.addIssues('test-analysis-123', {
        'file:///path/to/b.ts': [
          { ruleKey: 'typescript:S2', primaryMessage: 'Issue 2', severity: 'MINOR' },
        ],
      });

      const issues = collector.getAndClear('test-analysis-123');
      expect(issues).toHaveLength(2);
    });

    it('should return empty array for unknown analysis ID', () => {
      const collector = new IssueCollector();

      const issues = collector.getAndClear('nonexistent');
      expect(issues).toEqual([]);
    });

    it('should clear issues after getAndClear', () => {
      const collector = new IssueCollector();

      collector.addIssues('test-analysis-123', sampleRaiseIssuesParams.issuesByFileUri);

      // First call returns issues
      const issues = collector.getAndClear('test-analysis-123');
      expect(issues).toHaveLength(2);

      // Second call returns empty (cleared)
      const again = collector.getAndClear('test-analysis-123');
      expect(again).toEqual([]);
    });

    it('should keep issues separate per analysis ID', () => {
      const collector = new IssueCollector();

      collector.addIssues('analysis-A', {
        'file:///a.ts': [{ ruleKey: 'rule:A', primaryMessage: 'A', severity: 'MAJOR' }],
      });
      collector.addIssues('analysis-B', {
        'file:///b.ts': [
          { ruleKey: 'rule:B1', primaryMessage: 'B1', severity: 'MINOR' },
          { ruleKey: 'rule:B2', primaryMessage: 'B2', severity: 'INFO' },
        ],
      });

      const issuesA = collector.getAndClear('analysis-A');
      const issuesB = collector.getAndClear('analysis-B');

      expect(issuesA).toHaveLength(1);
      expect(issuesB).toHaveLength(2);
    });

    it('should include fileUri on each issue for multi-file analysis', () => {
      const collector = new IssueCollector();

      collector.addIssues('test-analysis-123', {
        'file:///path/to/a.ts': [
          { ruleKey: 'rule:1', primaryMessage: 'msg', severity: 'MAJOR' },
        ],
        'file:///path/to/b.ts': [
          { ruleKey: 'rule:2', primaryMessage: 'msg', severity: 'MINOR' },
        ],
      });

      const issues = collector.getAndClear('test-analysis-123');
      expect(issues[0].fileUri).toBe('file:///path/to/a.ts');
      expect(issues[1].fileUri).toBe('file:///path/to/b.ts');
    });
  });
});
