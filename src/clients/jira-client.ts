/**
 * Jira Cloud REST API v3 client.
 * Uses ADF (Atlassian Document Format) for all text content.
 * Agile operations use the /rest/agile/1.0/ base path.
 */

import { getAuthHeader } from '../config.js';
import { textToAdf, type AdfDocument } from './adf.js';

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

interface JiraTransition {
  id: string;
  name: string;
}

interface JiraField {
  id: string;
  name: string;
  key: string;
}

// ---------------------------------------------------------------------------
// Client config
// ---------------------------------------------------------------------------

export interface JiraClientConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
  boardId?: number;
}

// ---------------------------------------------------------------------------
// JiraClient
// ---------------------------------------------------------------------------

export class JiraClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly projectKey: string;
  private readonly boardId?: number;

  /** Cached result of the Epic Link custom field ID discovery. */
  private epicLinkFieldId: string | undefined | null = null; // null = not yet fetched

  constructor(config: JiraClientConfig) {
    // Strip trailing slash for consistency
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.authHeader = getAuthHeader(config.email, config.apiToken);
    this.projectKey = config.projectKey;
    this.boardId = config.boardId;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private get commonHeaders(): Record<string, string> {
    return {
      Authorization: this.authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private apiUrl(path: string): string {
    return `${this.baseUrl}/rest/api/3/${path.replace(/^\//, '')}`;
  }

  private agileUrl(path: string): string {
    return `${this.baseUrl}/rest/agile/1.0/${path.replace(/^\//, '')}`;
  }

  /**
   * Makes a fetch request and throws a descriptive error on non-ok responses.
   */
  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.commonHeaders,
        ...(options.headers as Record<string, string> | undefined),
      },
    });

    if (!response.ok) {
      let bodyText: string;
      try {
        bodyText = await response.text();
      } catch {
        bodyText = '<unable to read response body>';
      }
      throw new Error(`Jira API error ${response.status}: ${bodyText}`);
    }

    // 204 No Content — return empty object
    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  // -------------------------------------------------------------------------
  // Field discovery (private, cached)
  // -------------------------------------------------------------------------

  /**
   * Fetches all Jira fields and returns the ID of the "Epic Link" custom field.
   * Result is cached after the first successful call.
   */
  private async getEpicLinkField(): Promise<string | undefined> {
    if (this.epicLinkFieldId !== null) {
      return this.epicLinkFieldId;
    }

    const fields = await this.request<JiraField[]>(this.apiUrl('field'));
    const epicLinkField = fields.find(
      (f) => f.name === 'Epic Link' || f.key === 'Epic Link',
    );

    this.epicLinkFieldId = epicLinkField?.id;
    return this.epicLinkFieldId;
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

    // Attach epic link if provided
    if (params.epicKey) {
      const epicLinkFieldId = await this.getEpicLinkField();
      if (epicLinkFieldId) {
        fields[epicLinkFieldId] = params.epicKey;
      } else {
        // Try the standard parent field (next-gen projects)
        fields['parent'] = { key: params.epicKey };
      }
    }

    return this.request<{ id: string; key: string; self: string }>(
      this.apiUrl('issue'),
      {
        method: 'POST',
        body: JSON.stringify({ fields }),
      },
    );
  }

  /**
   * Retrieves a Jira issue by its key.
   */
  async getIssue(issueKey: string, fields?: string[]): Promise<JiraIssue> {
    let url = this.apiUrl(`issue/${issueKey}`);
    if (fields && fields.length > 0) {
      url += `?fields=${encodeURIComponent(fields.join(','))}`;
    }
    return this.request<JiraIssue>(url);
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

    await this.request<void>(this.apiUrl(`issue/${issueKey}`), {
      method: 'PUT',
      body: JSON.stringify({ fields: processedFields }),
    });
  }

  // -------------------------------------------------------------------------
  // Status transitions
  // -------------------------------------------------------------------------

  /**
   * Transitions an issue to a new status by name (case-insensitive).
   */
  async transitionIssue(issueKey: string, targetStatus: string): Promise<void> {
    const { transitions } = await this.request<{ transitions: JiraTransition[] }>(
      this.apiUrl(`issue/${issueKey}/transitions`),
    );

    const match = transitions.find(
      (t) => t.name.toLowerCase() === targetStatus.toLowerCase(),
    );

    if (!match) {
      const available = transitions.map((t) => t.name).join(', ');
      throw new Error(
        `No transition named "${targetStatus}" found for issue ${issueKey}. Available: ${available}`,
      );
    }

    await this.request<void>(this.apiUrl(`issue/${issueKey}/transitions`), {
      method: 'POST',
      body: JSON.stringify({ transition: { id: match.id } }),
    });
  }

  // -------------------------------------------------------------------------
  // Comments
  // -------------------------------------------------------------------------

  /**
   * Adds a comment to an issue.
   */
  async addComment(issueKey: string, text: string): Promise<{ id: string }> {
    return this.request<{ id: string }>(this.apiUrl(`issue/${issueKey}/comment`), {
      method: 'POST',
      body: JSON.stringify({ body: textToAdf(text) }),
    });
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  /**
   * Searches for issues using JQL.
   */
  async search(jql: string, fields?: string[], maxResults = 50): Promise<SearchResult> {
    const body: Record<string, unknown> = {
      jql,
      maxResults,
      startAt: 0,
    };

    if (fields && fields.length > 0) {
      body['fields'] = fields;
    }

    return this.request<SearchResult>(this.apiUrl('issue/search'), {
      method: 'POST',
      body: JSON.stringify(body),
    });
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
    return this.request(this.apiUrl(`project/${this.projectKey}`));
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

    return this.request(this.agileUrl('sprint'), {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Moves a set of issues into a sprint.
   */
  async moveIssuesToSprint(sprintId: number, issueKeys: string[]): Promise<void> {
    await this.request<void>(this.agileUrl(`sprint/${sprintId}/issue`), {
      method: 'POST',
      body: JSON.stringify({ issues: issueKeys }),
    });
  }
}
