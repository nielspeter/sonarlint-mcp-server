import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state module before importing health-check
vi.mock('../../src/state.js', () => ({
  sessionResults: new Map(),
  batchResults: new Map(),
  getSloopBridge: vi.fn(() => null),
  serverStartTime: Date.now(),
}));

import * as state from '../../src/state.js';
import { handleHealthCheck } from '../../src/tools/health-check.js';

describe('health_check tool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('version reporting', () => {
    it('should report version from package.json, not hardcoded', async () => {
      const result = await handleHealthCheck();
      const text = result.content[0].text;

      // Must NOT contain old hardcoded version
      expect(text).not.toContain('1.0.0');
      expect(text).not.toContain('Phase 3');

      // Should contain a semver-like version from package.json
      expect(text).toMatch(/\*\*Version\*\*: \d+\.\d+\.\d+/);
    });
  });

  describe('backend status reporting', () => {
    it('should show "ready" status when SLOOP not yet started but plugins exist', async () => {
      // sloopBridge is null by default in mock
      const result = await handleHealthCheck();
      const text = result.content[0].text;

      // Should not report "degraded" just because SLOOP hasn't started yet
      // (plugins directory exists in the project)
      expect(text).not.toContain('not started\n');
      expect(text).toContain('starts on first analysis');
    });

    it('should show "running" when SLOOP bridge is initialized', async () => {
      // Simulate SLOOP being started
      const fakeBridge = {} as any;
      vi.mocked(state.getSloopBridge).mockReturnValue(fakeBridge);

      const result = await handleHealthCheck();
      const text = result.content[0].text;

      expect(text).toContain('running');
    });
  });

  describe('output structure', () => {
    it('should include all expected sections', async () => {
      const result = await handleHealthCheck();
      const text = result.content[0].text;

      expect(text).toContain('# SonarLint MCP Server Health Check');
      expect(text).toContain('## Backend Status');
      expect(text).toContain('## Memory Usage');
      expect(text).toContain('## Cache Statistics');
      expect(text).toContain('## Available Tools');
      expect(text).toContain('## Features');
    });

    it('should return proper MCP content format', async () => {
      const result = await handleHealthCheck();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');
    });
  });
});
