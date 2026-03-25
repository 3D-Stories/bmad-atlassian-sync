import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncEngine } from '../../src/sync/sync-engine.js';
import type { JiraClient } from '../../src/clients/jira-client.js';
import type { ConfluenceClient } from '../../src/clients/confluence-client.js';
import type { LocalArtifact } from '../../src/sync/field-mapper.js';

// ---------------------------------------------------------------------------
// Mock JiraClient and ConfluenceClient
// ---------------------------------------------------------------------------

function makeJiraClient(): JiraClient {
  return {
    createIssue: vi.fn(),
    getIssue: vi.fn(),
    updateIssue: vi.fn(),
    transitionIssue: vi.fn(),
    addComment: vi.fn(),
    search: vi.fn(),
    getProject: vi.fn(),
    createSprint: vi.fn(),
    moveIssuesToSprint: vi.fn(),
  } as unknown as JiraClient;
}

function makeConfluenceClient(): ConfluenceClient {
  return {
    createPage: vi.fn(),
    updatePage: vi.fn(),
    getPage: vi.fn(),
    search: vi.fn(),
    findPageByTitle: vi.fn(),
  } as unknown as ConfluenceClient;
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const storyArtifactNoKey: LocalArtifact = {
  filePath: '/stories/story-1.1.md',
  frontmatter: {
    status: 'in-progress',
    updated: '2024-01-15T10:00:00.000Z',
  },
  content: `# Story 1.1: User Login\n\nAs a user I want to log in.\n\n## Tasks\n- Implement login form`,
  type: 'story',
};

const storyArtifactWithKey: LocalArtifact = {
  filePath: '/stories/story-1.1.md',
  frontmatter: {
    jira_key: 'TEST-42',
    status: 'in-progress',
    updated: '2024-01-15T10:00:00.000Z',
  },
  content: `# Story 1.1: User Login\n\nAs a user I want to log in.\n\n## Tasks\n- Implement login form`,
  type: 'story',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SyncEngine', () => {
  let jira: ReturnType<typeof makeJiraClient>;
  let confluence: ReturnType<typeof makeConfluenceClient>;
  let engine: SyncEngine;

  beforeEach(() => {
    jira = makeJiraClient();
    confluence = makeConfluenceClient();
    engine = new SyncEngine({ jira, confluence, strategy: 'merge' });
  });

  // -------------------------------------------------------------------------
  // pushStory
  // -------------------------------------------------------------------------

  describe('pushStory', () => {
    it('creates a new Jira issue when no jira_key in frontmatter', async () => {
      vi.mocked(jira.createIssue).mockResolvedValueOnce({
        id: '10001',
        key: 'TEST-1',
        self: 'https://test.atlassian.net/rest/api/3/issue/10001',
      });

      const result = await engine.pushStory(storyArtifactNoKey);

      expect(jira.createIssue).toHaveBeenCalledOnce();
      expect(result.jiraKey).toBe('TEST-1');
      expect(result.action).toBe('created');
    });

    it('updates existing issue when jira_key is present in frontmatter', async () => {
      vi.mocked(jira.updateIssue).mockResolvedValueOnce(undefined);
      vi.mocked(jira.transitionIssue).mockResolvedValueOnce(undefined);

      const result = await engine.pushStory(storyArtifactWithKey);

      expect(jira.updateIssue).toHaveBeenCalledOnce();
      expect(jira.updateIssue).toHaveBeenCalledWith('TEST-42', expect.any(Object));
      expect(result.jiraKey).toBe('TEST-42');
      expect(result.action).toBe('updated');
    });
  });

  // -------------------------------------------------------------------------
  // pullStory
  // -------------------------------------------------------------------------

  describe('pullStory', () => {
    it('detects conflict and takes the more advanced status via merge strategy', async () => {
      // Local has 'in-progress', remote has 'review' (more advanced)
      vi.mocked(jira.getIssue).mockResolvedValueOnce({
        id: '10042',
        key: 'TEST-42',
        self: '',
        fields: {
          summary: 'User Login',
          status: { name: 'In Review' },
          description: undefined,
          updated: '2024-01-16T12:00:00.000Z',
          created: '2024-01-01T00:00:00.000Z',
          labels: [],
        },
      });

      const result = await engine.pullStory(storyArtifactWithKey);

      expect(jira.getIssue).toHaveBeenCalledWith('TEST-42');
      // Remote 'In Review' maps to local 'review', which is more advanced than 'in-progress'
      expect(result.mergedStatus).toBe('review');
      expect(result.remoteUpdatedAt).toBe('2024-01-16T12:00:00.000Z');
    });
  });

  // -------------------------------------------------------------------------
  // pushConfluencePage
  // -------------------------------------------------------------------------

  describe('pushConfluencePage', () => {
    it('creates a new page when no existingPageId provided', async () => {
      vi.mocked(confluence.createPage).mockResolvedValueOnce({
        id: 'page-123',
        title: 'Sprint 1 Notes',
        status: 'current',
        version: { number: 1 },
      });

      const result = await engine.pushConfluencePage({
        title: 'Sprint 1 Notes',
        body: '<p>Sprint notes</p>',
      });

      expect(confluence.createPage).toHaveBeenCalledOnce();
      expect(confluence.createPage).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Sprint 1 Notes', body: '<p>Sprint notes</p>' }),
      );
      expect(result.pageId).toBe('page-123');
    });

    it('updates existing page when existingPageId is provided', async () => {
      vi.mocked(confluence.updatePage).mockResolvedValueOnce({
        id: 'page-456',
        title: 'Sprint 1 Notes',
        status: 'current',
        version: { number: 2 },
      });

      const result = await engine.pushConfluencePage({
        title: 'Sprint 1 Notes',
        body: '<p>Updated notes</p>',
        existingPageId: 'page-456',
      });

      expect(confluence.updatePage).toHaveBeenCalledOnce();
      expect(confluence.updatePage).toHaveBeenCalledWith(
        'page-456',
        expect.objectContaining({ title: 'Sprint 1 Notes', body: '<p>Updated notes</p>' }),
      );
      expect(result.pageId).toBe('page-456');
    });
  });
});
