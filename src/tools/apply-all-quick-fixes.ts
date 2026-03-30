import { existsSync, readFileSync, writeFileSync } from "fs";
import { SloopError } from "../errors.js";
import { ensureSloopBridge } from "../utils/sloop.js";
import { getOrCreateScope } from "../utils/scope.js";
import { notifyFileSystemChanged } from "../utils/filesystem.js";
import { transformSloopIssues } from "../utils/transforms.js";
import { applyTextEdits } from "../utils/quick-fix.js";

interface FixResult { line: number; rule: string; message: string }
interface FixFailure { line: number; rule: string; error: string }

function applyFixesToFile(filePath: string, issues: any[]): { applied: FixResult[]; failed: FixFailure[] } {
  const applied: FixResult[] = [];
  const failed: FixFailure[] = [];

  // Sort descending by line to avoid line number shifts
  const sorted = [...issues].sort((a, b) => {
    return (b.textRange?.startLine || b.startLine || 0) - (a.textRange?.startLine || a.startLine || 0);
  });

  for (const issue of sorted) {
    const line = issue.textRange?.startLine || issue.startLine || 0;
    const rule = issue.ruleKey;
    const quickFix = issue.quickFixes[0];

    try {
      const lines = readFileSync(filePath, 'utf-8').split('\n');
      applyTextEdits(lines, quickFix);
      writeFileSync(filePath, lines.join('\n'), 'utf-8');
      applied.push({ line, rule, message: quickFix.message || 'Applied automated fix' });
    } catch (error) {
      failed.push({ line, rule, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { applied, failed };
}

function formatFixList(label: string, items: Array<{ line: number; rule: string; message?: string; error?: string }>): string {
  if (items.length === 0) return '';
  const lines = items.map(i => `- Line ${i.line}: ${i.rule} - ${i.message || i.error}`);
  return `**${label}:**\n${lines.join('\n')}\n\n`;
}

function formatRemainingIssues(remaining: ReturnType<typeof transformSloopIssues>): string {
  if (remaining.length === 0) return `🎉 All issues resolved! The file has no remaining code quality issues.\n`;

  let out = `**Remaining Issues (require manual fixing):**\n`;
  for (const severity of ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO']) {
    const issues = remaining.filter(i => i.severity === severity);
    if (issues.length === 0) continue;
    out += `\n${severity} (${issues.length}):\n`;
    for (const issue of issues) out += `- Line ${issue.line}: ${issue.rule} - ${issue.message}\n`;
  }
  return out;
}

function formatSummary(
  filePath: string,
  applied: FixResult[],
  failed: FixFailure[],
  remaining: ReturnType<typeof transformSloopIssues>,
): string {
  let summary = `✅ **Quick fixes applied**\n\nFile: ${filePath}\nApplied: ${applied.length} fixes\n`;
  if (failed.length > 0) summary += `Failed: ${failed.length} fixes\n`;
  summary += `Remaining issues: ${remaining.length}\n\n`;
  summary += formatFixList('Fixed Issues', applied);
  summary += formatFixList('Failed Fixes', failed);
  summary += formatRemainingIssues(remaining);
  return summary;
}

export async function handleApplyAllQuickFixes(args: any) {
  const { filePath } = args as { filePath: string };

  if (!existsSync(filePath)) {
    throw new SloopError(
      `File not found: ${filePath}`,
      `The file ${filePath} does not exist. Please check the path and try again.`,
      false
    );
  }

  const bridge = await ensureSloopBridge();
  const scopeId = await getOrCreateScope(filePath);
  const rawResult = await bridge.analyzeFilesAndTrack(scopeId, [filePath]);
  const rawIssues = rawResult.raisedIssues?.length ? rawResult.raisedIssues : (rawResult.rawIssues || []);

  const fixableIssues = rawIssues.filter((issue: any) => issue.quickFixes?.length > 0);

  if (fixableIssues.length === 0) {
    return {
      content: [{
        type: "text" as const,
        text: `ℹ️ **No quick fixes available**\n\nFile: ${filePath}\nTotal issues: ${rawIssues.length}\n\nNone of the issues in this file have automated quick fixes available. All issues must be fixed manually.`,
      }],
    };
  }

  const { applied, failed } = applyFixesToFile(filePath, fixableIssues);

  await notifyFileSystemChanged(filePath, scopeId);
  await new Promise(resolve => setTimeout(resolve, 500));

  const finalResult = await bridge.analyzeFilesAndTrack(scopeId, [filePath]);
  const remainingRaw = finalResult.raisedIssues?.length ? finalResult.raisedIssues : (finalResult.rawIssues || []);
  const remaining = transformSloopIssues(remainingRaw);

  return {
    content: [{
      type: "text" as const,
      text: formatSummary(filePath, applied, failed, remaining),
    }],
  };
}
