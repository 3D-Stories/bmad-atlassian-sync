import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfluenceClient } from '../../src/clients/confluence-client.js';

// ---------------------------------------------------------------------------
// Mock the bridge module so no actual Python subprocess is spawned
// ---------------------------------------------------------------------------

vi.mock('../../src/clients/atlassian-bridge.js', () => ({
  callBridge: vi.fn(),
}));

import { callBridge } from '../../src/clients/atlassian-bridge.js';
const mockBridge = vi.mocked(callBridge);

// ---------------------------------------------------------------------------
// Config and shared fixtures
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = {
  baseUrl: 'https://test.atlassian.net/wiki',
  spaceKey: 'TEST',
};

const PAGE_RESPONSE = {
  id: 'page-001',
  title: 'My Page',
  status: 'current',
  version: { number: 1, createdAt: '2024-01-01T00:00:00.000Z' },
  body: { storage: { value: '<p>Hello</p>' } },
  _links: { webui: '/wiki/spaces/TEST/pages/page-001' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConfluenceClient', () => {
  let client: ConfluenceClient;

  beforeEach(() => {
    client = new ConfluenceClient(DEFAULT_CONFIG);
    mockBridge.mockReset();
  });

  // -------------------------------------------------------------------------
  // createPage
  // -------------------------------------------------------------------------

  describe('createPage', () => {
    it('calls bridge with confluence_create_page and returns page', async () => {
      mockBridge.mockReturnValueOnce({ page_id: 'page-001', page_url: '/wiki/spaces/TEST/pages/page-001' });

      const result = await client.createPage({
        title: 'My New Page',
        body: '<p>Hello World</p>',
      });

      expect(result.id).toBe('page-001');
      expect(result.title).toBe('My New Page');
      expect(result.status).toBe('current');

      expect(mockBridge).toHaveBeenCalledOnce();
      const cmd = mockBridge.mock.calls[0][0] as Record<string, unknown>;
      expect(cmd['action']).toBe('confluence_create_page');
      expect(cmd['space_key']).toBe('TEST');
      expect(cmd['title']).toBe('My New Page');
      expect(cmd['body_xhtml']).toBe('<p>Hello World</p>');
      expect(cmd['parent_id']).toBeNull();
    });

    it('passes parentId when provided', async () => {
      mockBridge.mockReturnValueOnce({ page_id: 'page-child', page_url: '/wiki/spaces/TEST/pages/page-child' });

      await client.createPage({
        title: 'Child Page',
        body: '<p>Child</p>',
        parentId: 'parent-999',
      });

      const cmd = mockBridge.mock.calls[0][0] as Record<string, unknown>;
      expect(cmd['parent_id']).toBe('parent-999');
    });
  });

  // -------------------------------------------------------------------------
  // updatePage
  // -------------------------------------------------------------------------

  describe('updatePage', () => {
    it('fetches current version first then calls confluence_update_page with version+1', async () => {
      const currentPage = { ...PAGE_RESPONSE, id: 'page-001', version: { number: 3 } };

      // First bridge call: getPage (confluence_get_page)
      mockBridge.mockReturnValueOnce(currentPage);
      // Second bridge call: updatePage (confluence_update_page)
      mockBridge.mockReturnValueOnce({ page_id: 'page-001', page_url: '/wiki/spaces/TEST/pages/page-001' });

      const result = await client.updatePage('page-001', {
        title: 'Updated Title',
        body: '<p>Updated</p>',
      });

      expect(result.title).toBe('Updated Title');
      expect(result.version.number).toBe(4); // 3 + 1
      expect(mockBridge).toHaveBeenCalledTimes(2);

      const updateCmd = mockBridge.mock.calls[1][0] as Record<string, unknown>;
      expect(updateCmd['action']).toBe('confluence_update_page');
      expect(updateCmd['page_id']).toBe('page-001');
      expect(updateCmd['version']).toBe(3);
      expect(updateCmd['title']).toBe('Updated Title');
      expect(updateCmd['body_xhtml']).toBe('<p>Updated</p>');
    });

    it('preserves existing title when not provided in update', async () => {
      const currentPage = { ...PAGE_RESPONSE, title: 'Existing Title', version: { number: 1 } };

      mockBridge.mockReturnValueOnce(currentPage);
      mockBridge.mockReturnValueOnce({ page_id: 'page-001', page_url: '' });

      await client.updatePage('page-001', { body: '<p>New body</p>' });

      const updateCmd = mockBridge.mock.calls[1][0] as Record<string, unknown>;
      expect(updateCmd['title']).toBe('Existing Title');
    });
  });

  // -------------------------------------------------------------------------
  // getPage
  // -------------------------------------------------------------------------

  describe('getPage', () => {
    it('calls bridge with confluence_get_page and returns page', async () => {
      mockBridge.mockReturnValueOnce(PAGE_RESPONSE);

      const result = await client.getPage('page-001');

      expect(result.id).toBe('page-001');
      expect(result.title).toBe('My Page');
      expect(result.version.number).toBe(1);

      const cmd = mockBridge.mock.calls[0][0] as Record<string, unknown>;
      expect(cmd['action']).toBe('confluence_get_page');
      expect(cmd['page_id']).toBe('page-001');
      expect(cmd['expand']).toContain('body.storage');
    });

    it('uses body.view expand when bodyFormat is view', async () => {
      const viewPage = {
        ...PAGE_RESPONSE,
        body: { view: { value: '<p>rendered</p>' } },
      };
      mockBridge.mockReturnValueOnce(viewPage);

      const result = await client.getPage('page-001', 'view');

      const cmd = mockBridge.mock.calls[0][0] as Record<string, unknown>;
      expect(cmd['expand']).toContain('body.view');
      expect(result.body?.storage?.value).toBe('<p>rendered</p>');
    });

    it('uses body.storage expand when bodyFormat is storage', async () => {
      mockBridge.mockReturnValueOnce(PAGE_RESPONSE);

      await client.getPage('page-001', 'storage');

      const cmd = mockBridge.mock.calls[0][0] as Record<string, unknown>;
      expect(cmd['expand']).toContain('body.storage');
    });
  });

  // -------------------------------------------------------------------------
  // search
  // -------------------------------------------------------------------------

  describe('search', () => {
    it('calls bridge with confluence_search and returns normalized results', async () => {
      const bridgeResponse = {
        results: [
          { content: { id: 'page-001', title: 'My Page' } },
          { content: { id: 'page-002', title: 'Another Page' } },
        ],
        size: 2,
      };

      mockBridge.mockReturnValueOnce(bridgeResponse);

      const result = await client.search('space = TEST AND title = "My Page"');

      expect(result.size).toBe(2);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].content.id).toBe('page-001');
      expect(result.results[0].content.title).toBe('My Page');

      const cmd = mockBridge.mock.calls[0][0] as Record<string, unknown>;
      expect(cmd['action']).toBe('confluence_search');
      expect(cmd['cql']).toBe('space = TEST AND title = "My Page"');
    });

    it('passes limit to bridge', async () => {
      mockBridge.mockReturnValueOnce({ results: [], size: 0 });

      await client.search('space = TEST', 25);

      const cmd = mockBridge.mock.calls[0][0] as Record<string, unknown>;
      expect(cmd['limit']).toBe(25);
    });
  });

  // -------------------------------------------------------------------------
  // findPageByTitle
  // -------------------------------------------------------------------------

  describe('findPageByTitle', () => {
    it('returns the first matching page when found', async () => {
      mockBridge.mockReturnValueOnce({
        results: [{ content: { id: 'page-001', title: 'Sprint Planning' } }],
        size: 1,
      });

      const result = await client.findPageByTitle('Sprint Planning');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('page-001');

      const cmd = mockBridge.mock.calls[0][0] as Record<string, unknown>;
      expect(cmd['cql']).toContain('Sprint Planning');
      expect(cmd['cql']).toContain('TEST');
    });

    it('returns null when no pages match', async () => {
      mockBridge.mockReturnValueOnce({ results: [], size: 0 });

      const result = await client.findPageByTitle('Nonexistent Page');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('propagates bridge errors from getPage', async () => {
      mockBridge.mockImplementationOnce(() => {
        throw new Error('Atlassian bridge error [AtlassianAPIError]: HTTP 404 Not Found');
      });

      await expect(client.getPage('bad-id')).rejects.toThrow('404');
    });

    it('propagates 401 errors', async () => {
      mockBridge.mockImplementationOnce(() => {
        throw new Error('Atlassian bridge error [AtlassianAPIError]: HTTP 401 Unauthorized');
      });

      await expect(client.getPage('page-001')).rejects.toThrow('401');
    });

    it('propagates 403 errors from createPage', async () => {
      mockBridge.mockImplementationOnce(() => {
        throw new Error('Atlassian bridge error [AtlassianAPIError]: HTTP 403 Forbidden');
      });

      await expect(
        client.createPage({ title: 'Forbidden', body: '<p>x</p>' }),
      ).rejects.toThrow('403');
    });
  });
});
