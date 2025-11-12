import { existsSync, writeFileSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { SloopError } from "../errors.js";
import { ensureSloopBridge } from "../utils/sloop.js";
import { getOrCreateScope } from "../utils/scope.js";
import { transformSloopIssues, createSummary } from "../utils/transforms.js";
import { formatAnalysisResult } from "../utils/formatting.js";
import type { AnalysisResult } from "../types.js";

export async function handleAnalyzeContent(args: any) {
  const { content, language, fileName } = args as { content: string; language: string; fileName?: string };

  if (!content || content.trim().length === 0) {
    throw new SloopError(
      "Empty content",
      "Please provide non-empty content to analyze.",
      false
    );
  }

  // Generate filename with appropriate extension
  const languageExtMap: Record<string, string> = {
    'javascript': '.js',
    'typescript': '.ts',
    'python': '.py',
    'java': '.java',
    'go': '.go',
    'php': '.php',
    'ruby': '.rb',
  };

  const ext = languageExtMap[language] || '.txt';
  const tempFileName = fileName || `.sonarlint-tmp-${Date.now()}${ext}`;
  // Create temp file in project root so SLOOP's listFiles can find it
  const tempFilePath = join(process.cwd(), tempFileName);

  console.error(`[MCP] Analyzing content as ${language}, temp file: ${tempFilePath}`);

  try {
    // Ensure temp directory exists
    const tempDir = dirname(tempFilePath);
    if (!existsSync(tempDir)) {
      const { mkdirSync } = await import('fs');
      mkdirSync(tempDir, { recursive: true });
    }

    // Write content to temp file
    writeFileSync(tempFilePath, content, 'utf-8');

    // Ensure SLOOP is initialized
    const bridge = await ensureSloopBridge();

    // Get or create scope
    const scopeId = getOrCreateScope(tempFilePath);

    // Analyze the temp file
    const rawResult = await bridge.analyzeFilesAndTrack(scopeId, [tempFilePath]);

    // Extract issues from raw result
    const rawIssues = rawResult.rawIssues || [];
    console.error(`[MCP] Found ${rawIssues.length} raw issues in content`);

    // Transform to simplified format
    const issues = transformSloopIssues(rawIssues);

    // Create result
    const result: AnalysisResult = {
      filePath: fileName || 'content',
      language,
      issues,
      summary: createSummary(issues, 265),
    };

    // Format for display
    const formattedResult = formatAnalysisResult(result);

    return {
      content: [
        {
          type: "text" as const,
          text: `${formattedResult}\n\n---\n*Note: Analyzed unsaved content*`,
        },
      ],
    };
  } finally {
    // Clean up temp file
    try {
      if (existsSync(tempFilePath)) {
        unlinkSync(tempFilePath);
      }
    } catch (cleanupError) {
      console.error(`[MCP] Failed to clean up temp file: ${cleanupError}`);
    }
  }
}
