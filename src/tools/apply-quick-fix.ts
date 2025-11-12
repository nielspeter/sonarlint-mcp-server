import { existsSync, readFileSync, writeFileSync } from "fs";
import { SloopError } from "../errors.js";
import { ensureSloopBridge } from "../utils/sloop.js";
import { getOrCreateScope } from "../utils/scope.js";
import { notifyFileSystemChanged } from "../utils/filesystem.js";

export async function handleApplyQuickFix(args: any) {
  const { filePath, line, rule } = args as { filePath: string; line: number; rule: string };

  console.error(`[MCP] Applying quick fix for ${rule} at ${filePath}:${line}`);

  // Validate file exists
  if (!existsSync(filePath)) {
    throw new SloopError(
      `File not found: ${filePath}`,
      `The file ${filePath} does not exist. Please check the path and try again.`,
      false
    );
  }

  // Re-analyze the file to get current issues with quick fixes
  const bridge = await ensureSloopBridge();
  const scopeId = getOrCreateScope(filePath);
  const rawResult = await bridge.analyzeFilesAndTrack(scopeId, [filePath]);
  const rawIssues = rawResult.rawIssues || [];

  // Find the issue at the specified line with the specified rule
  const targetIssue = rawIssues.find((issue: any) => {
    const issueLine = issue.textRange?.startLine || issue.startLine || 0;
    return issueLine === line && issue.ruleKey === rule;
  });

  if (!targetIssue) {
    throw new SloopError(
      `Issue not found`,
      `No issue found at line ${line} with rule ${rule}. The file may have changed since the last analysis.`,
      false
    );
  }

  if (!targetIssue.quickFixes || targetIssue.quickFixes.length === 0) {
    throw new SloopError(
      `No quick fix available`,
      `The issue at line ${line} (${rule}) does not have an automated quick fix available.`,
      false
    );
  }

  // Apply the first quick fix
  const quickFix = targetIssue.quickFixes[0];
  console.error('[DEBUG] Quick fix structure:', JSON.stringify(quickFix, null, 2).substring(0, 1000));

  // Write debug info to a file we can read
  writeFileSync('/tmp/quickfix-debug.json', JSON.stringify({
    targetIssue: {
      ruleKey: targetIssue.ruleKey,
      textRange: targetIssue.textRange,
      quickFixes: targetIssue.quickFixes
    },
    quickFix: quickFix
  }, null, 2), 'utf-8');

  let fileContent = readFileSync(filePath, 'utf-8');
  const lines = fileContent.split('\n');

  // Apply each edit in the quick fix
  const fileEdits = quickFix.inputFileEdits || quickFix.fileEdits || [];
  if (fileEdits.length > 0) {
    console.error(`[DEBUG] Found ${fileEdits.length} file edits`);
    for (const fileEdit of fileEdits) {
      if (fileEdit.textEdits) {
        console.error(`[DEBUG] Found ${fileEdit.textEdits.length} text edits`);
        // Sort edits in reverse order to maintain line numbers
        const sortedEdits = [...fileEdit.textEdits].sort((a, b) => {
          const aStart = a.range?.startLine || 0;
          const bStart = b.range?.startLine || 0;
          return bStart - aStart; // Reverse order
        });

        for (const edit of sortedEdits) {
          const startLine = (edit.range?.startLine || 1) - 1; // Convert to 0-based
          const startCol = edit.range?.startLineOffset || 0;
          const endLine = (edit.range?.endLine || startLine + 1) - 1;
          const endCol = edit.range?.endLineOffset || lines[endLine]?.length || 0;
          const newText = edit.newText || '';

          console.error(`[DEBUG] Applying edit at line ${startLine + 1}:${startCol} to ${endLine + 1}:${endCol}`);
          console.error(`[DEBUG] Old text: "${lines[startLine].substring(startCol, endCol)}"`);
          console.error(`[DEBUG] New text: "${newText}"`);

          // Apply the edit
          if (startLine === endLine) {
            const line = lines[startLine];
            lines[startLine] = line.substring(0, startCol) + newText + line.substring(endCol);
            console.error(`[DEBUG] Result: "${lines[startLine]}"`);
          } else {
            // Multi-line edit
            const firstLine = lines[startLine].substring(0, startCol) + newText;
            const lastLine = lines[endLine].substring(endCol);
            lines.splice(startLine, endLine - startLine + 1, firstLine + lastLine);
          }
        }
      }
    }
  } else {
    console.error('[DEBUG] No fileEdits found in quick fix!');
  }

  // Write the modified content back
  fileContent = lines.join('\n');
  console.error(`[DEBUG] About to write file: ${filePath}`);
  console.error(`[DEBUG] File content length: ${fileContent.length} chars`);
  console.error(`[DEBUG] First 200 chars: ${fileContent.substring(0, 200)}`);

  try {
    writeFileSync(filePath, fileContent, 'utf-8');
    console.error(`[DEBUG] File written successfully`);
  } catch (err) {
    console.error(`[DEBUG] Error writing file:`, err);
    throw err;
  }

  // Notify SLOOP that file system was updated (proper cache invalidation)
  console.error(`[Cache] Sending file system update notification...`);
  await notifyFileSystemChanged(filePath, scopeId);

  console.error(`[Cache] File system update notification sent, waiting for SLOOP to process...`);

  // CRITICAL: Give SLOOP time to process the file system notification
  // Without this delay, the next analysis request may arrive before SLOOP updates its registry
  await new Promise(resolve => setTimeout(resolve, 500));

  return {
    content: [
      {
        type: "text" as const,
        text: `✅ **Quick fix applied successfully**\n\nFile: ${filePath}\nLine: ${line}\nRule: ${rule}\nFix: ${quickFix.message || 'Applied automated fix'}\n\nThe file has been modified. You may want to re-analyze it to confirm the issue is resolved.`,
      },
    ],
  };
}
