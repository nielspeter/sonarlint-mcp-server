/**
 * Language detection and mapping utilities
 */

import { extname } from "path";

/**
 * Detect language from file extension
 */
export function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
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
    '.css': 'css',
    '.xml': 'xml',
  };
  return languageMap[ext] || 'unknown';
}

/**
 * Map language name to SLOOP Language enum
 */
export function languageToEnum(language: string): string {
  const enumMap: Record<string, string> = {
    'javascript': 'JS',
    'typescript': 'TS',
    'python': 'PYTHON',
    'java': 'JAVA',
    'go': 'GO',
    'php': 'PHP',
    'ruby': 'RUBY',
    'html': 'HTML',
    'css': 'CSS',
    'xml': 'XML',
  };
  return enumMap[language] || language.toUpperCase();
}
