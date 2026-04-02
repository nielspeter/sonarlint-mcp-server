/**
 * Load and parse sonarlint.json rule configuration
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** User-facing format in sonarlint.json */
interface SonarlintRuleEntry {
  level?: 'on' | 'off';
  parameters?: Record<string, string>;
}

interface SonarlintConfig {
  rules?: Record<string, SonarlintRuleEntry>;
}

/** SLOOP internal format (matches StandaloneRuleConfigDto) */
export interface StandaloneRuleConfig {
  isActive: boolean;
  paramValueByKey: Record<string, string>;
}

/**
 * Find the config file in a project root.
 * Primary: sonarlint.json, Fallback: .sonarlint/settings.json
 */
export function findConfigFile(projectRoot: string): string | null {
  const primary = join(projectRoot, 'sonarlint.json');
  if (existsSync(primary)) return primary;

  const fallback = join(projectRoot, '.sonarlint', 'settings.json');
  if (existsSync(fallback)) return fallback;

  return null;
}

/**
 * Transform user-facing rule config to SLOOP's standaloneRuleConfigByKey format.
 */
export function transformRuleConfig(config: SonarlintConfig): Record<string, StandaloneRuleConfig> {
  const result: Record<string, StandaloneRuleConfig> = {};

  if (!config.rules || typeof config.rules !== 'object') return result;

  for (const [ruleKey, entry] of Object.entries(config.rules)) {
    result[ruleKey] = {
      isActive: entry.level !== 'off',
      paramValueByKey: entry.parameters ?? {},
    };
  }

  return result;
}

/**
 * Load rule configuration from a project root.
 * Returns empty config if no file found or on parse error (never throws).
 */
export function loadRuleConfig(projectRoot: string): Record<string, StandaloneRuleConfig> {
  const configPath = findConfigFile(projectRoot);
  if (!configPath) return {};

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as SonarlintConfig;
    const ruleConfig = transformRuleConfig(parsed);
    console.error(`[MCP] Loaded rule config from ${configPath} (${Object.keys(ruleConfig).length} rules)`);
    return ruleConfig;
  } catch (error) {
    console.error(`[MCP] Warning: failed to parse ${configPath}: ${error}`);
    return {};
  }
}
