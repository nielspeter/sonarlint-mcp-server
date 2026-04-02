/**
 * Build ClientFileDto objects for SLOOP's virtual file system.
 *
 * SLOOP requires files to be registered via file/didUpdateFileSystem
 * before they can be analyzed.
 */

import { readFileSync } from 'fs';
import { relative, dirname } from 'path';
import { languageToEnum, detectLanguage } from './language.js';

export interface ClientFileDto {
  uri: string;
  fsPath: string;
  ideRelativePath: string;
  configScopeId: string;
  isTest: boolean;
  charset: string;
  content: string;
  detectedLanguage: string | null;
  isUserDefined: boolean;
}

/**
 * Build ClientFileDto array from file paths for SLOOP VFS registration.
 */
export function buildClientFileDtos(filePaths: string[], configScopeId: string, projectRoot?: string): ClientFileDto[] {
  const baseDir = projectRoot || dirname(filePaths[0]);

  return filePaths.map((filePath) => {
    const content = readFileSync(filePath, 'utf-8');
    const language = detectLanguage(filePath);
    const sloopLanguage = language !== 'unknown' ? languageToEnum(language) : null;

    return {
      uri: `file://${filePath}`,
      fsPath: filePath,
      ideRelativePath: relative(baseDir, filePath),
      configScopeId,
      isTest: /tests?[/\\]/.test(filePath),
      charset: 'UTF-8',
      content,
      detectedLanguage: sloopLanguage,
      isUserDefined: true,
    };
  });
}
