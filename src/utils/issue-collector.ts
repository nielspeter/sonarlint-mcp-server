/**
 * Collects issues and hotspots delivered via SLOOP raiseIssues/raiseHotspots notifications.
 *
 * SLOOP delivers analysis results asynchronously via client notifications, not in the
 * analyzeFilesAndTrack response. This collector accumulates them per analysis ID.
 */
export class IssueCollector {
  private readonly issues = new Map<string, any[]>();
  private readonly hotspots = new Map<string, any[]>();

  /**
   * Add issues from a raiseIssues notification.
   * Issues are grouped by fileUri in the notification; we flatten and tag each with its fileUri.
   */
  addIssues(analysisId: string, issuesByFileUri: Record<string, any[]>): void {
    if (!this.issues.has(analysisId)) {
      this.issues.set(analysisId, []);
    }
    const bucket = this.issues.get(analysisId)!;
    for (const [fileUri, fileIssues] of Object.entries(issuesByFileUri)) {
      for (const issue of fileIssues) {
        bucket.push({ ...issue, fileUri });
      }
    }
  }

  /**
   * Add hotspots from a raiseHotspots notification.
   */
  addHotspots(analysisId: string, hotspotsByFileUri: Record<string, any[]>): void {
    if (!this.hotspots.has(analysisId)) {
      this.hotspots.set(analysisId, []);
    }
    const bucket = this.hotspots.get(analysisId)!;
    for (const [fileUri, fileHotspots] of Object.entries(hotspotsByFileUri)) {
      for (const hotspot of fileHotspots) {
        bucket.push({ ...hotspot, fileUri });
      }
    }
  }

  /**
   * Get all collected issues for an analysis and clear them.
   */
  getAndClear(analysisId: string): any[] {
    const result = this.issues.get(analysisId) || [];
    this.issues.delete(analysisId);
    return result;
  }

  /**
   * Get all collected hotspots for an analysis and clear them.
   */
  getHotspotsAndClear(analysisId: string): any[] {
    const result = this.hotspots.get(analysisId) || [];
    this.hotspots.delete(analysisId);
    return result;
  }
}
