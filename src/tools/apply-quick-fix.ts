import { existsSync, readFileSync, writeFileSync } from 'fs';
import { SloopError } from '../errors.js';
import { ensureSloopBridge } from '../utils/sloop.js';
import { getOrCreateScope } from '../utils/scope.js';
import { notifyFileSystemChanged } from '../utils/filesystem.js';
import { applyTextEdits } from '../utils/quick-fix.js';

export async function handleApplyQuickFix(args: any) {
  const { filePath, line, rule } = args as { filePath: string; line: number; rule: string };

  console.error(`[MCP] Applying quick fix for ${rule} at ${filePath}:${line}`);

  if (!existsSync(filePath)) {
    throw new SloopError(
      `File not found: ${filePath}`,
      `The file ${filePath} does not exist. Please check the path and try again.`,
      false,
    );
  }

  const bridge = await ensureSloopBridge(filePath);
  const scopeId = await getOrCreateScope(filePath);
  const rawResult = await bridge.analyzeFilesAndTrack(scopeId, [filePath]);
  const rawIssues = rawResult.raisedIssues?.length ? rawResult.raisedIssues : rawResult.rawIssues || [];

  const targetIssue = rawIssues.find((issue: any) => {
    const issueLine = issue.textRange?.startLine || issue.startLine || 0;
    return issueLine === line && issue.ruleKey === rule;
  });

  if (!targetIssue) {
    throw new SloopError(
      `Issue not found`,
      `No issue found at line ${line} with rule ${rule}. The file may have changed since the last analysis.`,
      false,
    );
  }

  if (!targetIssue.quickFixes || targetIssue.quickFixes.length === 0) {
    throw new SloopError(
      `No quick fix available`,
      `The issue at line ${line} (${rule}) does not have an automated quick fix available.`,
      false,
    );
  }

  const quickFix = targetIssue.quickFixes[0];
  const lines = readFileSync(filePath, 'utf-8').split('\n');
  applyTextEdits(lines, quickFix);
  writeFileSync(filePath, lines.join('\n'), 'utf-8');

  await notifyFileSystemChanged(filePath, scopeId);
  await new Promise((resolve) => setTimeout(resolve, 500));

  return {
    content: [
      {
        type: 'text' as const,
        text: `✅ **Quick fix applied successfully**\n\nFile: ${filePath}\nLine: ${line}\nRule: ${rule}\nFix: ${quickFix.message || 'Applied automated fix'}\n\nThe file has been modified. You may want to re-analyze it to confirm the issue is resolved.`,
      },
    ],
  };
}
