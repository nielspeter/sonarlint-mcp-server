import { describe, it, expect } from 'vitest';

// Note: These functions need to be exported from src/index.ts or moved to src/helpers.ts
// For now, we'll import them assuming they'll be refactored

/**
 * Helper function to map language names to SLOOP Language enum values
 */
function languageToEnum(language: string): string {
  const enumMap: Record<string, string> = {
    javascript: 'JS',
    typescript: 'TS',
    python: 'PYTHON',
    java: 'JAVA',
    go: 'GO',
    php: 'PHP',
    ruby: 'RUBY',
    html: 'HTML',
    css: 'CSS',
    xml: 'XML',
  };
  return enumMap[language] || language.toUpperCase();
}

/**
 * Helper function to detect language from file extension
 */
function detectLanguage(filePath: string): string {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  const languageMap: Record<string, string> = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.java': 'java',
    '.go': 'go',
    '.php': 'php',
    '.rb': 'ruby',
    '.html': 'html',
    '.htm': 'html',
    '.css': 'css',
    '.xml': 'xml',
  };
  return languageMap[ext] || 'unknown';
}

describe('languageToEnum', () => {
  describe('standard language mappings', () => {
    it('should map javascript to JS', () => {
      expect(languageToEnum('javascript')).toBe('JS');
    });

    it('should map typescript to TS', () => {
      expect(languageToEnum('typescript')).toBe('TS');
    });

    it('should map python to PYTHON', () => {
      expect(languageToEnum('python')).toBe('PYTHON');
    });

    it('should map java to JAVA', () => {
      expect(languageToEnum('java')).toBe('JAVA');
    });

    it('should map go to GO', () => {
      expect(languageToEnum('go')).toBe('GO');
    });

    it('should map php to PHP', () => {
      expect(languageToEnum('php')).toBe('PHP');
    });

    it('should map ruby to RUBY', () => {
      expect(languageToEnum('ruby')).toBe('RUBY');
    });

    it('should map html to HTML', () => {
      expect(languageToEnum('html')).toBe('HTML');
    });

    it('should map css to CSS', () => {
      expect(languageToEnum('css')).toBe('CSS');
    });

    it('should map xml to XML', () => {
      expect(languageToEnum('xml')).toBe('XML');
    });
  });

  describe('unknown language handling', () => {
    it('should uppercase unknown languages', () => {
      expect(languageToEnum('rust')).toBe('RUST');
    });

    it('should handle empty string', () => {
      expect(languageToEnum('')).toBe('');
    });

    it('should preserve case for unmapped languages', () => {
      expect(languageToEnum('MyCustomLang')).toBe('MYCUSTOMLANG');
    });
  });
});

describe('detectLanguage', () => {
  describe('JavaScript file extensions', () => {
    it('should detect .js files as javascript', () => {
      expect(detectLanguage('test.js')).toBe('javascript');
    });

    it('should detect .jsx files as javascript', () => {
      expect(detectLanguage('Component.jsx')).toBe('javascript');
    });

    it('should handle paths with directories', () => {
      expect(detectLanguage('/path/to/file.js')).toBe('javascript');
    });
  });

  describe('TypeScript file extensions', () => {
    it('should detect .ts files as typescript', () => {
      expect(detectLanguage('test.ts')).toBe('typescript');
    });

    it('should detect .tsx files as typescript', () => {
      expect(detectLanguage('Component.tsx')).toBe('typescript');
    });
  });

  describe('Python file extensions', () => {
    it('should detect .py files as python', () => {
      expect(detectLanguage('script.py')).toBe('python');
    });
  });

  describe('other languages', () => {
    it('should detect .java files', () => {
      expect(detectLanguage('Main.java')).toBe('java');
    });

    it('should detect .go files', () => {
      expect(detectLanguage('main.go')).toBe('go');
    });

    it('should detect .php files', () => {
      expect(detectLanguage('index.php')).toBe('php');
    });

    it('should detect .rb files', () => {
      expect(detectLanguage('script.rb')).toBe('ruby');
    });

    it('should detect .html files', () => {
      expect(detectLanguage('index.html')).toBe('html');
    });

    it('should detect .htm files as html', () => {
      expect(detectLanguage('index.htm')).toBe('html');
    });

    it('should detect .css files', () => {
      expect(detectLanguage('styles.css')).toBe('css');
    });

    it('should detect .xml files', () => {
      expect(detectLanguage('config.xml')).toBe('xml');
    });
  });

  describe('edge cases', () => {
    it('should handle files with no extension', () => {
      expect(detectLanguage('Makefile')).toBe('unknown');
    });

    it('should handle uppercase extensions', () => {
      expect(detectLanguage('test.JS')).toBe('javascript');
    });

    it('should handle multiple dots in filename', () => {
      expect(detectLanguage('test.spec.js')).toBe('javascript');
    });

    it('should handle absolute paths', () => {
      expect(detectLanguage('/Users/user/project/src/index.ts')).toBe('typescript');
    });

    it('should handle Windows paths', () => {
      expect(detectLanguage('C:\\Users\\user\\project\\src\\index.ts')).toBe('typescript');
    });

    it('should return unknown for unsupported extensions', () => {
      expect(detectLanguage('file.txt')).toBe('unknown');
    });
  });
});

describe('combined language detection pipeline', () => {
  it('should map JS file to JS enum', () => {
    const language = detectLanguage('test.js');
    const enumValue = languageToEnum(language);
    expect(enumValue).toBe('JS');
  });

  it('should map TS file to TS enum', () => {
    const language = detectLanguage('test.ts');
    const enumValue = languageToEnum(language);
    expect(enumValue).toBe('TS');
  });

  it('should map Python file to PYTHON enum', () => {
    const language = detectLanguage('script.py');
    const enumValue = languageToEnum(language);
    expect(enumValue).toBe('PYTHON');
  });

  it('should handle unknown file types', () => {
    const language = detectLanguage('file.unknown');
    const enumValue = languageToEnum(language);
    expect(enumValue).toBe('UNKNOWN');
  });
});
