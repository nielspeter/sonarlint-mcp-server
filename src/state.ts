/**
 * Shared state management for the SonarLint MCP Server
 */

import { SloopBridge } from "./sloop-bridge.js";
import type { AnalysisResult, BatchAnalysisResult } from "./types.js";

// Global SLOOP bridge instance (lazy initialized)
export let sloopBridge: SloopBridge | null = null;

// Project root -> scopeId mapping
export const scopeMap = new Map<string, string>();

// Session storage for analysis results (for MCP resources)
export const sessionResults = new Map<string, AnalysisResult>();
export const batchResults = new Map<string, BatchAnalysisResult>();

// Server start time for uptime tracking
export const serverStartTime = Date.now();

/**
 * Set the SLOOP bridge instance
 */
export function setSloopBridge(bridge: SloopBridge): void {
  sloopBridge = bridge;
}

/**
 * Get the SLOOP bridge instance
 */
export function getSloopBridge(): SloopBridge | null {
  return sloopBridge;
}
