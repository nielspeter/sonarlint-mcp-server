import { describe, it, expect } from 'vitest';
import { transformSloopIssues, createSummary } from '../../src/utils/transforms.js';

// SLOOP delivers severity via `severityMode` — an Either of:
//   StandardModeDetails { severity: IssueSeverity, type: RuleType }
//   MQRModeDetails      { cleanCodeAttribute, impacts: [{ softwareQuality, impactSeverity }] }
// Source: sonarlint-core rpc-protocol RaisedFindingDto.java

function baseIssue(overrides: Record<string, unknown> = {}) {
  return {
    ruleKey: 'typescript:S1135',
    primaryMessage: 'msg',
    textRange: { startLine: 1, startLineOffset: 0, endLine: 1, endLineOffset: 5 },
    quickFixes: [],
    ...overrides,
  };
}

describe('transformSloopIssues — severityMode unpacking', () => {
  describe('standard mode (severityMode = StandardModeDetails)', () => {
    it.each(['INFO', 'MINOR', 'MAJOR', 'CRITICAL', 'BLOCKER'])('passes through %s severity verbatim', (sev) => {
      const [out] = transformSloopIssues([baseIssue({ severityMode: { severity: sev, type: 'CODE_SMELL' } })]);
      expect(out.severity).toBe(sev);
    });
  });

  describe('MQR mode (severityMode = MQRModeDetails)', () => {
    it('maps a single LOW impact → MINOR', () => {
      const [out] = transformSloopIssues([
        baseIssue({
          severityMode: {
            cleanCodeAttribute: 'CLEAR',
            impacts: [{ softwareQuality: 'MAINTAINABILITY', impactSeverity: 'LOW' }],
          },
        }),
      ]);
      expect(out.severity).toBe('MINOR');
    });

    it('maps MEDIUM → MAJOR', () => {
      const [out] = transformSloopIssues([
        baseIssue({
          severityMode: {
            cleanCodeAttribute: 'CLEAR',
            impacts: [{ softwareQuality: 'RELIABILITY', impactSeverity: 'MEDIUM' }],
          },
        }),
      ]);
      expect(out.severity).toBe('MAJOR');
    });

    it('maps HIGH → CRITICAL', () => {
      const [out] = transformSloopIssues([
        baseIssue({
          severityMode: {
            cleanCodeAttribute: 'CLEAR',
            impacts: [{ softwareQuality: 'SECURITY', impactSeverity: 'HIGH' }],
          },
        }),
      ]);
      expect(out.severity).toBe('CRITICAL');
    });

    it('passes INFO and BLOCKER through unchanged (shared with legacy scale)', () => {
      const [info] = transformSloopIssues([
        baseIssue({
          severityMode: {
            cleanCodeAttribute: 'CLEAR',
            impacts: [{ softwareQuality: 'MAINTAINABILITY', impactSeverity: 'INFO' }],
          },
        }),
      ]);
      expect(info.severity).toBe('INFO');

      const [blocker] = transformSloopIssues([
        baseIssue({
          severityMode: {
            cleanCodeAttribute: 'CLEAR',
            impacts: [{ softwareQuality: 'SECURITY', impactSeverity: 'BLOCKER' }],
          },
        }),
      ]);
      expect(blocker.severity).toBe('BLOCKER');
    });

    it('picks the worst severity when multiple impacts are present', () => {
      const [out] = transformSloopIssues([
        baseIssue({
          severityMode: {
            cleanCodeAttribute: 'CLEAR',
            impacts: [
              { softwareQuality: 'MAINTAINABILITY', impactSeverity: 'LOW' },
              { softwareQuality: 'SECURITY', impactSeverity: 'HIGH' },
              { softwareQuality: 'RELIABILITY', impactSeverity: 'MEDIUM' },
            ],
          },
        }),
      ]);
      expect(out.severity).toBe('CRITICAL');
    });
  });

  describe('fallback', () => {
    it('falls back to MAJOR when severityMode is missing entirely', () => {
      const [out] = transformSloopIssues([baseIssue({})]);
      expect(out.severity).toBe('MAJOR');
    });

    it('falls back to MAJOR when severityMode is empty', () => {
      const [out] = transformSloopIssues([baseIssue({ severityMode: {} })]);
      expect(out.severity).toBe('MAJOR');
    });
  });
});

describe('createSummary — severity buckets reflect real distribution', () => {
  it('counts severities other than major when the data has them', () => {
    const issues = transformSloopIssues([
      baseIssue({ severityMode: { severity: 'INFO', type: 'CODE_SMELL' } }),
      baseIssue({ severityMode: { severity: 'MINOR', type: 'CODE_SMELL' } }),
      baseIssue({ severityMode: { severity: 'BLOCKER', type: 'VULNERABILITY' } }),
    ]);
    const summary = createSummary(issues, 100);
    expect(summary.bySeverity.info).toBe(1);
    expect(summary.bySeverity.minor).toBe(1);
    expect(summary.bySeverity.blocker).toBe(1);
    expect(summary.bySeverity.major).toBe(0);
  });
});
