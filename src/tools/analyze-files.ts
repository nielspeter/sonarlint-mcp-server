import { existsSync } from 'fs';
import { createRequire } from 'module';
import { resolve } from 'path';

// globSync is available in Node 22+ but @types/node doesn't export it yet
const require = createRequire(import.meta.url);
const { globSync } = require('fs') as { globSync: (pattern: string, options?: { cwd?: string }) => string[] };
import { SloopError } from '../errors.js';
import { ensureSloopBridge } from '../utils/sloop.js';
import { getOrCreateScope } from '../utils/scope.js';
import { detectLanguage } from '../utils/language.js';
import { transformSloopIssues } from '../utils/transforms.js';
import { formatBatchAnalysisResult } from '../utils/formatting.js';
import { filterBySeverity } from '../utils/quick-fix.js';
import { batchResults } from '../state.js';
import type { AnalysisIssue, BatchAnalysisResult } from '../types.js';

/**
 * Expand glob patterns and resolve relative paths against basePath.
 * Absolute paths/globs are used as-is; relative ones need basePath.
 */
function expandGlobs(paths: string[], basePath?: string): string[] {
  const result: string[] = [];
  for (const p of paths) {
    const isRelative = !p.startsWith('/');
    if (isRelative && !basePath) {
      throw new SloopError(
        `Relative path requires basePath: ${p}`,
        `Relative paths need a basePath to resolve against. Provide basePath (the project root) or use absolute paths.`,
        false,
      );
    }

    const resolveBase = basePath ?? process.cwd();
    if (p.includes('*') || p.includes('?')) {
      const cwd = isRelative ? resolveBase : process.cwd();
      const matches = globSync(p, { cwd });
      result.push(...matches.map((m: string) => resolve(cwd, m)));
    } else {
      result.push(isRelative ? resolve(resolveBase, p) : p);
    }
  }
  return [...new Set(result)];
}

interface FileResult {
  filePath: string;
  language: string;
  issueCount: number;
  issues: AnalysisIssue[];
}

function resolveAndValidatePaths(rawPaths: string[], basePath?: string): string[] {
  const filePaths = expandGlobs(rawPaths, basePath);

  if (filePaths.length === 0) {
    throw new SloopError(
      'No files matched',
      'No files matched the provided patterns:\n' + rawPaths.map((p) => `- ${p}`).join('\n'),
      false,
    );
  }

  const missingFiles = filePaths.filter((fp) => !existsSync(fp));
  if (missingFiles.length > 0) {
    throw new SloopError(
      `Files not found: ${missingFiles.join(', ')}`,
      'The following files do not exist:\n' + missingFiles.map((f) => `- ${f}`).join('\n'),
      false,
    );
  }

  return filePaths;
}

async function groupByScope(filePaths: string[]): Promise<Map<string, string[]>> {
  const filesByScope = new Map<string, string[]>();
  for (const filePath of filePaths) {
    const scopeId = await getOrCreateScope(filePath, filePaths);
    if (!filesByScope.has(scopeId)) {
      filesByScope.set(scopeId, []);
    }
    filesByScope.get(scopeId)!.push(filePath);
  }
  return filesByScope;
}

function buildSummary(allResults: FileResult[]): BatchAnalysisResult['summary'] {
  const bySeverity = { blocker: 0, critical: 0, major: 0, minor: 0, info: 0 };

  for (const result of allResults) {
    for (const issue of result.issues) {
      const key = issue.severity.toLowerCase() as keyof typeof bySeverity;
      if (key in bySeverity) bySeverity[key]++;
    }
  }

  return {
    totalFiles: allResults.length,
    totalIssues: allResults.reduce((sum, r) => sum + r.issueCount, 0),
    filesWithIssues: allResults.filter((r) => r.issueCount > 0).length,
    bySeverity,
  };
}

export async function handleAnalyzeFiles(args: any) {
  const {
    filePaths: rawPaths,
    basePath,
    minSeverity,
    excludeRules,
  } = args as {
    filePaths: string[];
    basePath?: string;
    groupByFile?: boolean;
    minSeverity?: string;
    excludeRules?: string[];
  };

  if (!Array.isArray(rawPaths) || rawPaths.length === 0) {
    throw new SloopError(
      'No files provided',
      'Please provide at least one file path or glob pattern to analyze.',
      false,
    );
  }

  const filePaths = resolveAndValidatePaths(rawPaths, basePath);
  console.error(`[MCP] Batch analyzing ${filePaths.length} files...`);

  const bridge = await ensureSloopBridge(filePaths[0]);
  const filesByScope = await groupByScope(filePaths);
  const allResults: FileResult[] = [];

  for (const [scopeId, scopeFiles] of filesByScope) {
    console.error(`[MCP] Analyzing ${scopeFiles.length} files in scope ${scopeId}`);

    const rawResult = await bridge.analyzeFilesAndTrack(scopeId, scopeFiles);
    const rawIssues = rawResult.raisedIssues?.length ? rawResult.raisedIssues : rawResult.rawIssues || [];

    const issuesByFile = new Map<string, any[]>();
    for (const issue of rawIssues) {
      const arr = issuesByFile.get(issue.fileUri) || [];
      arr.push(issue);
      issuesByFile.set(issue.fileUri, arr);
    }

    for (const filePath of scopeFiles) {
      let issues = transformSloopIssues(issuesByFile.get(`file://${filePath}`) || []);
      if (minSeverity) issues = filterBySeverity(issues, minSeverity);
      if (excludeRules?.length) issues = issues.filter((i) => !excludeRules.includes(i.rule));

      allResults.push({ filePath, language: detectLanguage(filePath), issueCount: issues.length, issues });
    }
  }

  const batchResult: BatchAnalysisResult = { files: allResults, summary: buildSummary(allResults) };
  batchResults.set(`batch-${Date.now()}`, batchResult);

  return {
    content: [{ type: 'text' as const, text: formatBatchAnalysisResult(batchResult) }],
  };
}
