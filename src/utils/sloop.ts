/**
 * SLOOP bridge initialization and management
 */

import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { SloopBridge } from '../sloop-bridge.js';
import { setSloopBridge, getSloopBridge } from '../state.js';
import { SloopError } from '../errors.js';
import { findProjectRoot } from './scope.js';
import { loadRuleConfig, type StandaloneRuleConfig } from './config.js';

// Get package root directory (where sonarlint-backend is installed)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const PACKAGE_ROOT = join(__dirname, '../..'); // Go up from dist/utils/ to package root

/** Track which project root's config is currently applied */
let activeProjectRoot: string | undefined;

/** Log rule config entries */
function logRuleConfig(config: Record<string, StandaloneRuleConfig>): void {
  for (const [ruleKey, entry] of Object.entries(config)) {
    const params = Object.entries(entry.paramValueByKey)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    console.error(`[MCP]   Rule ${ruleKey}: active=${String(entry.isActive)}${params ? `, ${params}` : ''}`);
  }
}

/**
 * Load and apply rule config for a project root.
 * Sends updateStandaloneRulesConfiguration notification if config changed.
 */
async function applyProjectConfig(bridge: SloopBridge, filePath: string): Promise<void> {
  const projectRoot = findProjectRoot(dirname(filePath));
  if (projectRoot === activeProjectRoot) return;

  activeProjectRoot = projectRoot;
  const config = loadRuleConfig(projectRoot);

  // Always send the update — even empty config resets to defaults
  await bridge.updateStandaloneRulesConfiguration(config);

  if (Object.keys(config).length > 0) {
    console.error(`[MCP] Applied rule config from ${projectRoot} (${Object.keys(config).length} rules)`);
    logRuleConfig(config);
  } else {
    console.error(`[MCP] No sonarlint.json in ${projectRoot} — using default rules`);
  }
}

/**
 * Ensure SLOOP bridge is initialized.
 * Pass a filePath so the bridge can load rule config from the project's sonarlint.json.
 * Config is re-applied whenever a file from a different project root is analyzed.
 */
export async function ensureSloopBridge(filePath?: string): Promise<SloopBridge> {
  const existing = getSloopBridge();
  if (existing) {
    // Bridge exists — check if we need to apply config for a new project
    if (filePath) {
      await applyProjectConfig(existing, filePath);
    }
    return existing;
  }

  const t0 = Date.now();
  const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

  console.error('[MCP] Initializing SLOOP bridge...');

  // Check if plugins are downloaded
  const pluginsDir = join(PACKAGE_ROOT, 'sonarlint-backend', 'plugins');
  if (!existsSync(pluginsDir)) {
    throw new SloopError(
      'Backend not found',
      'SonarLint backend not installed. The postinstall script may have failed. Try reinstalling: npm install -g @nielspeter/sonarlint-mcp-server',
      false,
    );
  }

  // Load rule config from project root if a file path is available
  let standaloneRuleConfig: Record<string, StandaloneRuleConfig> | undefined;
  if (filePath) {
    const projectRoot = findProjectRoot(dirname(filePath));
    activeProjectRoot = projectRoot;
    console.error(`[MCP] +${elapsed()} Project root: ${projectRoot}`);
    standaloneRuleConfig = loadRuleConfig(projectRoot);
    if (standaloneRuleConfig && Object.keys(standaloneRuleConfig).length > 0) {
      logRuleConfig(standaloneRuleConfig);
    } else {
      console.error('[MCP]   No sonarlint.json config found');
    }
  } else {
    console.error(`[MCP] +${elapsed()} No file path provided — skipping config lookup`);
  }

  try {
    console.error(`[MCP] +${elapsed()} Creating bridge...`);
    const bridge = new SloopBridge(PACKAGE_ROOT, { standaloneRuleConfig });
    console.error(`[MCP] +${elapsed()} Connecting (starts Java + sends initialize)...`);
    await bridge.connect();

    // Also send as notification — SLOOP may only honor parameter overrides via this path
    if (standaloneRuleConfig && Object.keys(standaloneRuleConfig).length > 0) {
      await bridge.updateStandaloneRulesConfiguration(standaloneRuleConfig);
      console.error(
        `[MCP] +${elapsed()} Applied rule config via notification (${Object.keys(standaloneRuleConfig).length} rules)`,
      );
    }

    setSloopBridge(bridge);
    console.error(`[MCP] +${elapsed()} SLOOP bridge initialized successfully`);
    return bridge;
  } catch (error) {
    throw new SloopError(
      `Failed to initialize SLOOP: ${error}`,
      'Failed to start SonarLint backend. Please check that Java is installed and try again.',
      true,
    );
  }
}
