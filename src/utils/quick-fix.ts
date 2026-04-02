/**
 * Shared logic for applying SLOOP quick-fix text edits to file content.
 */

/**
 * Apply a SLOOP quick fix's text edits to an array of lines (mutates in place).
 */
export function applyTextEdits(lines: string[], quickFix: any): void {
  const fileEdits = quickFix.inputFileEdits || quickFix.fileEdits || [];
  for (const fileEdit of fileEdits) {
    if (!fileEdit.textEdits) continue;

    // Sort edits in reverse order to maintain line numbers
    const sortedEdits = [...fileEdit.textEdits].sort((a: any, b: any) => {
      return (b.range?.startLine || 0) - (a.range?.startLine || 0);
    });

    for (const edit of sortedEdits) {
      const startLine = (edit.range?.startLine || 1) - 1;
      const startCol = edit.range?.startLineOffset || 0;
      const endLine = (edit.range?.endLine || startLine + 1) - 1;
      const endCol = edit.range?.endLineOffset || lines[endLine]?.length || 0;
      const newText = edit.newText || '';

      if (startLine === endLine) {
        const line = lines[startLine];
        lines[startLine] = line.substring(0, startCol) + newText + line.substring(endCol);
      } else {
        const firstLine = lines[startLine].substring(0, startCol) + newText;
        const lastLine = lines[endLine].substring(endCol);
        lines.splice(startLine, endLine - startLine + 1, firstLine + lastLine);
      }
    }
  }
}

const SEVERITY_ORDER: Record<string, number> = {
  INFO: 0,
  MINOR: 1,
  MAJOR: 2,
  CRITICAL: 3,
  BLOCKER: 4,
};

/**
 * Filter issues by minimum severity level.
 */
export function filterBySeverity<T extends { severity: string }>(issues: T[], minSeverity: string): T[] {
  const minLevel = SEVERITY_ORDER[minSeverity] ?? 0;
  return issues.filter((issue) => (SEVERITY_ORDER[issue.severity] ?? 0) >= minLevel);
}
