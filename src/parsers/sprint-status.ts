// ---------------------------------------------------------------------------
// Sprint-status.yaml Parser
//
// Parses, queries, and updates the sprint-status.yaml file used by BMAD
// to track story/epic progress.  Uses no external YAML library — relies
// on simple line-by-line parsing that is sufficient for the known format.
// ---------------------------------------------------------------------------

export interface SprintStatusEntry {
  key: string;
  status: string;
  type: 'epic' | 'story' | 'retrospective';
  jira_key?: string;
}

export interface SprintStatus {
  metadata: {
    generated?: string;
    last_updated?: string;
    project?: string;
    project_key?: string;
    tracking_system?: string;
    story_location?: string;
    jira_sprint_id?: string;
    confluence_page_id?: string;
  };
  entries: SprintStatusEntry[];
  rawContent: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Classifies a development_status key into its entry type.
 */
function classifyKey(key: string): SprintStatusEntry['type'] {
  if (key.endsWith('-retrospective')) return 'retrospective';
  if (key.startsWith('epic-')) return 'epic';
  return 'story';
}

/**
 * Parses an optional inline jira_key comment from a value string.
 *
 * Handles:
 *   in-progress  # jira_key: STARS-42
 *
 * Returns `{ status, jira_key }` where jira_key may be undefined.
 */
function parseInlineComment(raw: string): { status: string; commentParts: Record<string, string> } {
  const commentIdx = raw.indexOf('#');
  if (commentIdx === -1) {
    return { status: raw.trim(), commentParts: {} };
  }

  const status = raw.slice(0, commentIdx).trim();
  const comment = raw.slice(commentIdx + 1).trim();
  const commentParts: Record<string, string> = {};

  // Parse comma-separated or single key: value pairs in the comment
  for (const segment of comment.split(',')) {
    const colonIdx = segment.indexOf(':');
    if (colonIdx === -1) continue;
    const k = segment.slice(0, colonIdx).trim();
    const v = segment.slice(colonIdx + 1).trim();
    if (k) commentParts[k] = v;
  }

  return { status, commentParts };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses a sprint-status.yaml file into a structured SprintStatus object.
 *
 * The file format is a simple YAML-like structure:
 *   - Top-level flat key: value pairs (metadata)
 *   - A `development_status:` section with indented `key: status` lines
 *   - Optional inline comments for jira_key and other fields
 *
 * @param content - Raw YAML file content as a string.
 * @returns Parsed SprintStatus object.
 */
export function parseSprintStatus(content: string): SprintStatus {
  const lines = content.split('\n');

  const metadata: SprintStatus['metadata'] = {};
  const entries: SprintStatusEntry[] = [];

  const METADATA_KEYS: Array<keyof SprintStatus['metadata']> = [
    'generated',
    'last_updated',
    'project',
    'project_key',
    'tracking_system',
    'story_location',
    'jira_sprint_id',
    'confluence_page_id',
  ];

  let inDevelopmentStatus = false;

  for (const line of lines) {
    const trimmedEnd = line.trimEnd();
    if (!trimmedEnd) continue;

    const trimmedStart = trimmedEnd.trimStart();
    if (trimmedStart.startsWith('#')) continue;

    const indent = trimmedEnd.length - trimmedStart.length;

    // Detect section header
    if (trimmedStart === 'development_status:') {
      inDevelopmentStatus = true;
      continue;
    }

    // If we encounter a new top-level key (indent 0) that is not development_status,
    // exit the development_status section.
    if (indent === 0 && !trimmedStart.startsWith('development_status:')) {
      inDevelopmentStatus = false;
    }

    if (inDevelopmentStatus && indent > 0) {
      // Parse entry: `  key: value  # comment`
      const colonIdx = trimmedStart.indexOf(':');
      if (colonIdx === -1) continue;

      const key = trimmedStart.slice(0, colonIdx).trim();
      const rest = trimmedStart.slice(colonIdx + 1);

      const { status, commentParts } = parseInlineComment(rest);

      const entry: SprintStatusEntry = {
        key,
        status,
        type: classifyKey(key),
      };

      if (commentParts['jira_key']) {
        entry.jira_key = commentParts['jira_key'];
      }

      entries.push(entry);
    } else if (!inDevelopmentStatus) {
      // Top-level metadata key: value
      const colonIdx = trimmedStart.indexOf(':');
      if (colonIdx === -1) continue;

      const key = trimmedStart.slice(0, colonIdx).trim() as keyof SprintStatus['metadata'];
      const rawValue = trimmedStart.slice(colonIdx + 1).trim();

      // Strip surrounding quotes
      const value = rawValue.replace(/^(['"])(.*)\1$/, '$2');

      if ((METADATA_KEYS as string[]).includes(key) && value) {
        metadata[key] = value;
      }
    }
  }

  return { metadata, entries, rawContent: content };
}

/**
 * Updates entries in the development_status section of a sprint-status.yaml string.
 *
 * For each key in `updates`, the function rewrites that line with:
 *   - Updated status (if provided)
 *   - Updated/added inline comment for jira_key and/or confluence_page_id (if provided)
 *
 * All other lines (including comments and blank lines) are preserved verbatim.
 *
 * @param content - Raw YAML file content as a string.
 * @param updates - Map of entry key → fields to update.
 * @returns Updated YAML string.
 */
export function updateSprintStatusKeys(
  content: string,
  updates: Map<string, { jira_key?: string; status?: string; confluence_page_id?: string }>,
): string {
  const lines = content.split('\n');
  const output: string[] = [];

  let inDevelopmentStatus = false;

  for (const line of lines) {
    const trimmedEnd = line.trimEnd();
    const trimmedStart = trimmedEnd.trimStart();
    const indent = trimmedEnd.length - trimmedStart.length;

    // Detect section header
    if (trimmedStart === 'development_status:') {
      inDevelopmentStatus = true;
      output.push(line);
      continue;
    }

    // Exit development_status section on a new top-level key
    if (indent === 0 && trimmedStart !== '' && !trimmedStart.startsWith('#')) {
      inDevelopmentStatus = false;
    }

    if (inDevelopmentStatus && indent > 0 && !trimmedStart.startsWith('#')) {
      const colonIdx = trimmedStart.indexOf(':');
      if (colonIdx !== -1) {
        const key = trimmedStart.slice(0, colonIdx).trim();

        if (updates.has(key)) {
          const upd = updates.get(key)!;
          const rest = trimmedStart.slice(colonIdx + 1);
          const { status: existingStatus, commentParts } = parseInlineComment(rest);

          // Apply updates
          const newStatus = upd.status ?? existingStatus;

          // Merge comment parts
          const newCommentParts: Record<string, string> = { ...commentParts };
          if (upd.jira_key !== undefined) newCommentParts['jira_key'] = upd.jira_key;
          if (upd.confluence_page_id !== undefined) newCommentParts['confluence_page_id'] = upd.confluence_page_id;

          // Reconstruct the line
          const indentStr = ' '.repeat(indent);
          let newLine = `${indentStr}${key}: ${newStatus}`;

          const commentEntries = Object.entries(newCommentParts);
          if (commentEntries.length > 0) {
            const commentStr = commentEntries.map(([k, v]) => `${k}: ${v}`).join(', ');
            newLine += `  # ${commentStr}`;
          }

          output.push(newLine);
          continue;
        }
      }
    }

    output.push(line);
  }

  return output.join('\n');
}
