/**
 * Configuration scope management utilities
 */

import { dirname, join } from "path";
import { existsSync } from "fs";
import { createHash } from "crypto";
import { scopeMap, scopeToProjectRoot, scopeFiles, getSloopBridge } from "../state.js";
import { buildClientFileDtos } from "./file-registration.js";

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
 * Get or create a SLOOP configuration scope for a project.
 *
 * Uses the project root (detected via package.json, .git, etc.) so all files
 * in the same project share one scope.
 *
 * ## CRITICAL: File registration ordering
 *
 * SLOOP calls `listFiles` immediately when it receives `addConfigurationScope`.
 * If no files are registered in `scopeFiles` at that point, the scope initialises
 * with an empty file list and analysis will hang waiting for files that SLOOP
 * never received.
 *
 * The correct sequence is:
 *   1. Pre-register file DTOs in `scopeFiles` (so `listFiles` can return them)
 *   2. Send `addConfigurationScope` notification to SLOOP
 *   3. Wait for `didChangeAnalysisReadiness` (scope is ready)
 *   4. Call `analyzeFilesAndTrack`
 *
 * Never scan the project directory in `listFiles` — only return the files the
 * caller explicitly asked to analyse. Scanning caused 500+ file responses and
 * multi-minute hangs on real projects.
 *
 * @param filePath  - A file used to detect the project root
 * @param filePaths - All files to analyse (registered so listFiles returns them)
 */
export async function getOrCreateScope(filePath: string, filePaths?: string[]): Promise<string> {
  const projectRoot = findProjectRoot(dirname(filePath));
  const scopeId = scopeMap.get(projectRoot);

  if (scopeId) {
    // Scope exists — register any new files so listFiles returns them
    if (filePaths?.length) {
      const dtos = buildClientFileDtos(filePaths, scopeId, projectRoot);
      const existing = scopeFiles.get(scopeId) || [];
      scopeFiles.set(scopeId, [...existing, ...dtos]);
    }
    return scopeId;
  }

  const hash = createHash('md5').update(projectRoot).digest('hex').substring(0, 8);
  const newScopeId = `scope-${hash}`;

  console.error(`[MCP] Creating new configuration scope: ${newScopeId} for ${projectRoot}`);

  scopeToProjectRoot.set(newScopeId, projectRoot);
  scopeMap.set(projectRoot, newScopeId);

  // Step 1: Pre-register files BEFORE creating scope.
  // SLOOP calls listFiles synchronously during addConfigurationScope — the files
  // must already be in scopeFiles or listFiles returns an empty list and the
  // scope never becomes ready.
  const pathsToRegister = filePaths?.length ? filePaths : [filePath];
  const dtos = buildClientFileDtos(pathsToRegister, newScopeId, projectRoot);
  scopeFiles.set(newScopeId, dtos);

  // Step 2–3: Create scope and wait for readiness
  const sloopBridge = getSloopBridge();
  if (sloopBridge) {
    const readyPromise = sloopBridge.waitForScopeReady(newScopeId);
    sloopBridge.addConfigurationScope(newScopeId, {
      name: `Project: ${projectRoot}`,
    });
    console.error(`[MCP] Waiting for scope ${newScopeId} to become ready...`);
    await readyPromise;
    console.error(`[MCP] Scope ${newScopeId} is ready for analysis`);
  }

  return newScopeId;
}
