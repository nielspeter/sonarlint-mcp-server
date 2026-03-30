import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { sessionResults, batchResults, sloopBridge, serverStartTime } from "../state.js";

// Get package root directory (where sonarlint-backend is installed)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = join(__dirname, '..', '..');  // Go up from dist/tools/ to package root

// Read version from package.json
function getPackageVersion(): string {
  try {
    const packageJson = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf-8"));
    return packageJson.version;
  } catch {
    return "unknown";
  }
}

export async function handleHealthCheck() {
  console.error(`[MCP] Running health check...`);

  const uptimeMs = Date.now() - serverStartTime;
  const uptimeSeconds = Math.floor(uptimeMs / 1000);
  const uptimeMinutes = Math.floor(uptimeSeconds / 60);
  const uptimeHours = Math.floor(uptimeMinutes / 60);

  const memoryUsage = process.memoryUsage();
  const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);

  // Check SLOOP status - reflect actual backend state
  const sloopStatus = sloopBridge ? "running" : "not started (starts on first analysis)";

  // Get plugin information
  const pluginsDir = join(PACKAGE_ROOT, "sonarlint-backend", "plugins");
  const pluginsExist = existsSync(pluginsDir);

  let plugins = [];
  if (pluginsExist) {
    const files = readdirSync(pluginsDir);
    const jarFiles = files.filter(f => f.endsWith('.jar'));

    for (const jarFile of jarFiles) {
      // Parse plugin name and version from filename
      const match = jarFile.match(/sonar-(\w+)-plugin-([\d.]+)\.jar/);
      if (match) {
        plugins.push({
          name: match[1].charAt(0).toUpperCase() + match[1].slice(1),
          version: match[2],
          status: "active",
        });
      }
    }
  }

  // Cache statistics
  const cacheStats = {
    sessionResults: sessionResults.size,
    batchResults: batchResults.size,
  };

  const healthStatus = {
    status: pluginsExist ? (sloopBridge ? "healthy" : "ready") : "degraded",
    version: getPackageVersion(),
    uptime: {
      milliseconds: uptimeMs,
      seconds: uptimeSeconds,
      minutes: uptimeMinutes,
      hours: uptimeHours,
      formatted: `${uptimeHours}h ${uptimeMinutes % 60}m ${uptimeSeconds % 60}s`,
    },
    backend: {
      status: sloopStatus,
      pluginsDirectory: pluginsExist ? "found" : "missing",
    },
    plugins,
    memory: {
      heapUsed: `${memoryMB}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
    },
    cache: cacheStats,
    tools: ["check_quality", "check_files", "check_code", "list_rules", "fix_issue", "fix_all_issues", "health_check"],
    features: [
      "Session storage for multi-turn conversations",
      "Batch analysis",
      "Content analysis (unsaved files)",
      "MCP resources",
      "Quick fixes support",
    ],
  };

  let output = `# SonarLint MCP Server Health Check\n\n`;
  const statusEmoji = healthStatus.status === "healthy" ? "✅ Healthy" : healthStatus.status === "ready" ? "🟡 Ready" : "⚠️ Degraded";
  output += `**Status**: ${statusEmoji}\n`;
  output += `**Version**: ${healthStatus.version}\n`;
  output += `**Uptime**: ${healthStatus.uptime.formatted}\n\n`;

  output += `## Backend Status\n\n`;
  output += `- **SLOOP Backend**: ${healthStatus.backend.status}\n`;
  output += `- **Plugins Directory**: ${healthStatus.backend.pluginsDirectory}\n\n`;

  if (plugins.length > 0) {
    output += `## Active Plugins\n\n`;
    for (const plugin of plugins) {
      output += `- **${plugin.name}**: v${plugin.version} (${plugin.status})\n`;
    }
    output += `\n`;
  }

  output += `## Memory Usage\n\n`;
  output += `- **Heap Used**: ${healthStatus.memory.heapUsed}\n`;
  output += `- **Heap Total**: ${healthStatus.memory.heapTotal}\n`;
  output += `- **RSS**: ${healthStatus.memory.rss}\n\n`;

  output += `## Cache Statistics\n\n`;
  output += `- **Session Results**: ${healthStatus.cache.sessionResults} stored\n`;
  output += `- **Batch Results**: ${healthStatus.cache.batchResults} stored\n\n`;

  output += `## Available Tools\n\n`;
  for (const tool of healthStatus.tools) {
    output += `- ${tool}\n`;
  }
  output += `\n`;

  output += `## Features\n\n`;
  for (const feature of healthStatus.features) {
    output += `- ${feature}\n`;
  }

  return {
    content: [
      {
        type: "text" as const,
        text: output,
      },
    ],
  };
}
