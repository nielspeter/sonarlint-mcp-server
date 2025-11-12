/**
 * Configuration scope management utilities
 */

import { dirname } from "path";
import { createHash } from "crypto";
import { scopeMap, getSloopBridge } from "../state.js";

/**
 * Get or create configuration scope for a project
 */
export function getOrCreateScope(filePath: string): string {
  const projectRoot = dirname(filePath);
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
