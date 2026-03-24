/**
 * Jira client — delegates all API calls to the Python atlassian-bridge.py script.
 * The bridge handles authentication, cloud-ID routing, and v1/v2 API selection.
 */

import { textToAdf, type AdfDocument } from './adf.js';
import { callBridge } from './atlassian-bridge.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface CreateIssueParams {
  type: 'Epic' | 'Story' | 'Task' | 'Bug';
  summary: string;
  description?: string;
  epicKey?: string;
  labels?: string[];
  priority?: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    status: {
      name: string;
      statusCategory?: { key: string };
    };
    description?: AdfDocument;
    updated: string;
    created: string;
    issuetype?: { name: string };
    priority?: { name: string };
    labels?: string[];
    assignee?: { displayName: string; accountId: string };
    [key: string]: unknown;
  };
}

export interface SearchResult {
  total: number;
  startAt: number;
  maxResults: number;
  issues: JiraIssue[];
}

// ---------------------------------------------------------------------------
// Client config
// ---------------------------------------------------------------------------

export interface JiraClientConfig {
  baseUrl: string;   // Site URL — kept for constructing browse links
  projectKey: string;
  boardId?: number;
  // email / apiToken / cloudId are now handled by the Python bridge
  email?: string;
  apiToken?: string;
  cloudId?: string;
}

// ---------------------------------------------------------------------------
// JiraClient
// ---------------------------------------------------------------------------

export class JiraClient {
  private readonly projectKey: string;
  private readonly boardId?: number;

  constructor(config: JiraClientConfig) {
    this.projectKey = config.projectKey;
    this.boardId = config.boardId;
  }

  // -------------------------------------------------------------------------
  // Issue CRUD
  // -------------------------------------------------------------------------

  /**
   * Creates a new Jira issue.
   */
  async createIssue(
    params: CreateIssueParams,
  ): Promise<{ id: string; key: string; self: string }> {
    const fields: Record<string, unknown> = {
      project: { key: this.projectKey },
      issuetype: { name: params.type },
      summary: params.summary,
    };

    if (params.description !== undefined) {
      fields['description'] = textToAdf(params.description);
    }

    if (params.labels && params.labels.length > 0) {
      fields['labels'] = params.labels;
    }

    if (params.priority) {
      fields['priority'] = { name: params.priority };
    }

    if (params.epicKey) {
      // Use standard parent field; bridge handles field discovery if needed
      fields['parent'] = { key: params.epicKey };
    }

    const result = callBridge({ action: 'jira_create_issue', body: { fields } }) as {
      key: string;
      id: string;
      self?: string;
    };
    return { id: result.id, key: result.key, self: result.self ?? '' };
  }

  /**
   * Retrieves a Jira issue by its key.
   */
  async getIssue(issueKey: string, _fields?: string[]): Promise<JiraIssue> {
    const result = callBridge({ action: 'jira_get_issue', key: issueKey });
    return result as JiraIssue;
  }

  /**
   * Updates an existing Jira issue.
   * String values in the `description` field are automatically converted to ADF.
   */
  async updateIssue(issueKey: string, fields: Record<string, unknown>): Promise<void> {
    const processedFields = { ...fields };

    if (typeof processedFields['description'] === 'string') {
      processedFields['description'] = textToAdf(processedFields['description'] as string);
    }

    callBridge({ action: 'jira_update_issue', key: issueKey, body: { fields: processedFields } });
  }

  // -------------------------------------------------------------------------
  // Status transitions
  // -------------------------------------------------------------------------

  /**
   * Transitions an issue to a new status by name (case-insensitive).
   */
  async transitionIssue(issueKey: string, targetStatus: string): Promise<void> {
    const transitions = callBridge({ action: 'jira_transitions', key: issueKey }) as Array<{
      id: string;
      name: string;
    }>;

    const match = transitions.find(
      (t) => t.name.toLowerCase() === targetStatus.toLowerCase(),
    );

    if (!match) {
      const available = transitions.map((t) => t.name).join(', ');
      throw new Error(
        `No transition named "${targetStatus}" found for issue ${issueKey}. Available: ${available}`,
      );
    }

    callBridge({ action: 'jira_transition', key: issueKey, transition_id: match.id });
  }

  // -------------------------------------------------------------------------
  // Comments
  // -------------------------------------------------------------------------

  /**
   * Adds a comment to an issue.
   */
  async addComment(issueKey: string, text: string): Promise<{ id: string }> {
    const adf = textToAdf(text);
    // Bridge expects the ADF content array, not the full doc wrapper
    const adfContent = (adf as { content: unknown[] }).content ?? [];
    const result = callBridge({
      action: 'jira_add_comment',
      key: issueKey,
      adf_content: adfContent,
    }) as { comment_id: string };
    return { id: result.comment_id };
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  /**
   * Searches for issues using JQL.
   */
  async search(jql: string, fields?: string[], maxResults = 50): Promise<SearchResult> {
    const result = callBridge({
      action: 'jira_search',
      jql,
      fields: fields ?? null,
      max_results: maxResults,
    }) as { issues: JiraIssue[] };

    return {
      total: result.issues.length,
      startAt: 0,
      maxResults,
      issues: result.issues,
    };
  }

  // -------------------------------------------------------------------------
  // Project
  // -------------------------------------------------------------------------

  /**
   * Retrieves project metadata.
   */
  async getProject(): Promise<{
    id: string;
    key: string;
    name: string;
    issueTypes: Array<{ id: string; name: string; subtask?: boolean }>;
  }> {
    const result = callBridge({
      action: 'jira_get_project',
      project_key: this.projectKey,
    });
    return result as { id: string; key: string; name: string; issueTypes: Array<{ id: string; name: string; subtask?: boolean }> };
  }

  // -------------------------------------------------------------------------
  // Agile (Sprint) API
  // -------------------------------------------------------------------------

  /**
   * Creates a new sprint on the configured board.
   * Requires boardId to be set in the constructor config.
   */
  async createSprint(params: {
    name: string;
    goal?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<{ id: number; name: string; state: string; originBoardId: number }> {
    if (!this.boardId) {
      throw new Error(
        'boardId is required for sprint operations. Set it in the JiraClient config.',
      );
    }

    const body: Record<string, unknown> = {
      name: params.name,
      originBoardId: this.boardId,
    };

    if (params.goal !== undefined) body['goal'] = params.goal;
    if (params.startDate !== undefined) body['startDate'] = params.startDate;
    if (params.endDate !== undefined) body['endDate'] = params.endDate;

    const result = callBridge({ action: 'jira_create_sprint', body });
    return result as { id: number; name: string; state: string; originBoardId: number };
  }

  /**
   * Moves a set of issues into a sprint.
   */
  async moveIssuesToSprint(sprintId: number, issueKeys: string[]): Promise<void> {
    callBridge({ action: 'jira_move_issues_to_sprint', sprint_id: sprintId, issue_keys: issueKeys });
  }
}
