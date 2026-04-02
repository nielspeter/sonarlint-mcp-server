import { describe, it, expect } from 'vitest';

/**
 * Tests for ClientFileDto construction logic
 *
 * These tests verify the correct structure of ClientFileDto objects
 * that are sent to SLOOP via file/didUpdateFileSystem notifications.
 *
 * CRITICAL FIELDS DISCOVERED VIA REVERSE ENGINEERING:
 * - isUserDefined: MUST be true for SLOOP to analyze the file
 * - content: MUST be provided to trigger isDirty=true flag
 * - fsPath: Should be provided for analyzer context
 * - detectedLanguage: Must be uppercase enum (JS, TS, PYTHON, etc.)
 */

interface ClientFileDto {
  uri: string;
  ideRelativePath: string;
  configScopeId: string;
  isTest: boolean | null;
  charset: string;
  fsPath: string;
  content: string;
  detectedLanguage: string;
  isUserDefined: boolean;
}

function createClientFileDto(
  filePath: string,
  projectRoot: string,
  configScopeId: string,
  content: string,
  language: string,
): ClientFileDto {
  const relativePath = filePath.replace(projectRoot + '/', '');

  return {
    uri: `file://${filePath}`,
    ideRelativePath: relativePath,
    configScopeId,
    isTest: null,
    charset: 'UTF-8',
    fsPath: filePath,
    content,
    detectedLanguage: language,
    isUserDefined: true, // CRITICAL: Must be true!
  };
}

describe('ClientFileDto construction', () => {
  const projectRoot = '/Users/test/project';
  const configScopeId = 'test-scope-123';
  const sampleContent = 'const x = 1;\n';

  describe('URI format', () => {
    it('should create file:// URI with absolute path', () => {
      const filePath = '/Users/test/project/src/index.js';
      const dto = createClientFileDto(filePath, projectRoot, configScopeId, sampleContent, 'JS');

      expect(dto.uri).toBe('file:///Users/test/project/src/index.js');
    });

    it('should handle Windows-style paths', () => {
      const filePath = 'C:/Users/test/project/src/index.js';
      const dto = createClientFileDto(filePath, 'C:/Users/test/project', configScopeId, sampleContent, 'JS');

      expect(dto.uri).toBe('file://C:/Users/test/project/src/index.js');
    });
  });

  describe('relative path calculation', () => {
    it('should calculate correct relative path', () => {
      const filePath = '/Users/test/project/src/components/Button.tsx';
      const dto = createClientFileDto(filePath, projectRoot, configScopeId, sampleContent, 'TS');

      expect(dto.ideRelativePath).toBe('src/components/Button.tsx');
    });

    it('should handle files in project root', () => {
      const filePath = '/Users/test/project/index.js';
      const dto = createClientFileDto(filePath, projectRoot, configScopeId, sampleContent, 'JS');

      expect(dto.ideRelativePath).toBe('index.js');
    });

    it('should handle nested directories', () => {
      const filePath = '/Users/test/project/src/utils/helpers/format.ts';
      const dto = createClientFileDto(filePath, projectRoot, configScopeId, sampleContent, 'TS');

      expect(dto.ideRelativePath).toBe('src/utils/helpers/format.ts');
    });
  });

  describe('CRITICAL FIELD: isUserDefined', () => {
    it('should always be true for analysis to work', () => {
      const filePath = '/Users/test/project/src/index.js';
      const dto = createClientFileDto(filePath, projectRoot, configScopeId, sampleContent, 'JS');

      expect(dto.isUserDefined).toBe(true);
    });

    it('should NOT be false (will cause 0 issues)', () => {
      const filePath = '/Users/test/project/src/index.js';
      const dto = createClientFileDto(filePath, projectRoot, configScopeId, sampleContent, 'JS');

      // This is critical - false means SLOOP ignores the file!
      expect(dto.isUserDefined).not.toBe(false);
    });
  });

  describe('CRITICAL FIELD: content', () => {
    it('should provide actual file content to trigger isDirty flag', () => {
      const filePath = '/Users/test/project/src/index.js';
      const fileContent = 'function test() { return 42; }';
      const dto = createClientFileDto(filePath, projectRoot, configScopeId, fileContent, 'JS');

      expect(dto.content).toBe(fileContent);
    });

    it('should NOT be null (prevents cache invalidation)', () => {
      const filePath = '/Users/test/project/src/index.js';
      const dto = createClientFileDto(filePath, projectRoot, configScopeId, sampleContent, 'JS');

      // This is critical - null content means SLOOP reads from disk (stale!)
      expect(dto.content).not.toBeNull();
      expect(dto.content).toBeDefined();
      expect(dto.content.length).toBeGreaterThan(0);
    });

    it('should handle empty files', () => {
      const filePath = '/Users/test/project/src/empty.js';
      const dto = createClientFileDto(filePath, projectRoot, configScopeId, '', 'JS');

      // Empty content is valid (just an empty file)
      expect(dto.content).toBe('');
    });

    it('should preserve content exactly as provided', () => {
      const multilineContent = `function test() {
  const x = 1;
  return x;
}`;
      const filePath = '/Users/test/project/src/test.js';
      const dto = createClientFileDto(filePath, projectRoot, configScopeId, multilineContent, 'JS');

      expect(dto.content).toBe(multilineContent);
    });
  });

  describe('CRITICAL FIELD: fsPath', () => {
    it('should provide absolute file system path', () => {
      const filePath = '/Users/test/project/src/index.js';
      const dto = createClientFileDto(filePath, projectRoot, configScopeId, sampleContent, 'JS');

      expect(dto.fsPath).toBe(filePath);
    });

    it('should NOT be null (analyzers need context)', () => {
      const filePath = '/Users/test/project/src/index.js';
      const dto = createClientFileDto(filePath, projectRoot, configScopeId, sampleContent, 'JS');

      expect(dto.fsPath).not.toBeNull();
      expect(dto.fsPath).toBeDefined();
    });
  });

  describe('detectedLanguage enum', () => {
    it('should use uppercase enum values', () => {
      const filePath = '/Users/test/project/src/index.js';
      const dto = createClientFileDto(filePath, projectRoot, configScopeId, sampleContent, 'JS');

      expect(dto.detectedLanguage).toBe('JS');
      expect(dto.detectedLanguage).not.toBe('javascript');
    });

    it('should support TypeScript enum', () => {
      const filePath = '/Users/test/project/src/index.ts';
      const dto = createClientFileDto(filePath, projectRoot, configScopeId, sampleContent, 'TS');

      expect(dto.detectedLanguage).toBe('TS');
    });

    it('should support Python enum', () => {
      const filePath = '/Users/test/project/script.py';
      const dto = createClientFileDto(filePath, projectRoot, configScopeId, sampleContent, 'PYTHON');

      expect(dto.detectedLanguage).toBe('PYTHON');
    });

    it('should support Java enum', () => {
      const filePath = '/Users/test/project/src/Main.java';
      const dto = createClientFileDto(filePath, projectRoot, configScopeId, sampleContent, 'JAVA');

      expect(dto.detectedLanguage).toBe('JAVA');
    });
  });

  describe('other required fields', () => {
    it('should set charset to UTF-8', () => {
      const filePath = '/Users/test/project/src/index.js';
      const dto = createClientFileDto(filePath, projectRoot, configScopeId, sampleContent, 'JS');

      expect(dto.charset).toBe('UTF-8');
    });

    it('should set isTest to null by default', () => {
      const filePath = '/Users/test/project/src/index.js';
      const dto = createClientFileDto(filePath, projectRoot, configScopeId, sampleContent, 'JS');

      expect(dto.isTest).toBeNull();
    });

    it('should include configScopeId', () => {
      const filePath = '/Users/test/project/src/index.js';
      const dto = createClientFileDto(filePath, projectRoot, configScopeId, sampleContent, 'JS');

      expect(dto.configScopeId).toBe(configScopeId);
    });
  });

  describe('complete DTO validation', () => {
    it('should have all required fields', () => {
      const filePath = '/Users/test/project/src/index.js';
      const dto = createClientFileDto(filePath, projectRoot, configScopeId, sampleContent, 'JS');

      // Verify all fields exist
      expect(dto).toHaveProperty('uri');
      expect(dto).toHaveProperty('ideRelativePath');
      expect(dto).toHaveProperty('configScopeId');
      expect(dto).toHaveProperty('isTest');
      expect(dto).toHaveProperty('charset');
      expect(dto).toHaveProperty('fsPath');
      expect(dto).toHaveProperty('content');
      expect(dto).toHaveProperty('detectedLanguage');
      expect(dto).toHaveProperty('isUserDefined');
    });

    it('should match the verified working implementation', () => {
      const filePath = '/Users/test/project/test-simple.js';
      const fileContent = 'function test() { return; }';
      const dto = createClientFileDto(filePath, projectRoot, 'test-scope', fileContent, 'JS');

      // This is the exact structure that worked in our tests
      expect(dto).toEqual({
        uri: 'file:///Users/test/project/test-simple.js',
        ideRelativePath: 'test-simple.js',
        configScopeId: 'test-scope',
        isTest: null,
        charset: 'UTF-8',
        fsPath: filePath,
        content: fileContent,
        detectedLanguage: 'JS',
        isUserDefined: true,
      });
    });
  });
});
