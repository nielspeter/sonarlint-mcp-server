/**
 * SLOOP bridge initialization and management
 */

import { join, dirname } from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { SloopBridge } from "../sloop-bridge.js";
import { setSloopBridge, getSloopBridge } from "../state.js";
import { SloopError } from "../errors.js";

// Get package root directory (where sonarlint-backend is installed)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const PACKAGE_ROOT = join(__dirname, '../..');  // Go up from dist/utils/ to package root

/**
 * Ensure SLOOP bridge is initialized
 */
export async function ensureSloopBridge(): Promise<SloopBridge> {
  const existing = getSloopBridge();
  if (existing) {
    return existing;
  }

  console.error("[MCP] Initializing SLOOP bridge...");

  // Check if plugins are downloaded
  const pluginsDir = join(PACKAGE_ROOT, "sonarlint-backend", "plugins");
  if (!existsSync(pluginsDir)) {
    throw new SloopError(
      "Backend not found",
      "SonarLint backend not installed. The postinstall script may have failed. Try reinstalling: npm install -g @nielspeter/sonarlint-mcp-server",
      false
    );
  }

  try {
    const bridge = new SloopBridge(PACKAGE_ROOT);
    await bridge.connect();
    setSloopBridge(bridge);
    console.error("[MCP] SLOOP bridge initialized successfully");
    return bridge;
  } catch (error) {
    throw new SloopError(
      `Failed to initialize SLOOP: ${error}`,
      "Failed to start SonarLint backend. Please check that Java is installed and try again.",
      true
    );
  }
}
