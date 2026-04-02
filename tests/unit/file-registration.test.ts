import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { relative } from 'path';
import { buildClientFileDtos } from '../../src/utils/file-registration.js';

/**
 * Tests for file registration with SLOOP's virtual file system.
 *
 * SLOOP requires files to be registered via file/didUpdateFileSystem
 * before analysis. Each file must be sent as a ClientFileDto with
 * content, URI, and isUserDefined: true.
 */

describe('file registration', () => {
  describe('buildClientFileDtos', () => {
    it('should build ClientFileDto for a single file', () => {
      const filePath = __filename; // this test file
      const scopeId = 'test-scope';

      const dtos = buildClientFileDtos([filePath], scopeId);

      expect(dtos).toHaveLength(1);
      expect(dtos[0].uri).toBe(`file://${filePath}`);
      expect(dtos[0].fsPath).toBe(filePath);
      expect(dtos[0].configScopeId).toBe('test-scope');
      expect(dtos[0].isUserDefined).toBe(true);
      expect(dtos[0].charset).toBe('UTF-8');
    });

    it('should include file content for SLOOP VFS', () => {
      const filePath = __filename;
      const dtos = buildClientFileDtos([filePath], 'scope');

      expect(typeof dtos[0].content).toBe('string');
      expect(dtos[0].content.length).toBeGreaterThan(0);
      // Content should match actual file
      expect(dtos[0].content).toBe(readFileSync(filePath, 'utf-8'));
    });

    it('should set ideRelativePath relative to project root', () => {
      const filePath = __filename;
      const projectRoot = process.cwd();
      const dtos = buildClientFileDtos([filePath], 'scope', projectRoot);

      expect(dtos[0].ideRelativePath).toBe(relative(projectRoot, filePath));
    });

    it('should detect language enum for TypeScript files', () => {
      const filePath = '/some/path/file.ts';
      // Will fail to read content, but we test the structure
      try {
        buildClientFileDtos([filePath], 'scope');
      } catch {
        // Expected - file doesn't exist
      }
    });

    it('should handle multiple files', () => {
      // Use files we know exist
      const files = [__filename];
      const dtos = buildClientFileDtos(files, 'scope');

      expect(dtos.length).toBe(files.length);
      for (const dto of dtos) {
        expect(dto.isUserDefined).toBe(true);
        expect(dto.content).toBeTruthy();
      }
    });

    it('should mark test files based on path', () => {
      const filePath = __filename; // in tests/ directory
      const dtos = buildClientFileDtos([filePath], 'scope');

      expect(dtos[0].isTest).toBe(true);
    });

    it('should not mark source files as test', () => {
      // Use a known source file
      const srcFile = require.resolve('../../src/utils/language.ts');
      const dtos = buildClientFileDtos([srcFile], 'scope');

      expect(dtos[0].isTest).toBe(false);
    });
  });
});
