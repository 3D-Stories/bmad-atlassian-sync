import { describe, it, expect } from 'vitest';
import { parseFrontmatter, updateFrontmatter, injectSyncMetadata } from '../../src/parsers/md-frontmatter.js';

// ---------------------------------------------------------------------------
// parseFrontmatter
// ---------------------------------------------------------------------------

describe('parseFrontmatter', () => {
  it('parses YAML from markdown correctly', () => {
    const markdown = `---
title: My Story
status: in-progress
jira_key: STARS-42
---

# My Story

Some content here.
`;

    const result = parseFrontmatter(markdown);

    expect(result.data['title']).toBe('My Story');
    expect(result.data['status']).toBe('in-progress');
    expect(result.data['jira_key']).toBe('STARS-42');
    expect(result.content).toContain('# My Story');
    expect(result.content).toContain('Some content here.');
    // content should not include the frontmatter block
    expect(result.content).not.toContain('---');
  });

  it('strips surrounding quotes from values', () => {
    const markdown = `---
title: "Quoted Title"
key: 'single-quoted'
plain: no-quotes
---

Content.
`;

    const result = parseFrontmatter(markdown);

    expect(result.data['title']).toBe('Quoted Title');
    expect(result.data['key']).toBe('single-quoted');
    expect(result.data['plain']).toBe('no-quotes');
  });

  it('returns empty data for files without frontmatter', () => {
    const markdown = `# Just a heading

No frontmatter here.
`;

    const result = parseFrontmatter(markdown);

    expect(result.data).toEqual({});
    expect(result.content).toBe(markdown);
    expect(result.raw).toBe(markdown);
  });

  it('returns empty data for empty string', () => {
    const result = parseFrontmatter('');

    expect(result.data).toEqual({});
    expect(result.content).toBe('');
    expect(result.raw).toBe('');
  });
});

// ---------------------------------------------------------------------------
// updateFrontmatter
// ---------------------------------------------------------------------------

describe('updateFrontmatter', () => {
  it('adds frontmatter to file without it', () => {
    const markdown = `# My Story

Content here.
`;

    const result = updateFrontmatter(markdown, { jira_key: 'STARS-10', status: 'done' });

    expect(result).toMatch(/^---\n/);
    expect(result).toContain('jira_key: STARS-10');
    expect(result).toContain('status: done');
    expect(result).toContain('# My Story');
    expect(result).toContain('Content here.');
  });

  it('merges into existing frontmatter', () => {
    const markdown = `---
title: My Story
status: in-progress
---

# My Story
`;

    const result = updateFrontmatter(markdown, { jira_key: 'STARS-99', status: 'done' });

    expect(result).toContain('title: My Story');
    expect(result).toContain('jira_key: STARS-99');
    // status should be updated
    expect(result).toContain('status: done');
    expect(result).not.toContain('status: in-progress');
    expect(result).toContain('# My Story');
  });

  it('preserves existing keys not in updates', () => {
    const markdown = `---
title: Original Title
author: Chris
---

Body.
`;

    const result = updateFrontmatter(markdown, { jira_key: 'STARS-1' });

    expect(result).toContain('title: Original Title');
    expect(result).toContain('author: Chris');
    expect(result).toContain('jira_key: STARS-1');
  });
});

// ---------------------------------------------------------------------------
// injectSyncMetadata
// ---------------------------------------------------------------------------

describe('injectSyncMetadata', () => {
  it('adds sync timestamps', () => {
    const markdown = `---
title: My Story
---

# My Story
`;

    const meta = {
      jira_key: 'STARS-42',
      confluence_page_id: 'page-123',
      last_synced_at: '2026-03-16T12:00:00Z',
    };

    const result = injectSyncMetadata(markdown, meta);

    expect(result).toContain('jira_key: STARS-42');
    expect(result).toContain('confluence_page_id: page-123');
    expect(result).toContain('last_synced_at: 2026-03-16T12:00:00Z');
    expect(result).toContain('title: My Story');
  });

  it('adds full SyncMetadata fields', () => {
    const markdown = `# No frontmatter
`;

    const meta = {
      jira_key: 'STARS-5',
      confluence_page_id: 'conf-456',
      last_synced_at: '2026-03-16T00:00:00Z',
      jira_updated_at: '2026-03-15T10:00:00Z',
      confluence_updated_at: '2026-03-14T08:00:00Z',
      sync_hash: 'abc123',
    };

    const result = injectSyncMetadata(markdown, meta);

    expect(result).toContain('jira_key: STARS-5');
    expect(result).toContain('confluence_page_id: conf-456');
    expect(result).toContain('last_synced_at: 2026-03-16T00:00:00Z');
    expect(result).toContain('jira_updated_at: 2026-03-15T10:00:00Z');
    expect(result).toContain('confluence_updated_at: 2026-03-14T08:00:00Z');
    expect(result).toContain('sync_hash: abc123');
    expect(result).toContain('# No frontmatter');
  });
});
