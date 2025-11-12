/**
 * File system utilities for SLOOP integration
 */

import { dirname, relative } from "path";
import { readFileSync } from "fs";
import { scopeMap } from "../state.js";
import { detectLanguage, languageToEnum } from "./language.js";
import { ensureSloopBridge } from "./sloop.js";

/**
 * Notify SLOOP that file system was updated (proper cache invalidation)
 */
export async function notifyFileSystemChanged(filePath: string, configScopeId: string): Promise<void> {
  const uri = `file://${filePath}`;

  // Get project root from scopeMap (reverse lookup)
  let projectRoot: string | undefined;
  for (const [root, scopeId] of scopeMap.entries()) {
    if (scopeId === configScopeId) {
      projectRoot = root;
      break;
    }
  }

  // If no project root found, use file's directory
  if (!projectRoot) {
    projectRoot = dirname(filePath);
  }

  const relativePath = relative(projectRoot, filePath);

  try {
    const bridge = await ensureSloopBridge();

    // Detect language from file extension
    const language = detectLanguage(filePath);
    const languageEnum = languageToEnum(language);

    // CRITICAL: Tell SLOOP the file is "open" so it will re-analyze on file system updates
    // Without this, SLOOP ignores changes to "closed" files
    bridge.sendNotification('file/didOpenFile', {
      configurationScopeId: configScopeId,
      fileUri: uri
    });
    console.error(`[FS] Marked file as open: ${filePath}`);

    // Read the actual file content to pass to SLOOP
    // This ensures SLOOP gets the latest content instead of reading from its cache
    const fileContent = readFileSync(filePath, 'utf-8');

    // Build ClientFileDto
    // Pass BOTH fsPath and content - fromDto will call setDirty(content) which takes precedence
    const clientFileDto = {
      uri,
      ideRelativePath: relativePath,
      configScopeId,
      isTest: null,
      charset: 'UTF-8',
      fsPath: filePath, // Provide fsPath for analyzers that need it
      content: fileContent, // Providing content calls setDirty(), which takes precedence over fsPath
      detectedLanguage: languageEnum, // e.g., "JS", "TS", "PYTHON"
      isUserDefined: true // CRITICAL: Must be true for SLOOP to analyze!
    };

    // Send file/didUpdateFileSystem notification
    bridge.sendNotification('file/didUpdateFileSystem', {
      addedFiles: [],
      changedFiles: [clientFileDto],
      removedFiles: []
    });

    console.error(`[FS] Notified file system update:`);
    console.error(`[FS]   URI: ${uri}`);
    console.error(`[FS]   Language: ${languageEnum}`);
    console.error(`[FS]   Relative: ${relativePath}`);
    console.error(`[FS]   ConfigScopeId: ${configScopeId}`);
    console.error(`[FS]   Content length: ${fileContent.length} chars`);
    console.error(`[FS]   First 100 chars: ${fileContent.substring(0, 100)}`);
  } catch (err) {
    console.error(`[FS] Failed to notify file system update for ${filePath}:`, err);
    // Don't throw - this is not critical
  }
}
