/**
 * Atlassian Document Format (ADF) types and conversion utilities.
 * Jira Cloud REST API v3 requires ADF for descriptions and comments.
 *
 * ADF spec reference: https://developer.atlassian.com/cloud/jira/platform/apis/document/
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdfMark {
  type: 'strong' | 'em' | 'code' | 'link';
  attrs?: {
    href?: string;
    [key: string]: unknown;
  };
}

export interface AdfInlineNode {
  type: 'text' | 'hardBreak';
  text?: string;
  marks?: AdfMark[];
}

export type AdfNode =
  | {
      type: 'paragraph';
      content: AdfInlineNode[];
    }
  | {
      type: 'heading';
      attrs: { level: 1 | 2 | 3 | 4 | 5 | 6 };
      content: AdfInlineNode[];
    }
  | {
      type: 'bulletList';
      content: AdfListItemNode[];
    }
  | {
      type: 'orderedList';
      content: AdfListItemNode[];
    }
  | {
      type: 'codeBlock';
      attrs?: { language?: string };
      content: AdfInlineNode[];
    }
  | {
      type: 'blockquote';
      content: AdfBlockNode[];
    };

export interface AdfListItemNode {
  type: 'listItem';
  content: AdfBlockNode[];
}

export interface AdfBlockNode {
  type: 'paragraph';
  content: AdfInlineNode[];
}

export interface AdfDocument {
  version: 1;
  type: 'doc';
  content: AdfNode[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeText(text: string, marks?: AdfMark[]): AdfInlineNode {
  const node: AdfInlineNode = { type: 'text', text };
  if (marks && marks.length > 0) {
    node.marks = marks;
  }
  return node;
}

function makeParagraph(text: string): AdfNode {
  return {
    type: 'paragraph',
    content: [makeText(text)],
  };
}

function makeHeading(text: string, level: 1 | 2 | 3 | 4 | 5 | 6): AdfNode {
  return {
    type: 'heading',
    attrs: { level },
    content: [makeText(text)],
  };
}

function makeBulletList(items: string[]): AdfNode {
  return {
    type: 'bulletList',
    content: items.map((item) => ({
      type: 'listItem' as const,
      content: [
        {
          type: 'paragraph' as const,
          content: [makeText(item)],
        },
      ],
    })),
  };
}

// ---------------------------------------------------------------------------
// textToAdf — converts plain text / light markdown to ADF
// ---------------------------------------------------------------------------

/**
 * Converts a plain text or lightweight markdown string into an ADF document.
 *
 * Supported markdown syntax:
 *   - `# Heading` → h1, `## Heading` → h2, … up to h6
 *   - `- item` or `* item` → bullet list items (consecutive items are grouped)
 *   - Blank lines are skipped
 *   - Everything else becomes a paragraph
 */
export function textToAdf(text: string): AdfDocument {
  if (!text || text.trim() === '') {
    return {
      version: 1,
      type: 'doc',
      content: [makeParagraph('')],
    };
  }

  const lines = text.split('\n');
  const nodes: AdfNode[] = [];
  let bulletBuffer: string[] = [];

  function flushBullets(): void {
    if (bulletBuffer.length > 0) {
      nodes.push(makeBulletList(bulletBuffer));
      bulletBuffer = [];
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines (flush pending bullet list first)
    if (trimmed === '') {
      flushBullets();
      continue;
    }

    // Headings: # through ######
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushBullets();
      const level = Math.min(headingMatch[1].length, 6) as 1 | 2 | 3 | 4 | 5 | 6;
      nodes.push(makeHeading(headingMatch[2].trim(), level));
      continue;
    }

    // Bullet list items: - or *
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      bulletBuffer.push(bulletMatch[1].trim());
      continue;
    }

    // Ordered list items: 1. or 1)
    const orderedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (orderedMatch) {
      // Flush any pending bullets first, then treat as paragraph (simplified)
      flushBullets();
      nodes.push(makeParagraph(orderedMatch[1].trim()));
      continue;
    }

    // Plain paragraph
    flushBullets();
    nodes.push(makeParagraph(trimmed));
  }

  // Flush any trailing bullets
  flushBullets();

  // Always return at least one paragraph
  if (nodes.length === 0) {
    nodes.push(makeParagraph(text.trim()));
  }

  return {
    version: 1,
    type: 'doc',
    content: nodes,
  };
}

// ---------------------------------------------------------------------------
// adfToText — converts ADF back to plain text / markdown
// ---------------------------------------------------------------------------

function inlineNodesToText(inlineNodes: AdfInlineNode[]): string {
  return inlineNodes
    .map((node) => {
      if (node.type === 'hardBreak') return '\n';
      return node.text ?? '';
    })
    .join('');
}

function blockNodesToText(blockNodes: AdfBlockNode[]): string {
  return blockNodes
    .map((block) => {
      if (block.type === 'paragraph') {
        return inlineNodesToText(block.content);
      }
      return '';
    })
    .join('\n');
}

/**
 * Converts an ADF document back to plain text / markdown.
 *
 * - Headings become `# text`, `## text`, etc.
 * - Bullet lists become `- item` lines
 * - Ordered lists become `1. item` lines
 * - Code blocks become the raw text
 * - Paragraphs become plain text lines
 */
export function adfToText(doc: AdfDocument): string {
  const parts: string[] = [];

  for (const node of doc.content) {
    switch (node.type) {
      case 'paragraph':
        parts.push(inlineNodesToText(node.content));
        break;

      case 'heading': {
        const level = node.attrs.level;
        const prefix = '#'.repeat(level);
        parts.push(`${prefix} ${inlineNodesToText(node.content)}`);
        break;
      }

      case 'bulletList':
        for (const listItem of node.content) {
          const itemText = blockNodesToText(listItem.content);
          parts.push(`- ${itemText}`);
        }
        break;

      case 'orderedList': {
        let idx = 1;
        for (const listItem of node.content) {
          const itemText = blockNodesToText(listItem.content);
          parts.push(`${idx}. ${itemText}`);
          idx++;
        }
        break;
      }

      case 'codeBlock':
        parts.push(inlineNodesToText(node.content));
        break;

      case 'blockquote': {
        const quoteText = node.content
          .map((block) => {
            if (block.type === 'paragraph') {
              return `> ${inlineNodesToText(block.content)}`;
            }
            return '';
          })
          .join('\n');
        parts.push(quoteText);
        break;
      }
    }
  }

  return parts.join('\n');
}
