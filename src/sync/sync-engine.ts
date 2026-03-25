/**
 * Orchestrates push/pull sync operations between local BMAD .md artifacts
 * and Jira/Confluence Cloud.
 */

import type { JiraClient } from '../clients/jira-client.js';
import type { ConfluenceClient } from '../clients/confluence-client.js';
import {
  type LocalArtifact,
  extractJiraFields,
  mapLocalStatusToJira,
  mapJiraStatusToLocal,
  moreAdvancedStatus,
} from './field-mapper.js';
import { resolveConflict, type ConflictStrategy, type SyncConflict } from './conflict-resolver.js';

// ---------------------------------------------------------------------------
// Public result types
// ---------------------------------------------------------------------------

export interface PushResult {
  jiraKey: string;
  action: 'created' | 'updated';
}

export interface PullResult {
  mergedStatus: string;
  remoteUpdatedAt: string;
  conflicts: SyncConflict[];
}

// ---------------------------------------------------------------------------
// SyncEngine
// ---------------------------------------------------------------------------

export class SyncEngine {
  private readonly jira: JiraClient;
  private readonly confluence: ConfluenceClient;
  private readonly strategy: ConflictStrategy;

  constructor(config: {
    jira: JiraClient;
    confluence: ConfluenceClient;
    strategy: ConflictStrategy;
  }) {
    this.jira = config.jira;
    this.confluence = config.confluence;
    this.strategy = config.strategy;
  }

  // -------------------------------------------------------------------------
  // Push story to Jira
  // -------------------------------------------------------------------------

  /**
   * Push a local .md artifact to Jira.
   * - If frontmatter.jira_key exists: updateIssue + try transitionIssue
   * - If no jira_key: createIssue with type derived from artifact.type
   */
  async pushStory(artifact: LocalArtifact): Promise<PushResult> {
    const title = this.extractTitle(artifact.content);
    const description = this.extractDescription(artifact.content);
    const localStatus = artifact.frontmatter['status'] ?? 'backlog';
    const jiraTransition = mapLocalStatusToJira(localStatus);

    const existingKey = artifact.frontmatter['jira_key'];

    if (existingKey) {
      // Update existing issue
      await this.jira.updateIssue(existingKey, {
        summary: title,
        description,
      });

      // Try to transition — if it fails (e.g., transition not available) we log and continue
      try {
        await this.jira.transitionIssue(existingKey, jiraTransition);
      } catch {
        // Transition not available — not a fatal error
      }

      return { jiraKey: existingKey, action: 'updated' };
    }

    // Map artifact type to Jira issue type
    const issueType = this.mapArtifactTypeToJiraType(artifact.type);

    const created = await this.jira.createIssue({
      type: issueType,
      summary: title,
      description,
    });

    return { jiraKey: created.key, action: 'created' };
  }

  // -------------------------------------------------------------------------
  // Pull latest Jira state for a local artifact
  // -------------------------------------------------------------------------

  /**
   * Pull latest Jira state for a local artifact.
   * Requires frontmatter.jira_key.
   */
  async pullStory(artifact: LocalArtifact): Promise<PullResult> {
    const jiraKey = artifact.frontmatter['jira_key'];
    if (!jiraKey) {
      throw new Error(`Cannot pull: artifact at ${artifact.filePath} has no jira_key in frontmatter.`);
    }

    const issue = await this.jira.getIssue(jiraKey);
    const remoteFields = extractJiraFields(issue);

    const localStatus = artifact.frontmatter['status'] ?? 'backlog';
    const remoteStatus = mapJiraStatusToLocal(remoteFields.status);
    const localUpdatedAt = artifact.frontmatter['updated'] ?? new Date(0).toISOString();
    const remoteUpdatedAt = remoteFields.updated;

    const conflicts: SyncConflict[] = [];
    let mergedStatus = localStatus;

    // Check for status conflict
    if (localStatus !== remoteStatus) {
      const conflict: SyncConflict = {
        field: 'status',
        localValue: localStatus,
        remoteValue: remoteStatus,
        localUpdatedAt,
        remoteUpdatedAt,
      };
      conflicts.push(conflict);

      const resolution = resolveConflict(conflict, this.strategy);
      if (resolution !== null) {
        mergedStatus = resolution.resolvedValue;
      } else {
        // 'ask' strategy — default to more advanced status
        mergedStatus = moreAdvancedStatus(localStatus, remoteStatus);
      }
    }

    return {
      mergedStatus,
      remoteUpdatedAt,
      conflicts,
    };
  }

  // -------------------------------------------------------------------------
  // Push to Confluence
  // -------------------------------------------------------------------------

  /**
   * Push a page to Confluence.
   * Creates a new page or updates an existing one.
   */
  async pushConfluencePage(params: {
    title: string;
    body: string;
    existingPageId?: string;
    parentId?: string;
  }): Promise<{ pageId: string }> {
    if (params.existingPageId) {
      const updated = await this.confluence.updatePage(params.existingPageId, {
        title: params.title,
        body: params.body,
      });
      return { pageId: updated.id };
    }

    const created = await this.confluence.createPage({
      title: params.title,
      body: params.body,
      parentId: params.parentId,
    });

    return { pageId: created.id };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Extracts the first # heading from content, stripping "Story X.Y: " prefix.
   */
  private extractTitle(content: string): string {
    const match = content.match(/^#\s+(.+)$/m);
    if (!match) return '';
    // Strip common prefixes like "Story 1.2: " or "Epic 3: "
    return match[1].replace(/^(Story|Epic|Task)\s+[\d.]+:\s*/i, '').trim();
  }

  /**
   * Extracts content between the first heading and the first ## Tasks/Dev Notes section.
   */
  private extractDescription(content: string): string {
    // Find the first heading line
    const headingMatch = content.match(/^#\s+.+$/m);
    if (!headingMatch || headingMatch.index === undefined) return '';

    const afterHeading = content.slice(headingMatch.index + headingMatch[0].length).trimStart();

    // Find the next ## heading (Tasks, Dev Notes, etc.)
    const sectionMatch = afterHeading.match(/^##\s+/m);
    if (sectionMatch && sectionMatch.index !== undefined) {
      return afterHeading.slice(0, sectionMatch.index).trim();
    }

    return afterHeading.trim();
  }

  /**
   * Maps a LocalArtifact type to a Jira issue type string.
   */
  private mapArtifactTypeToJiraType(
    type: LocalArtifact['type'],
  ): 'Epic' | 'Story' | 'Task' | 'Bug' {
    switch (type) {
      case 'epic':
        return 'Epic';
      case 'story':
        return 'Story';
      case 'retrospective':
      case 'change-proposal':
      case 'sprint-page':
      default:
        return 'Task';
    }
  }
}
