import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseFrontmatter } from '../../src/parsers/md-frontmatter.js';
import { injectSyncMetadata } from '../../src/parsers/md-frontmatter.js';

describe('Integration: story file round-trip', () => {
  it('creates a story .md, verifies frontmatter parsing, injects sync metadata', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'atlassian-sync-test-'));

    const storyContent = `---
story_key: 1-1-user-auth
status: ready-for-dev
---

# Story 1.1: User Authentication

## Story

As a user,
I want to log in with my email,
so that I can access the system.

## Acceptance Criteria

1. User can enter email and password
2. System validates credentials

## Tasks / Subtasks

- [ ] Task 1: Create login form
`;

    const storyPath = join(tempDir, '1-1-user-auth.md');
    writeFileSync(storyPath, storyContent);

    // Parse frontmatter
    const parsed = parseFrontmatter(readFileSync(storyPath, 'utf-8'));
    expect(parsed.data.story_key).toBe('1-1-user-auth');
    expect(parsed.data.status).toBe('ready-for-dev');

    // Inject sync metadata (simulating post-push)
    const synced = injectSyncMetadata(readFileSync(storyPath, 'utf-8'), {
      jira_key: 'STARS-42',
      last_synced_at: '2026-03-16T14:30:00Z',
      jira_updated_at: '2026-03-16T14:30:00Z',
    });
    writeFileSync(storyPath, synced);

    // Verify round-trip
    const reparsed = parseFrontmatter(readFileSync(storyPath, 'utf-8'));
    expect(reparsed.data.jira_key).toBe('STARS-42');
    expect(reparsed.data.last_synced_at).toBe('2026-03-16T14:30:00Z');
    expect(reparsed.data.story_key).toBe('1-1-user-auth');
    expect(reparsed.content).toContain('# Story 1.1: User Authentication');
  });

  it('sprint-status.yaml round-trip with Jira keys', async () => {
    const { parseSprintStatus, updateSprintStatusKeys } = await import(
      '../../src/parsers/sprint-status.js'
    );

    const yaml = `generated: 2026-03-16
project: TEST
project_key: TEST
tracking_system: file-system
story_location: stories

development_status:
  epic-1: in-progress
  1-1-user-auth: ready-for-dev
  epic-1-retrospective: optional`;

    const parsed = parseSprintStatus(yaml);
    expect(parsed.entries).toHaveLength(3);
    expect(parsed.entries[1].key).toBe('1-1-user-auth');

    const updated = updateSprintStatusKeys(
      yaml,
      new Map([
        ['epic-1', { jira_key: 'TEST-10' }],
        ['1-1-user-auth', { jira_key: 'TEST-42', status: 'in-progress' }],
      ]),
    );

    expect(updated).toContain('jira_key: TEST-10');
    expect(updated).toContain('jira_key: TEST-42');
    expect(updated).toContain('1-1-user-auth: in-progress');
  });
});
