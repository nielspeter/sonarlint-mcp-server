import { existsSync, readFileSync, writeFileSync } from "fs";
import { SloopError } from "../errors.js";
import { ensureSloopBridge } from "../utils/sloop.js";
import { getOrCreateScope } from "../utils/scope.js";
import { notifyFileSystemChanged } from "../utils/filesystem.js";
import { transformSloopIssues } from "../utils/transforms.js";

export async function handleApplyAllQuickFixes(args: any) {
  const { filePath } = args as { filePath: string };

  console.error(`[MCP] Applying all quick fixes for ${filePath}`);

  // Validate file exists
  if (!existsSync(filePath)) {
    throw new SloopError(
      `File not found: ${filePath}`,
      `The file ${filePath} does not exist. Please check the path and try again.`,
      false
    );
  }

  // Analyze the file to get all issues with quick fixes
  const bridge = await ensureSloopBridge();
  const scopeId = getOrCreateScope(filePath);
  const rawResult = await bridge.analyzeFilesAndTrack(scopeId, [filePath]);
  const rawIssues = rawResult.rawIssues || [];

  console.error(`[MCP] Found ${rawIssues.length} total issues`);

  // Filter issues that have quick fixes
  const issuesWithQuickFixes = rawIssues.filter((issue: any) => {
    const hasQuickFixes = issue.quickFixes && issue.quickFixes.length > 0;
    if (hasQuickFixes) {
      console.error(`[DEBUG] Issue at line ${issue.textRange?.startLine || issue.startLine}: ${issue.ruleKey} has ${issue.quickFixes.length} quick fixes`);
    }
    return hasQuickFixes;
  });

  console.error(`[MCP] Found ${issuesWithQuickFixes.length} issues with quick fixes`);

  if (issuesWithQuickFixes.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: `ℹ️ **No quick fixes available**\n\nFile: ${filePath}\nTotal issues: ${rawIssues.length}\n\nNone of the issues in this file have automated quick fixes available. All issues must be fixed manually.`,
        },
      ],
    };
  }

  // Sort issues by line number (descending) to avoid line number shifts
  const sortedIssues = [...issuesWithQuickFixes].sort((a, b) => {
    const aLine = a.textRange?.startLine || a.startLine || 0;
    const bLine = b.textRange?.startLine || b.startLine || 0;
    return bLine - aLine; // Descending order
  });

  // Apply each quick fix
  const appliedFixes: Array<{ line: number; rule: string; message: string }> = [];
  const failedFixes: Array<{ line: number; rule: string; error: string }> = [];

  for (const issue of sortedIssues) {
    const line = issue.textRange?.startLine || issue.startLine || 0;
    const rule = issue.ruleKey;
    const quickFix = issue.quickFixes[0]; // Use first available quick fix

    console.error(`[MCP] Applying fix for ${rule} at line ${line}`);

    try {
      // Read current file content
      let fileContent = readFileSync(filePath, 'utf-8');
      const lines = fileContent.split('\n');

      // Apply the quick fix edits
      const fileEdits = quickFix.inputFileEdits || quickFix.fileEdits || [];
      if (fileEdits.length > 0) {
        for (const fileEdit of fileEdits) {
          if (fileEdit.textEdits) {
            // Sort edits in reverse order to maintain line numbers
            const sortedEdits = [...fileEdit.textEdits].sort((a, b) => {
              const aStart = a.range?.startLine || 0;
              const bStart = b.range?.startLine || 0;
              return bStart - aStart;
            });

            for (const edit of sortedEdits) {
              const startLine = (edit.range?.startLine || 1) - 1;
              const startCol = edit.range?.startLineOffset || 0;
              const endLine = (edit.range?.endLine || startLine + 1) - 1;
              const endCol = edit.range?.endLineOffset || lines[endLine]?.length || 0;
              const newText = edit.newText || '';

              if (startLine === endLine) {
                const currentLine = lines[startLine];
                lines[startLine] = currentLine.substring(0, startCol) + newText + currentLine.substring(endCol);
              } else {
                const firstLine = lines[startLine].substring(0, startCol) + newText;
                const lastLine = lines[endLine].substring(endCol);
                lines.splice(startLine, endLine - startLine + 1, firstLine + lastLine);
              }
            }
          }
        }
      }

      // Write back to file
      fileContent = lines.join('\n');
      writeFileSync(filePath, fileContent, 'utf-8');

      appliedFixes.push({
        line,
        rule,
        message: quickFix.message || 'Applied automated fix',
      });

      console.error(`[MCP] Successfully applied fix for ${rule} at line ${line}`);
    } catch (error) {
      console.error(`[MCP] Failed to apply fix for ${rule} at line ${line}:`, error);
      failedFixes.push({
        line,
        rule,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Notify SLOOP about file changes
  console.error(`[Cache] Sending file system update notification...`);
  await notifyFileSystemChanged(filePath, scopeId);
  await new Promise(resolve => setTimeout(resolve, 500));

  // Re-analyze to get remaining issues
  const finalResult = await bridge.analyzeFilesAndTrack(scopeId, [filePath]);
  const remainingIssues = finalResult.rawIssues || [];
  const transformedRemaining = transformSloopIssues(remainingIssues);

  // Format summary
  let summary = `✅ **Quick fixes applied**\n\n`;
  summary += `File: ${filePath}\n`;
  summary += `Applied: ${appliedFixes.length} fixes\n`;
  if (failedFixes.length > 0) {
    summary += `Failed: ${failedFixes.length} fixes\n`;
  }
  summary += `Remaining issues: ${remainingIssues.length}\n\n`;

  if (appliedFixes.length > 0) {
    summary += `**Fixed Issues:**\n`;
    for (const fix of appliedFixes) {
      summary += `- Line ${fix.line}: ${fix.rule} - ${fix.message}\n`;
    }
    summary += `\n`;
  }

  if (failedFixes.length > 0) {
    summary += `**Failed Fixes:**\n`;
    for (const fail of failedFixes) {
      summary += `- Line ${fail.line}: ${fail.rule} - ${fail.error}\n`;
    }
    summary += `\n`;
  }

  if (remainingIssues.length > 0) {
    summary += `**Remaining Issues (require manual fixing):**\n`;
    const groupedBySeverity = transformedRemaining.reduce((acc, issue) => {
      if (!acc[issue.severity]) acc[issue.severity] = [];
      acc[issue.severity].push(issue);
      return acc;
    }, {} as Record<string, typeof transformedRemaining>);

    for (const severity of ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO']) {
      const issues = groupedBySeverity[severity] || [];
      if (issues.length > 0) {
        summary += `\n${severity} (${issues.length}):\n`;
        for (const issue of issues) {
          summary += `- Line ${issue.line}: ${issue.rule} - ${issue.message}\n`;
        }
      }
    }
  } else {
    summary += `🎉 All issues resolved! The file has no remaining code quality issues.\n`;
  }

  return {
    content: [
      {
        type: "text" as const,
        text: summary,
      },
    ],
  };
}
