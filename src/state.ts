/**
 * Shared state management for the SonarLint MCP Server
 */

import { SloopBridge } from "./sloop-bridge.js";
import type { AnalysisResult, BatchAnalysisResult } from "./types.js";

// Global SLOOP bridge instance (lazy initialized, accessed via getter/setter)
let sloopBridge: SloopBridge | null = null;

// Project root -> scopeId mapping
export const scopeMap = new Map<string, string>();

// Reverse mapping: scopeId -> projectRoot (used by SLOOP callbacks like listFiles, getBaseDir)
export const scopeToProjectRoot = new Map<string, string>();

// scopeId -> registered file DTOs (so listFiles returns only files we care about)
export const scopeFiles = new Map<string, any[]>();

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
