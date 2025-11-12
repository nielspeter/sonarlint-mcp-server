/**
 * MCP resource registration for session and batch analysis results
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { basename } from "path";
import { createHash } from "crypto";
import { sessionResults, batchResults } from "../state.js";

/**
 * Get all session resources (both session and batch analysis results)
 */
export function getSessionResources(): Array<{ uri: string; name: string; description: string; mimeType: string }> {
  const resources = [];

  for (const [filePath, result] of sessionResults) {
    const resourceId = `analysis-${createHash('md5').update(filePath).digest('hex').substring(0, 8)}`;
    resources.push({
      uri: `sonarlint://session/${resourceId}`,
      name: `Analysis: ${basename(filePath)}`,
      description: `${result.summary.total} issues found`,
      mimeType: "application/json",
    });
  }

  for (const [batchId, result] of batchResults) {
    resources.push({
      uri: `sonarlint://batch/${batchId}`,
      name: `Batch Analysis: ${result.summary.totalFiles} files`,
      description: `${result.summary.totalIssues} total issues`,
      mimeType: "application/json",
    });
  }

  return resources;
}

/**
 * Register MCP resources for analysis results
 */
export function registerResources(server: McpServer): void {
  // Register a dynamic resource template for session results
  server.registerResource(
    'session-analysis',
    new ResourceTemplate('sonarlint://session/{resourceId}', {
      list: () => ({
        resources: getSessionResources().filter(r => r.uri.startsWith('sonarlint://session/'))
      })
    }),
    {
      title: 'SonarLint Session Analysis',
      description: 'Analysis results from the current session',
      mimeType: 'application/json'
    },
    async (uri, { resourceId }) => {
      // Find matching result
      for (const [filePath, result] of sessionResults) {
        const fileResourceId = createHash('md5').update(filePath).digest('hex').substring(0, 8);
        if (fileResourceId === String(resourceId)) {
          return {
            contents: [{
              uri: uri.href,
              mimeType: "application/json" as const,
              text: JSON.stringify(result, null, 2),
            }],
          };
        }
      }
      throw new Error(`Session resource not found: ${resourceId}`);
    }
  );

  // Register a dynamic resource template for batch results
  server.registerResource(
    'batch-analysis',
    new ResourceTemplate('sonarlint://batch/{batchId}', {
      list: () => ({
        resources: getSessionResources().filter(r => r.uri.startsWith('sonarlint://batch/'))
      })
    }),
    {
      title: 'SonarLint Batch Analysis',
      description: 'Batch analysis results',
      mimeType: 'application/json'
    },
    async (uri, { batchId }) => {
      const result = batchResults.get(String(batchId));

      if (result) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: "application/json" as const,
            text: JSON.stringify(result, null, 2),
          }],
        };
      }

      throw new Error(`Batch resource not found: ${batchId}`);
    }
  );
}
