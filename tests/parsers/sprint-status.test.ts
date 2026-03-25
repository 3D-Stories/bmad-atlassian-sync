import { describe, it, expect } from 'vitest';
import { parseSprintStatus, updateSprintStatusKeys } from '../../src/parsers/sprint-status.js';

// ---------------------------------------------------------------------------
// Sample YAML for tests
// ---------------------------------------------------------------------------

const SAMPLE_YAML = `generated: 2026-03-16
last_updated: 2026-03-16
project: STARS-COC-MVP
project_key: NOKEY
tracking_system: file-system
story_location: "{story_location}"

development_status:
  epic-1: in-progress
  1-1-user-authentication: done
  1-2-account-management: ready-for-dev
  epic-1-retrospective: optional
`;

const YAML_WITH_JIRA_KEYS = `generated: 2026-03-16
last_updated: 2026-03-16
project: STARS-COC-MVP
project_key: STARS

development_status:
  epic-1: in-progress  # jira_key: STARS-100
  1-1-user-authentication: done  # jira_key: STARS-42
  1-2-account-management: ready-for-dev
  epic-1-retrospective: optional
`;

// ---------------------------------------------------------------------------
// parseSprintStatus
// ---------------------------------------------------------------------------

describe('parseSprintStatus', () => {
  it('parses metadata and development_status entries with correct types', () => {
    const result = parseSprintStatus(SAMPLE_YAML);

    // Metadata
    expect(result.metadata.generated).toBe('2026-03-16');
    expect(result.metadata.last_updated).toBe('2026-03-16');
    expect(result.metadata.project).toBe('STARS-COC-MVP');
    expect(result.metadata.project_key).toBe('NOKEY');
    expect(result.metadata.tracking_system).toBe('file-system');

    // Entries count
    expect(result.entries).toHaveLength(4);

    // epic-1 → epic type
    const epic1 = result.entries.find((e) => e.key === 'epic-1');
    expect(epic1).toBeDefined();
    expect(epic1!.type).toBe('epic');
    expect(epic1!.status).toBe('in-progress');

    // 1-1-user-authentication → story type
    const auth = result.entries.find((e) => e.key === '1-1-user-authentication');
    expect(auth).toBeDefined();
    expect(auth!.type).toBe('story');
    expect(auth!.status).toBe('done');

    // 1-2-account-management → story type
    const acct = result.entries.find((e) => e.key === '1-2-account-management');
    expect(acct).toBeDefined();
    expect(acct!.type).toBe('story');
    expect(acct!.status).toBe('ready-for-dev');

    // epic-1-retrospective → retrospective type
    const retro = result.entries.find((e) => e.key === 'epic-1-retrospective');
    expect(retro).toBeDefined();
    expect(retro!.type).toBe('retrospective');
    expect(retro!.status).toBe('optional');
  });

  it('stores rawContent', () => {
    const result = parseSprintStatus(SAMPLE_YAML);
    expect(result.rawContent).toBe(SAMPLE_YAML);
  });

  it('extracts jira_key from inline comments', () => {
    const result = parseSprintStatus(YAML_WITH_JIRA_KEYS);

    const epic1 = result.entries.find((e) => e.key === 'epic-1');
    expect(epic1!.jira_key).toBe('STARS-100');

    const auth = result.entries.find((e) => e.key === '1-1-user-authentication');
    expect(auth!.jira_key).toBe('STARS-42');

    // No inline comment — jira_key should be undefined
    const acct = result.entries.find((e) => e.key === '1-2-account-management');
    expect(acct!.jira_key).toBeUndefined();
  });

  it('returns empty entries when development_status section is absent', () => {
    const minimal = `generated: 2026-03-16
project: TEST
`;
    const result = parseSprintStatus(minimal);
    expect(result.entries).toHaveLength(0);
    expect(result.metadata.project).toBe('TEST');
  });

  it('handles optional metadata keys: jira_sprint_id and confluence_page_id', () => {
    const yaml = `generated: 2026-03-16
project: TEST
jira_sprint_id: sprint-99
confluence_page_id: conf-abc

development_status:
  epic-2: not-started
`;
    const result = parseSprintStatus(yaml);
    expect(result.metadata.jira_sprint_id).toBe('sprint-99');
    expect(result.metadata.confluence_page_id).toBe('conf-abc');
  });
});

// ---------------------------------------------------------------------------
// updateSprintStatusKeys
// ---------------------------------------------------------------------------

describe('updateSprintStatusKeys', () => {
  it('adds jira_key comments to entries', () => {
    const updates = new Map([
      ['1-2-account-management', { jira_key: 'STARS-55' }],
    ]);

    const result = updateSprintStatusKeys(SAMPLE_YAML, updates);

    expect(result).toContain('1-2-account-management: ready-for-dev  # jira_key: STARS-55');
  });

  it('updates status for a matching entry', () => {
    const updates = new Map([
      ['1-1-user-authentication', { status: 'in-review' }],
    ]);

    const result = updateSprintStatusKeys(SAMPLE_YAML, updates);

    expect(result).toContain('1-1-user-authentication: in-review');
    // Should not contain the old status for that key
    expect(result).not.toContain('1-1-user-authentication: done');
  });

  it('updates both status and jira_key together', () => {
    const updates = new Map([
      ['epic-1', { jira_key: 'STARS-200', status: 'done' }],
    ]);

    const result = updateSprintStatusKeys(SAMPLE_YAML, updates);

    expect(result).toContain('epic-1: done  # jira_key: STARS-200');
  });

  it('preserves structure and other lines unchanged', () => {
    const updates = new Map([
      ['1-2-account-management', { jira_key: 'STARS-55' }],
    ]);

    const result = updateSprintStatusKeys(SAMPLE_YAML, updates);

    // Other lines should remain intact
    expect(result).toContain('generated: 2026-03-16');
    expect(result).toContain('project: STARS-COC-MVP');
    expect(result).toContain('epic-1: in-progress');
    expect(result).toContain('1-1-user-authentication: done');
    expect(result).toContain('epic-1-retrospective: optional');
  });

  it('updates jira_key on entry that already has one', () => {
    const updates = new Map([
      ['epic-1', { jira_key: 'STARS-999' }],
    ]);

    const result = updateSprintStatusKeys(YAML_WITH_JIRA_KEYS, updates);

    expect(result).toContain('epic-1: in-progress  # jira_key: STARS-999');
    // Old jira_key should be replaced
    expect(result).not.toContain('jira_key: STARS-100');
  });

  it('updates confluence_page_id on an entry', () => {
    const updates = new Map([
      ['1-1-user-authentication', { confluence_page_id: 'page-77' }],
    ]);

    const result = updateSprintStatusKeys(SAMPLE_YAML, updates);

    expect(result).toContain('1-1-user-authentication: done  # confluence_page_id: page-77');
  });
});
