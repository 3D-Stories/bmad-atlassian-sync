import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JiraClient } from '../../src/clients/jira-client.js';

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOkResponse(body: unknown, status = 200): Response {
  return {
    ok: true,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function makeErrorResponse(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const DEFAULT_CONFIG = {
  baseUrl: 'https://test.atlassian.net',
  email: 'test@example.com',
  apiToken: 'test-token',
  projectKey: 'TEST',
  boardId: 42,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JiraClient', () => {
  let client: JiraClient;

  beforeEach(() => {
    client = new JiraClient(DEFAULT_CONFIG);
    mockFetch.mockReset();
  });

  // -------------------------------------------------------------------------
  // createIssue
  // -------------------------------------------------------------------------

  describe('createIssue', () => {
    it('sends correct ADF body and returns key', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({ id: '10001', key: 'TEST-1', self: 'https://test.atlassian.net/rest/api/3/issue/10001' }, 201),
      );

      const result = await client.createIssue({
        type: 'Story',
        summary: 'My test story',
        description: 'This is a description',
      });

      expect(result.key).toBe('TEST-1');
      expect(result.id).toBe('10001');

      // Verify fetch was called with correct URL
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://test.atlassian.net/rest/api/3/issue');
      expect(options.method).toBe('POST');

      // Verify ADF body structure
      const body = JSON.parse(options.body as string) as {
        fields: {
          summary: string;
          issuetype: { name: string };
          project: { key: string };
          description: { version: number; type: string; content: unknown[] };
        };
      };
      expect(body.fields.summary).toBe('My test story');
      expect(body.fields.issuetype.name).toBe('Story');
      expect(body.fields.project.key).toBe('TEST');
      expect(body.fields.description.version).toBe(1);
      expect(body.fields.description.type).toBe('doc');
      expect(Array.isArray(body.fields.description.content)).toBe(true);
    });

    it('includes labels and priority when provided', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({ id: '10002', key: 'TEST-2', self: 'https://test.atlassian.net/rest/api/3/issue/10002' }, 201),
      );

      await client.createIssue({
        type: 'Bug',
        summary: 'Bug report',
        labels: ['critical', 'backend'],
        priority: 'High',
      });

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as {
        fields: { labels: string[]; priority: { name: string } };
      };
      expect(body.fields.labels).toEqual(['critical', 'backend']);
      expect(body.fields.priority).toEqual({ name: 'High' });
    });

    it('creates issue without description when omitted', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({ id: '10003', key: 'TEST-3', self: '' }, 201),
      );

      await client.createIssue({ type: 'Task', summary: 'Quick task' });

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as {
        fields: { description?: unknown };
      };
      expect(body.fields.description).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // getIssue
  // -------------------------------------------------------------------------

  describe('getIssue', () => {
    it('fetches by key and returns fields', async () => {
      const issueData = {
        id: '10001',
        key: 'TEST-1',
        self: 'https://test.atlassian.net/rest/api/3/issue/10001',
        fields: {
          summary: 'My issue',
          status: { name: 'To Do', statusCategory: { key: 'new' } },
          updated: '2024-01-01T00:00:00.000Z',
          created: '2024-01-01T00:00:00.000Z',
        },
      };

      mockFetch.mockResolvedValueOnce(makeOkResponse(issueData));

      const result = await client.getIssue('TEST-1');

      expect(result.key).toBe('TEST-1');
      expect(result.fields.summary).toBe('My issue');
      expect(result.fields.status.name).toBe('To Do');

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/rest/api/3/issue/TEST-1');
    });

    it('appends fields query param when fields are specified', async () => {
      const issueData = {
        id: '10001',
        key: 'TEST-1',
        self: '',
        fields: { summary: 'Test', status: { name: 'Done' }, updated: '', created: '' },
      };
      mockFetch.mockResolvedValueOnce(makeOkResponse(issueData));

      await client.getIssue('TEST-1', ['summary', 'status']);

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('fields=summary%2Cstatus');
    });
  });

  // -------------------------------------------------------------------------
  // transitionIssue
  // -------------------------------------------------------------------------

  describe('transitionIssue', () => {
    it('gets available transitions then executes the matching one', async () => {
      // First call: GET transitions
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({
          transitions: [
            { id: '11', name: 'To Do' },
            { id: '21', name: 'In Progress' },
            { id: '31', name: 'Done' },
          ],
        }),
      );

      // Second call: POST transition
      mockFetch.mockResolvedValueOnce(makeOkResponse({}, 204));

      await client.transitionIssue('TEST-1', 'In Progress');

      expect(mockFetch).toHaveBeenCalledTimes(2);

      // First call should be GET transitions
      const [getUrl] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(getUrl).toContain('/rest/api/3/issue/TEST-1/transitions');

      // Second call should POST with the matched transition id
      const [postUrl, postOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
      expect(postUrl).toContain('/rest/api/3/issue/TEST-1/transitions');
      expect(postOptions.method).toBe('POST');

      const postBody = JSON.parse(postOptions.body as string) as { transition: { id: string } };
      expect(postBody.transition.id).toBe('21');
    });

    it('matches transitions case-insensitively', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({
          transitions: [
            { id: '11', name: 'To Do' },
            { id: '31', name: 'Done' },
          ],
        }),
      );
      mockFetch.mockResolvedValueOnce(makeOkResponse({}, 204));

      await client.transitionIssue('TEST-1', 'done');

      const [, postOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
      const postBody = JSON.parse(postOptions.body as string) as { transition: { id: string } };
      expect(postBody.transition.id).toBe('31');
    });

    it('throws when target transition is not found', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({
          transitions: [{ id: '11', name: 'To Do' }],
        }),
      );

      await expect(client.transitionIssue('TEST-1', 'NonExistent')).rejects.toThrow(/transition/i);
    });
  });

  // -------------------------------------------------------------------------
  // addComment
  // -------------------------------------------------------------------------

  describe('addComment', () => {
    it('posts ADF comment and returns id', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse({ id: '55001' }, 201));

      const result = await client.addComment('TEST-1', 'Hello world');

      expect(result.id).toBe('55001');

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/rest/api/3/issue/TEST-1/comment');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body as string) as {
        body: { version: number; type: string; content: unknown[] };
      };
      expect(body.body.version).toBe(1);
      expect(body.body.type).toBe('doc');
    });
  });

  // -------------------------------------------------------------------------
  // search
  // -------------------------------------------------------------------------

  describe('search', () => {
    it('posts JQL and returns issues', async () => {
      const searchResult = {
        total: 2,
        startAt: 0,
        maxResults: 50,
        issues: [
          { id: '1', key: 'TEST-1', self: '', fields: { summary: 'A', status: { name: 'To Do' }, updated: '', created: '' } },
          { id: '2', key: 'TEST-2', self: '', fields: { summary: 'B', status: { name: 'Done' }, updated: '', created: '' } },
        ],
      };

      mockFetch.mockResolvedValueOnce(makeOkResponse(searchResult));

      const result = await client.search('project = TEST');

      expect(result.total).toBe(2);
      expect(result.issues).toHaveLength(2);
      expect(result.issues[0].key).toBe('TEST-1');

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/rest/api/3/issue/search');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body as string) as { jql: string; maxResults: number };
      expect(body.jql).toBe('project = TEST');
    });

    it('sends custom fields and maxResults', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse({ total: 0, startAt: 0, maxResults: 10, issues: [] }));

      await client.search('project = TEST', ['summary', 'status'], 10);

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as { fields: string[]; maxResults: number };
      expect(body.fields).toEqual(['summary', 'status']);
      expect(body.maxResults).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('throws with status code on non-ok HTTP response', async () => {
      mockFetch.mockResolvedValueOnce(makeErrorResponse(404, { errorMessages: ['Issue not found'] }));

      await expect(client.getIssue('TEST-999')).rejects.toThrow('404');
    });

    it('throws with status code on 401 response', async () => {
      mockFetch.mockResolvedValueOnce(makeErrorResponse(401, { message: 'Unauthorized' }));

      await expect(client.getIssue('TEST-1')).rejects.toThrow('401');
    });

    it('throws on 400 bad request from createIssue', async () => {
      mockFetch.mockResolvedValueOnce(
        makeErrorResponse(400, { errorMessages: [], errors: { summary: 'Field required' } }),
      );

      await expect(client.createIssue({ type: 'Story', summary: '' })).rejects.toThrow('400');
    });
  });

  // -------------------------------------------------------------------------
  // Sprint operations
  // -------------------------------------------------------------------------

  describe('sprint operations', () => {
    it('throws when boardId is not configured for createSprint', async () => {
      const clientNoBoardId = new JiraClient({
        baseUrl: 'https://test.atlassian.net',
        email: 'test@example.com',
        apiToken: 'test-token',
        projectKey: 'TEST',
      });

      await expect(
        clientNoBoardId.createSprint({ name: 'Sprint 1' }),
      ).rejects.toThrow(/boardId/i);
    });

    it('creates a sprint with correct agile API path', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({ id: 5, name: 'Sprint 1', state: 'future', originBoardId: 42 }),
      );

      const result = await client.createSprint({ name: 'Sprint 1', goal: 'Ship it' });

      expect(result.id).toBe(5);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/rest/agile/1.0/sprint');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body as string) as { name: string; originBoardId: number; goal: string };
      expect(body.name).toBe('Sprint 1');
      expect(body.originBoardId).toBe(42);
      expect(body.goal).toBe('Ship it');
    });

    it('moves issues to sprint', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse({}, 204));

      await client.moveIssuesToSprint(5, ['TEST-1', 'TEST-2']);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/rest/agile/1.0/sprint/5/issue');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body as string) as { issues: string[] };
      expect(body.issues).toEqual(['TEST-1', 'TEST-2']);
    });
  });

  // -------------------------------------------------------------------------
  // getProject
  // -------------------------------------------------------------------------

  describe('getProject', () => {
    it('fetches project by key and returns structured result', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({
          id: '10000',
          key: 'TEST',
          name: 'Test Project',
          issueTypes: [
            { id: '1', name: 'Epic', subtask: false },
            { id: '2', name: 'Story', subtask: false },
          ],
        }),
      );

      const result = await client.getProject();

      expect(result.key).toBe('TEST');
      expect(result.name).toBe('Test Project');
      expect(Array.isArray(result.issueTypes)).toBe(true);

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/rest/api/3/project/TEST');
    });
  });
});
