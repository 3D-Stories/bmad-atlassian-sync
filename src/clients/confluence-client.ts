/**
 * Confluence client — delegates all API calls to the Python atlassian-bridge.py script.
 * The bridge uses v1 API for writes (v2 POST/PUT fail with current token scopes).
 */

import { callBridge } from './atlassian-bridge.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ConfluencePage {
  id: string;
  title: string;
  status: string;
  spaceId?: string;
  parentId?: string;
  version: { number: number; createdAt?: string };
  body?: { storage?: { value: string } };
  _links?: { webui?: string };
}

export interface ConfluenceSearchResult {
  results: { content: { id: string; title: string } }[];
  size: number;
}

export interface ConfluenceClientConfig {
  baseUrl: string;   // Site URL for constructing page links
  spaceKey: string;
  // email / apiToken / cloudId are now handled by the Python bridge
  email?: string;
  apiToken?: string;
  cloudId?: string;
  spaceId?: string;
}

// ---------------------------------------------------------------------------
// ConfluenceClient
// ---------------------------------------------------------------------------

export class ConfluenceClient {
  private readonly spaceKey: string;

  constructor(config: ConfluenceClientConfig) {
    this.spaceKey = config.spaceKey;
  }

  // -------------------------------------------------------------------------
  // Pages
  // -------------------------------------------------------------------------

  /**
   * Creates a new page in the configured Confluence space.
   * Delegates to the Python bridge which uses v1 API for compatibility.
   */
  async createPage(params: {
    title: string;
    body: string;
    parentId?: string;
  }): Promise<ConfluencePage> {
    const result = callBridge({
      action: 'confluence_create_page',
      space_key: this.spaceKey,
      title: params.title,
      body_xhtml: params.body,
      parent_id: params.parentId ?? null,
    }) as { page_id: string; page_url: string };

    return {
      id: result.page_id,
      title: params.title,
      status: 'current',
      version: { number: 1 },
      _links: { webui: result.page_url },
    };
  }

  /**
   * Updates an existing Confluence page.
   * Fetches the current page version first, then increments it.
   */
  async updatePage(
    pageId: string,
    params: { title?: string; body?: string; message?: string },
  ): Promise<ConfluencePage> {
    // Get current page to obtain version number and title
    const current = await this.getPage(pageId);
    const newTitle = params.title ?? current.title;
    const newBody = params.body ?? current.body?.storage?.value ?? '';

    const result = callBridge({
      action: 'confluence_update_page',
      space_key: this.spaceKey,
      page_id: pageId,
      title: newTitle,
      body_xhtml: newBody,
      version: current.version.number,
    }) as { page_id: string; page_url: string };

    return {
      id: result.page_id,
      title: newTitle,
      status: 'current',
      version: { number: current.version.number + 1 },
      body: { storage: { value: newBody } },
      _links: { webui: result.page_url },
    };
  }

  /**
   * Retrieves a Confluence page by its ID using v1 API via bridge.
   */
  async getPage(pageId: string, bodyFormat?: 'storage' | 'view'): Promise<ConfluencePage> {
    const expand = bodyFormat === 'view'
      ? 'space,title,version,body.view'
      : 'space,title,version,body.storage';

    const v1Page = callBridge({
      action: 'confluence_get_page',
      page_id: pageId,
      expand,
    }) as {
      id: string;
      title: string;
      status: string;
      version: { number: number };
      body?: { storage?: { value: string }; view?: { value: string } };
      _links?: { webui?: string };
    };

    const body = bodyFormat === 'view'
      ? { storage: { value: v1Page.body?.view?.value ?? '' } }
      : v1Page.body;

    return {
      id: v1Page.id,
      title: v1Page.title,
      status: v1Page.status,
      version: v1Page.version,
      body,
      _links: v1Page._links,
    };
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  /**
   * Searches Confluence using CQL (Confluence Query Language).
   */
  async search(cql: string, limit?: number): Promise<ConfluenceSearchResult> {
    const result = callBridge({
      action: 'confluence_search',
      cql,
      limit: limit ?? 25,
    }) as { results: { content?: { id: string; title: string }; title?: string; id?: string }[]; size?: number };

    // Normalize v1 search response shape
    const normalized = (result.results ?? []).map((r) => ({
      content: r.content ?? { id: r.id ?? '', title: r.title ?? '' },
    }));

    return {
      results: normalized,
      size: result.size ?? normalized.length,
    };
  }

  /**
   * Finds a page in the configured space by its title.
   * Returns the first matching page, or null if none found.
   */
  async findPageByTitle(title: string): Promise<ConfluencePage | null> {
    const cql = `space = "${this.spaceKey}" AND title = "${title}" AND type = "page"`;
    const result = await this.search(cql, 1);

    if (!result.results || result.results.length === 0) {
      return null;
    }

    const { id, title: pageTitle } = result.results[0].content;
    return {
      id,
      title: pageTitle,
      status: 'current',
      version: { number: 0 },
    };
  }
}
