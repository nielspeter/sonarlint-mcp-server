/**
 * Configuration scope management utilities
 */

import { dirname, join } from "path";
import { existsSync } from "fs";
import { createHash } from "crypto";
import { scopeMap, getSloopBridge } from "../state.js";

/**
 * Find the project root by walking up to find package.json, .git, etc.
 */
function findProjectRoot(startPath: string): string {
  let dir = startPath;
  const markers = ['package.json', '.git', 'pom.xml', 'build.gradle', 'pyproject.toml', 'go.mod'];

  while (dir !== dirname(dir)) { // stop at filesystem root
    for (const marker of markers) {
      if (existsSync(join(dir, marker))) {
        return dir;
      }
    }
    dir = dirname(dir);
  }

  // Fallback: use the original directory
  return startPath;
}

/**
 * Get or create configuration scope for a project.
 * Uses the project root (detected via package.json, .git, etc.) so all files
 * in the same project share one scope and one analysis call.
 */
export function getOrCreateScope(filePath: string): string {
  const projectRoot = findProjectRoot(dirname(filePath));
  const scopeId = scopeMap.get(projectRoot);

  if (scopeId) {
    return scopeId;
  }

  // Create new scope ID based on project root hash
  const hash = createHash('md5').update(projectRoot).digest('hex').substring(0, 8);
  const newScopeId = `scope-${hash}`;

  console.error(`[MCP] Creating new configuration scope: ${newScopeId} for ${projectRoot}`);

  // Add scope to SLOOP
  const sloopBridge = getSloopBridge();
  if (sloopBridge) {
    sloopBridge.addConfigurationScope(newScopeId, {
      name: `Project: ${projectRoot}`,
    });
  }

  scopeMap.set(projectRoot, newScopeId);
  return newScopeId;
}
