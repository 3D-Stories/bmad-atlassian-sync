import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfluenceClient } from '../../src/clients/confluence-client.js';

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
  baseUrl: 'https://test.atlassian.net/wiki',
  email: 'test@example.com',
  apiToken: 'test-token',
  spaceKey: 'TEST',
};

const SPACE_RESPONSE = {
  results: [{ id: 'space-123', key: 'TEST' }],
};

const PAGE_RESPONSE = {
  id: 'page-001',
  title: 'My Page',
  status: 'current',
  spaceId: 'space-123',
  parentId: undefined,
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
    mockFetch.mockReset();
  });

  // -------------------------------------------------------------------------
  // Space resolution
  // -------------------------------------------------------------------------

  describe('space resolution', () => {
    it('resolves spaceId from spaceKey on first API call', async () => {
      // First call: resolve space, second call: createPage
      mockFetch
        .mockResolvedValueOnce(makeOkResponse(SPACE_RESPONSE))
        .mockResolvedValueOnce(makeOkResponse(PAGE_RESPONSE, 200));

      await client.createPage({ title: 'Test Page', body: '<p>body</p>' });

      expect(mockFetch).toHaveBeenCalledTimes(2);

      // First call should be the spaces lookup
      const [spaceUrl] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(spaceUrl).toContain('/api/v2/spaces');
      expect(spaceUrl).toContain('keys=TEST');
    });

    it('caches spaceId and does not fetch it again on second call', async () => {
      // Calls: space resolution + createPage + createPage (no second space lookup)
      mockFetch
        .mockResolvedValueOnce(makeOkResponse(SPACE_RESPONSE))
        .mockResolvedValueOnce(makeOkResponse(PAGE_RESPONSE, 200))
        .mockResolvedValueOnce(makeOkResponse({ ...PAGE_RESPONSE, id: 'page-002', title: 'Second' }, 200));

      await client.createPage({ title: 'First', body: '<p>first</p>' });
      await client.createPage({ title: 'Second', body: '<p>second</p>' });

      // Total calls: 1 space + 2 createPage = 3
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('uses pre-configured spaceId without fetching spaces', async () => {
      const clientWithSpaceId = new ConfluenceClient({
        ...DEFAULT_CONFIG,
        spaceId: 'pre-configured-space',
      });

      mockFetch.mockResolvedValueOnce(makeOkResponse(PAGE_RESPONSE, 200));

      await clientWithSpaceId.createPage({ title: 'Test', body: '<p>x</p>' });

      // Only 1 call: createPage (no space resolution needed)
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as { spaceId: string };
      expect(body.spaceId).toBe('pre-configured-space');
    });
  });

  // -------------------------------------------------------------------------
  // createPage
  // -------------------------------------------------------------------------

  describe('createPage', () => {
    it('sends correct body structure with storage representation', async () => {
      mockFetch
        .mockResolvedValueOnce(makeOkResponse(SPACE_RESPONSE))
        .mockResolvedValueOnce(makeOkResponse(PAGE_RESPONSE, 200));

      const result = await client.createPage({
        title: 'My New Page',
        body: '<p>Hello World</p>',
      });

      expect(result.id).toBe('page-001');
      expect(result.title).toBe('My Page');

      const [url, options] = mockFetch.mock.calls[1] as [string, RequestInit];
      expect(url).toContain('/api/v2/pages');
      expect(options.method).toBe('POST');

      const reqBody = JSON.parse(options.body as string) as {
        spaceId: string;
        status: string;
        title: string;
        body: { representation: string; value: string };
        parentId?: string;
      };
      expect(reqBody.spaceId).toBe('space-123');
      expect(reqBody.status).toBe('current');
      expect(reqBody.title).toBe('My New Page');
      expect(reqBody.body.representation).toBe('storage');
      expect(reqBody.body.value).toBe('<p>Hello World</p>');
      expect(reqBody.parentId).toBeUndefined();
    });

    it('includes parentId when provided', async () => {
      mockFetch
        .mockResolvedValueOnce(makeOkResponse(SPACE_RESPONSE))
        .mockResolvedValueOnce(makeOkResponse(PAGE_RESPONSE, 200));

      await client.createPage({
        title: 'Child Page',
        body: '<p>Child</p>',
        parentId: 'parent-999',
      });

      const [, options] = mockFetch.mock.calls[1] as [string, RequestInit];
      const reqBody = JSON.parse(options.body as string) as { parentId?: string };
      expect(reqBody.parentId).toBe('parent-999');
    });
  });

  // -------------------------------------------------------------------------
  // updatePage
  // -------------------------------------------------------------------------

  describe('updatePage', () => {
    it('GETs current version first, then PUTs with version+1', async () => {
      const currentPage = {
        ...PAGE_RESPONSE,
        id: 'page-001',
        version: { number: 3 },
      };

      const updatedPage = {
        ...PAGE_RESPONSE,
        id: 'page-001',
        version: { number: 4 },
        title: 'Updated Title',
      };

      // Calls: getPage (GET), updatePage (PUT)
      mockFetch
        .mockResolvedValueOnce(makeOkResponse(currentPage))
        .mockResolvedValueOnce(makeOkResponse(updatedPage));

      const result = await client.updatePage('page-001', {
        title: 'Updated Title',
        body: '<p>Updated</p>',
        message: 'Minor edit',
      });

      expect(result.title).toBe('Updated Title');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // First call: GET current page
      const [getUrl, getOptions] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(getUrl).toContain('/api/v2/pages/page-001');
      expect(getOptions?.method ?? 'GET').toBe('GET');

      // Second call: PUT with version + 1
      const [putUrl, putOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
      expect(putUrl).toContain('/api/v2/pages/page-001');
      expect(putOptions.method).toBe('PUT');

      const putBody = JSON.parse(putOptions.body as string) as {
        version: { number: number; message?: string };
        title: string;
        body: { representation: string; value: string };
        status: string;
      };
      expect(putBody.version.number).toBe(4); // 3 + 1
      expect(putBody.version.message).toBe('Minor edit');
      expect(putBody.title).toBe('Updated Title');
      expect(putBody.body.representation).toBe('storage');
      expect(putBody.body.value).toBe('<p>Updated</p>');
      expect(putBody.status).toBe('current');
    });

    it('preserves existing title when not provided in update', async () => {
      const currentPage = { ...PAGE_RESPONSE, title: 'Existing Title', version: { number: 1 } };
      const updatedPage = { ...PAGE_RESPONSE, title: 'Existing Title', version: { number: 2 } };

      mockFetch
        .mockResolvedValueOnce(makeOkResponse(currentPage))
        .mockResolvedValueOnce(makeOkResponse(updatedPage));

      await client.updatePage('page-001', { body: '<p>New body</p>' });

      const [, putOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
      const putBody = JSON.parse(putOptions.body as string) as { title: string };
      expect(putBody.title).toBe('Existing Title');
    });
  });

  // -------------------------------------------------------------------------
  // getPage
  // -------------------------------------------------------------------------

  describe('getPage', () => {
    it('fetches a page by ID', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse(PAGE_RESPONSE));

      const result = await client.getPage('page-001');

      expect(result.id).toBe('page-001');
      expect(result.title).toBe('My Page');
      expect(result.version.number).toBe(1);

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/api/v2/pages/page-001');
    });

    it('includes body-format query param when bodyFormat is specified', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse(PAGE_RESPONSE));

      await client.getPage('page-001', 'storage');

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('body-format=storage');
    });

    it('fetches page with view format', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse(PAGE_RESPONSE));

      await client.getPage('page-001', 'view');

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('body-format=view');
    });
  });

  // -------------------------------------------------------------------------
  // search
  // -------------------------------------------------------------------------

  describe('search', () => {
    it('searches with CQL and returns results', async () => {
      const searchResponse = {
        results: [
          { content: { id: 'page-001', title: 'My Page' } },
          { content: { id: 'page-002', title: 'Another Page' } },
        ],
        size: 2,
      };

      mockFetch.mockResolvedValueOnce(makeOkResponse(searchResponse));

      const result = await client.search('space = TEST AND title = "My Page"');

      expect(result.size).toBe(2);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].content.id).toBe('page-001');
      expect(result.results[0].content.title).toBe('My Page');

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/rest/api/search');
      expect(url).toContain('cql=');
      expect(decodeURIComponent(url)).toContain('space = TEST AND title = "My Page"');
    });

    it('includes limit parameter when provided', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse({ results: [], size: 0 }));

      await client.search('space = TEST', 25);

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('limit=25');
    });
  });

  // -------------------------------------------------------------------------
  // findPageByTitle
  // -------------------------------------------------------------------------

  describe('findPageByTitle', () => {
    it('returns the first matching page when found', async () => {
      const searchResponse = {
        results: [{ content: { id: 'page-001', title: 'Sprint Planning' } }],
        size: 1,
      };

      mockFetch.mockResolvedValueOnce(makeOkResponse(searchResponse));

      const result = await client.findPageByTitle('Sprint Planning');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('page-001');

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(decodeURIComponent(url)).toContain('Sprint Planning');
      expect(decodeURIComponent(url)).toContain('TEST');
    });

    it('returns null when no pages match', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse({ results: [], size: 0 }));

      const result = await client.findPageByTitle('Nonexistent Page');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('throws descriptive error on 404 response', async () => {
      mockFetch.mockResolvedValueOnce(makeErrorResponse(404, { message: 'Page not found' }));

      await expect(client.getPage('bad-id')).rejects.toThrow('404');
    });

    it('throws on 401 unauthorized response', async () => {
      mockFetch.mockResolvedValueOnce(makeErrorResponse(401, { message: 'Unauthorized' }));

      await expect(client.getPage('page-001')).rejects.toThrow('401');
    });

    it('throws on 403 forbidden response during createPage', async () => {
      mockFetch
        .mockResolvedValueOnce(makeOkResponse(SPACE_RESPONSE))
        .mockResolvedValueOnce(makeErrorResponse(403, { message: 'Forbidden' }));

      await expect(
        client.createPage({ title: 'Forbidden', body: '<p>x</p>' }),
      ).rejects.toThrow('403');
    });

    it('throws when space is not found during resolution', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse({ results: [], size: 0 }));

      await expect(
        client.createPage({ title: 'Test', body: '<p>x</p>' }),
      ).rejects.toThrow(/space/i);
    });
  });
});
