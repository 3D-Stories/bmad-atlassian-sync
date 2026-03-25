import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JiraClient } from '../../src/clients/jira-client.js';

// ---------------------------------------------------------------------------
// Mock the bridge module so no actual Python subprocess is spawned
// ---------------------------------------------------------------------------

vi.mock('../../src/clients/atlassian-bridge.js', () => ({
  callBridge: vi.fn(),
}));

import { callBridge } from '../../src/clients/atlassian-bridge.js';
const mockBridge = vi.mocked(callBridge);

// ---------------------------------------------------------------------------
// Config and helpers
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = {
  baseUrl: 'https://test.atlassian.net',
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
    mockBridge.mockReset();
  });

  // -------------------------------------------------------------------------
  // createIssue
  // -------------------------------------------------------------------------

  describe('createIssue', () => {
    it('calls bridge with jira_create_issue and returns key', async () => {
      mockBridge.mockReturnValueOnce({ id: '10001', key: 'TEST-1', self: '' });

      const result = await client.createIssue({
        type: 'Story',
        summary: 'My test story',
        description: 'This is a description',
      });

      expect(result.key).toBe('TEST-1');
      expect(result.id).toBe('10001');

      expect(mockBridge).toHaveBeenCalledOnce();
      const cmd = mockBridge.mock.calls[0][0] as Record<string, unknown>;
      expect(cmd['action']).toBe('jira_create_issue');

      const fields = (cmd['body'] as { fields: Record<string, unknown> }).fields;
      expect(fields['summary']).toBe('My test story');
      expect((fields['issuetype'] as { name: string }).name).toBe('Story');
      expect((fields['project'] as { key: string }).key).toBe('TEST');
      // description should be ADF doc
      const desc = fields['description'] as { version: number; type: string; content: unknown[] };
      expect(desc.version).toBe(1);
      expect(desc.type).toBe('doc');
      expect(Array.isArray(desc.content)).toBe(true);
    });

    it('includes labels and priority when provided', async () => {
      mockBridge.mockReturnValueOnce({ id: '10002', key: 'TEST-2', self: '' });

      await client.createIssue({
        type: 'Bug',
        summary: 'Bug report',
        labels: ['critical', 'backend'],
        priority: 'High',
      });

      const cmd = mockBridge.mock.calls[0][0] as Record<string, unknown>;
      const fields = (cmd['body'] as { fields: Record<string, unknown> }).fields;
      expect(fields['labels']).toEqual(['critical', 'backend']);
      expect(fields['priority']).toEqual({ name: 'High' });
    });

    it('creates issue without description when omitted', async () => {
      mockBridge.mockReturnValueOnce({ id: '10003', key: 'TEST-3', self: '' });

      await client.createIssue({ type: 'Task', summary: 'Quick task' });

      const cmd = mockBridge.mock.calls[0][0] as Record<string, unknown>;
      const fields = (cmd['body'] as { fields: Record<string, unknown> }).fields;
      expect(fields['description']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // getIssue
  // -------------------------------------------------------------------------

  describe('getIssue', () => {
    it('calls bridge with jira_get_issue and returns fields', async () => {
      const issueData = {
        id: '10001',
        key: 'TEST-1',
        self: '',
        fields: {
          summary: 'My issue',
          status: { name: 'To Do', statusCategory: { key: 'new' } },
          updated: '2024-01-01T00:00:00.000Z',
          created: '2024-01-01T00:00:00.000Z',
        },
      };

      mockBridge.mockReturnValueOnce(issueData);

      const result = await client.getIssue('TEST-1');

      expect(result.key).toBe('TEST-1');
      expect(result.fields.summary).toBe('My issue');
      expect(result.fields.status.name).toBe('To Do');

      const cmd = mockBridge.mock.calls[0][0] as Record<string, unknown>;
      expect(cmd['action']).toBe('jira_get_issue');
      expect(cmd['key']).toBe('TEST-1');
    });
  });

  // -------------------------------------------------------------------------
  // transitionIssue
  // -------------------------------------------------------------------------

  describe('transitionIssue', () => {
    it('fetches transitions then calls bridge with matched id', async () => {
      // First call: get transitions
      mockBridge.mockReturnValueOnce([
        { id: '11', name: 'To Do' },
        { id: '21', name: 'In Progress' },
        { id: '31', name: 'Done' },
      ]);
      // Second call: perform transition
      mockBridge.mockReturnValueOnce({ success: true });

      await client.transitionIssue('TEST-1', 'In Progress');

      expect(mockBridge).toHaveBeenCalledTimes(2);

      const getCmd = mockBridge.mock.calls[0][0] as Record<string, unknown>;
      expect(getCmd['action']).toBe('jira_transitions');
      expect(getCmd['key']).toBe('TEST-1');

      const postCmd = mockBridge.mock.calls[1][0] as Record<string, unknown>;
      expect(postCmd['action']).toBe('jira_transition');
      expect(postCmd['key']).toBe('TEST-1');
      expect(postCmd['transition_id']).toBe('21');
    });

    it('matches transitions case-insensitively', async () => {
      mockBridge.mockReturnValueOnce([
        { id: '11', name: 'To Do' },
        { id: '31', name: 'Done' },
      ]);
      mockBridge.mockReturnValueOnce({ success: true });

      await client.transitionIssue('TEST-1', 'done');

      const postCmd = mockBridge.mock.calls[1][0] as Record<string, unknown>;
      expect(postCmd['transition_id']).toBe('31');
    });

    it('throws when target transition is not found', async () => {
      mockBridge.mockReturnValueOnce([{ id: '11', name: 'To Do' }]);

      await expect(client.transitionIssue('TEST-1', 'NonExistent')).rejects.toThrow(/transition/i);
    });
  });

  // -------------------------------------------------------------------------
  // addComment
  // -------------------------------------------------------------------------

  describe('addComment', () => {
    it('calls bridge with jira_add_comment and returns id', async () => {
      mockBridge.mockReturnValueOnce({ comment_id: '55001' });

      const result = await client.addComment('TEST-1', 'Hello world');

      expect(result.id).toBe('55001');

      const cmd = mockBridge.mock.calls[0][0] as Record<string, unknown>;
      expect(cmd['action']).toBe('jira_add_comment');
      expect(cmd['key']).toBe('TEST-1');
      expect(Array.isArray(cmd['adf_content'])).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // search
  // -------------------------------------------------------------------------

  describe('search', () => {
    it('calls bridge with jira_search and returns issues', async () => {
      const issues = [
        { id: '1', key: 'TEST-1', self: '', fields: { summary: 'A', status: { name: 'To Do' }, updated: '', created: '' } },
        { id: '2', key: 'TEST-2', self: '', fields: { summary: 'B', status: { name: 'Done' }, updated: '', created: '' } },
      ];

      mockBridge.mockReturnValueOnce({ issues });

      const result = await client.search('project = TEST');

      expect(result.issues).toHaveLength(2);
      expect(result.issues[0].key).toBe('TEST-1');

      const cmd = mockBridge.mock.calls[0][0] as Record<string, unknown>;
      expect(cmd['action']).toBe('jira_search');
      expect(cmd['jql']).toBe('project = TEST');
    });

    it('passes custom fields and maxResults to bridge', async () => {
      mockBridge.mockReturnValueOnce({ issues: [] });

      await client.search('project = TEST', ['summary', 'status'], 10);

      const cmd = mockBridge.mock.calls[0][0] as Record<string, unknown>;
      expect(cmd['fields']).toEqual(['summary', 'status']);
      expect(cmd['max_results']).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('propagates bridge errors', async () => {
      mockBridge.mockImplementationOnce(() => {
        throw new Error('Atlassian bridge error [AtlassianAPIError]: HTTP 404 Not Found');
      });

      await expect(client.getIssue('TEST-999')).rejects.toThrow('404');
    });

    it('propagates 401 bridge errors', async () => {
      mockBridge.mockImplementationOnce(() => {
        throw new Error('Atlassian bridge error [AtlassianAPIError]: HTTP 401 Unauthorized');
      });

      await expect(client.getIssue('TEST-1')).rejects.toThrow('401');
    });
  });

  // -------------------------------------------------------------------------
  // Sprint operations
  // -------------------------------------------------------------------------

  describe('sprint operations', () => {
    it('throws when boardId is not configured for createSprint', async () => {
      const clientNoBoardId = new JiraClient({
        baseUrl: 'https://test.atlassian.net',
        projectKey: 'TEST',
      });

      await expect(
        clientNoBoardId.createSprint({ name: 'Sprint 1' }),
      ).rejects.toThrow(/boardId/i);
    });

    it('creates a sprint with correct body via bridge', async () => {
      mockBridge.mockReturnValueOnce({ id: 5, name: 'Sprint 1', state: 'future', originBoardId: 42 });

      const result = await client.createSprint({ name: 'Sprint 1', goal: 'Ship it' });

      expect(result.id).toBe(5);

      const cmd = mockBridge.mock.calls[0][0] as Record<string, unknown>;
      expect(cmd['action']).toBe('jira_create_sprint');
      const body = cmd['body'] as { name: string; originBoardId: number; goal: string };
      expect(body.name).toBe('Sprint 1');
      expect(body.originBoardId).toBe(42);
      expect(body.goal).toBe('Ship it');
    });

    it('moves issues to sprint via bridge', async () => {
      mockBridge.mockReturnValueOnce({ success: true });

      await client.moveIssuesToSprint(5, ['TEST-1', 'TEST-2']);

      const cmd = mockBridge.mock.calls[0][0] as Record<string, unknown>;
      expect(cmd['action']).toBe('jira_move_issues_to_sprint');
      expect(cmd['sprint_id']).toBe(5);
      expect(cmd['issue_keys']).toEqual(['TEST-1', 'TEST-2']);
    });
  });

  // -------------------------------------------------------------------------
  // getProject
  // -------------------------------------------------------------------------

  describe('getProject', () => {
    it('calls bridge with jira_get_project and returns structured result', async () => {
      mockBridge.mockReturnValueOnce({
        id: '10000',
        key: 'TEST',
        name: 'Test Project',
        issueTypes: [
          { id: '1', name: 'Epic', subtask: false },
          { id: '2', name: 'Story', subtask: false },
        ],
      });

      const result = await client.getProject();

      expect(result.key).toBe('TEST');
      expect(result.name).toBe('Test Project');
      expect(Array.isArray(result.issueTypes)).toBe(true);

      const cmd = mockBridge.mock.calls[0][0] as Record<string, unknown>;
      expect(cmd['action']).toBe('jira_get_project');
      expect(cmd['project_key']).toBe('TEST');
    });
  });
});
