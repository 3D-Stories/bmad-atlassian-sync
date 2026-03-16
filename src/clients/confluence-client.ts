/**
 * Confluence Cloud REST API client.
 * Page CRUD uses API v2 (/api/v2/pages).
 * CQL search uses API v1 (/rest/api/search).
 * Space resolution uses API v2 (/api/v2/spaces).
 */

import { getAuthHeader } from '../config.js';

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
  baseUrl: string;
  email: string;
  apiToken: string;
  spaceKey: string;
  spaceId?: string;
}

// ---------------------------------------------------------------------------
// ConfluenceClient
// ---------------------------------------------------------------------------

export class ConfluenceClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly spaceKey: string;

  /** Cached spaceId — may be pre-configured or resolved lazily. */
  private cachedSpaceId: string | null;

  constructor(config: ConfluenceClientConfig) {
    // Strip trailing slash for consistency
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.authHeader = getAuthHeader(config.email, config.apiToken);
    this.spaceKey = config.spaceKey;
    // If spaceId is provided at construction time, skip the lookup entirely
    this.cachedSpaceId = config.spaceId ?? null;
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

  private v2Url(path: string): string {
    return `${this.baseUrl}/api/v2/${path.replace(/^\//, '')}`;
  }

  private v1Url(path: string): string {
    return `${this.baseUrl}/rest/api/${path.replace(/^\//, '')}`;
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
      throw new Error(`Confluence API error ${response.status}: ${bodyText}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  /**
   * Resolves the numeric/string spaceId for this client's spaceKey.
   * Result is cached so only one API call is ever made per client instance.
   */
  private async resolveSpaceId(): Promise<string> {
    if (this.cachedSpaceId !== null) {
      return this.cachedSpaceId;
    }

    const url = this.v2Url(`spaces?keys=${encodeURIComponent(this.spaceKey)}`);
    const data = await this.request<{ results: { id: string; key: string }[] }>(url);

    if (!data.results || data.results.length === 0) {
      throw new Error(
        `Confluence space not found for key "${this.spaceKey}". ` +
          'Check that the space exists and the credentials have access.',
      );
    }

    this.cachedSpaceId = data.results[0].id;
    return this.cachedSpaceId;
  }

  // -------------------------------------------------------------------------
  // Pages
  // -------------------------------------------------------------------------

  /**
   * Creates a new page in the configured Confluence space.
   */
  async createPage(params: {
    title: string;
    body: string;
    parentId?: string;
  }): Promise<ConfluencePage> {
    const spaceId = await this.resolveSpaceId();

    const reqBody: Record<string, unknown> = {
      spaceId,
      status: 'current',
      title: params.title,
      body: {
        representation: 'storage',
        value: params.body,
      },
    };

    if (params.parentId !== undefined) {
      reqBody['parentId'] = params.parentId;
    }

    return this.request<ConfluencePage>(this.v2Url('pages'), {
      method: 'POST',
      body: JSON.stringify(reqBody),
    });
  }

  /**
   * Updates an existing Confluence page.
   * Automatically fetches the current page version and increments it.
   */
  async updatePage(
    pageId: string,
    params: { title?: string; body?: string; message?: string },
  ): Promise<ConfluencePage> {
    // Must GET current page to obtain the current version number
    const current = await this.getPage(pageId);

    const reqBody: Record<string, unknown> = {
      status: 'current',
      title: params.title ?? current.title,
      version: {
        number: current.version.number + 1,
        ...(params.message !== undefined ? { message: params.message } : {}),
      },
      body: {
        representation: 'storage',
        value: params.body ?? current.body?.storage?.value ?? '',
      },
    };

    return this.request<ConfluencePage>(this.v2Url(`pages/${pageId}`), {
      method: 'PUT',
      body: JSON.stringify(reqBody),
    });
  }

  /**
   * Retrieves a Confluence page by its ID.
   * Optionally requests the body in a specific format.
   */
  async getPage(pageId: string, bodyFormat?: 'storage' | 'view'): Promise<ConfluencePage> {
    let url = this.v2Url(`pages/${pageId}`);
    if (bodyFormat !== undefined) {
      url += `?body-format=${encodeURIComponent(bodyFormat)}`;
    }
    return this.request<ConfluencePage>(url);
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  /**
   * Searches Confluence using CQL (Confluence Query Language).
   * Uses the v1 search API endpoint.
   */
  async search(
    cql: string,
    limit?: number,
  ): Promise<ConfluenceSearchResult> {
    let url = `${this.v1Url('search')}?cql=${encodeURIComponent(cql)}`;
    if (limit !== undefined) {
      url += `&limit=${limit}`;
    }
    return this.request<ConfluenceSearchResult>(url);
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
