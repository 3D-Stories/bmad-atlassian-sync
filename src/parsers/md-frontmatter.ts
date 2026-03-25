// ---------------------------------------------------------------------------
// Markdown Frontmatter Parser
//
// Parses, updates, and injects YAML frontmatter in Markdown files.
// Supports simple flat key: value YAML only (no nesting, no arrays).
// ---------------------------------------------------------------------------

export interface FrontmatterResult {
  /** Parsed key-value pairs from the frontmatter block. */
  data: Record<string, string>;
  /** The markdown body after the frontmatter block is removed. */
  content: string;
  /** The original raw markdown string. */
  raw: string;
}

export interface SyncMetadata {
  jira_key?: string;
  confluence_page_id?: string;
  last_synced_at?: string;
  jira_updated_at?: string;
  confluence_updated_at?: string;
  sync_hash?: string;
}

// Matches the opening --- ... closing --- block at the top of the file.
const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n?/;

/**
 * Parses YAML frontmatter from a markdown string.
 *
 * Supports simple flat key: value pairs only.
 * Strips surrounding single or double quotes from values.
 *
 * @param markdown - Raw markdown string, possibly containing a frontmatter block.
 * @returns FrontmatterResult with parsed data, body content, and original raw string.
 */
export function parseFrontmatter(markdown: string): FrontmatterResult {
  const match = FRONTMATTER_REGEX.exec(markdown);

  if (!match) {
    return { data: {}, content: markdown, raw: markdown };
  }

  const yamlBlock = match[1];
  const content = markdown.slice(match[0].length);
  const data: Record<string, string> = {};

  for (const line of yamlBlock.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const rawValue = trimmed.slice(colonIdx + 1).trim();

    // Strip surrounding single or double quotes
    const value = rawValue.replace(/^(['"])(.*)\1$/, '$2');

    if (key) {
      data[key] = value;
    }
  }

  return { data, content, raw: markdown };
}

/**
 * Updates (or creates) frontmatter in a markdown string.
 *
 * Merges the provided key-value pairs into existing frontmatter,
 * overwriting any existing keys with the same name.
 * If no frontmatter exists, a new block is prepended.
 *
 * @param markdown - Raw markdown string.
 * @param updates  - Key-value pairs to merge into frontmatter.
 * @returns Complete markdown string with updated frontmatter.
 */
export function updateFrontmatter(markdown: string, updates: Record<string, string>): string {
  const { data, content } = parseFrontmatter(markdown);

  // Merge: existing data first, then apply updates (updates win on conflict)
  const merged: Record<string, string> = { ...data, ...updates };

  const yamlLines = Object.entries(merged).map(([k, v]) => `${k}: ${v}`);
  const frontmatterBlock = `---\n${yamlLines.join('\n')}\n---\n`;

  return frontmatterBlock + content;
}

/**
 * Convenience wrapper around updateFrontmatter that injects sync metadata.
 *
 * Accepts a SyncMetadata object and only writes keys that are defined
 * (i.e., not undefined).
 *
 * @param markdown - Raw markdown string.
 * @param meta     - Sync metadata fields to inject.
 * @returns Complete markdown string with sync metadata in frontmatter.
 */
export function injectSyncMetadata(markdown: string, meta: SyncMetadata): string {
  const updates: Record<string, string> = {};

  if (meta.jira_key !== undefined) updates['jira_key'] = meta.jira_key;
  if (meta.confluence_page_id !== undefined) updates['confluence_page_id'] = meta.confluence_page_id;
  if (meta.last_synced_at !== undefined) updates['last_synced_at'] = meta.last_synced_at;
  if (meta.jira_updated_at !== undefined) updates['jira_updated_at'] = meta.jira_updated_at;
  if (meta.confluence_updated_at !== undefined) updates['confluence_updated_at'] = meta.confluence_updated_at;
  if (meta.sync_hash !== undefined) updates['sync_hash'] = meta.sync_hash;

  return updateFrontmatter(markdown, updates);
}
