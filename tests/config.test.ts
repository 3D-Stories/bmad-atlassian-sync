import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// We import via dynamic import so we can control env before module load
// Instead, we test the exported functions directly after setting env.

const REQUIRED_ENV: Record<string, string> = {
  JIRA_BASE_URL: 'https://test.atlassian.net',
  JIRA_EMAIL: 'test@example.com',
  JIRA_API_TOKEN: 'test-token-abc',
  JIRA_PROJECT_KEY: 'TEST',
  CONFLUENCE_BASE_URL: 'https://test.atlassian.net/wiki',
  CONFLUENCE_SPACE_KEY: 'TS',
};

// Additional env keys introduced by the bridge refactor (also clear these in beforeEach)
const BRIDGE_ENV_KEYS = [
  'ATLASSIAN_SA_EMAIL',
  'ATLASSIAN_API_TOKEN',
  'ATLASSIAN_CLOUD_ID',
  'ATLASSIAN_SITE_URL',
];

describe('config', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save and clear relevant env vars
    originalEnv = { ...process.env };
    for (const key of Object.keys(REQUIRED_ENV)) {
      delete process.env[key];
    }
    for (const key of BRIDGE_ENV_KEYS) {
      delete process.env[key];
    }
    delete process.env['JIRA_BOARD_ID'];
    delete process.env['CONFLUENCE_SPACE_ID'];
    delete process.env['SYNC_ENABLED'];
    delete process.env['SYNC_CONFLICT_STRATEGY'];
  });

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      }
    }
  });

  describe('loadConfig', () => {
    it('loads config from required env vars successfully', async () => {
      // Set all required env vars
      Object.assign(process.env, REQUIRED_ENV);

      const { loadConfig } = await import('../src/config.ts');
      const config = loadConfig();

      expect(config.jira.baseUrl).toBe('https://test.atlassian.net');
      expect(config.jira.email).toBe('test@example.com');
      expect(config.jira.apiToken).toBe('test-token-abc');
      expect(config.jira.projectKey).toBe('TEST');
      expect(config.confluence.baseUrl).toBe('https://test.atlassian.net/wiki');
      expect(config.confluence.spaceKey).toBe('TS');
    });

    it('sets sync defaults when sync env vars are absent', async () => {
      Object.assign(process.env, REQUIRED_ENV);

      const { loadConfig } = await import('../src/config.ts');
      const config = loadConfig();

      expect(config.sync.enabled).toBe(true);
      expect(config.sync.conflictStrategy).toBe('merge');
    });

    it('loads optional env vars when present', async () => {
      Object.assign(process.env, REQUIRED_ENV);
      process.env['JIRA_BOARD_ID'] = '42';
      process.env['CONFLUENCE_SPACE_ID'] = 'space-123';

      const { loadConfig } = await import('../src/config.ts');
      const config = loadConfig();

      expect(config.jira.boardId).toBe(42);
      expect(config.confluence.spaceId).toBe('space-123');
    });

    it('throws with specific var name when a required env var is missing', async () => {
      // Set all except JIRA_API_TOKEN
      const partial = { ...REQUIRED_ENV };
      delete partial['JIRA_API_TOKEN'];
      Object.assign(process.env, partial);

      const { loadConfig } = await import('../src/config.ts');
      expect(() => loadConfig()).toThrow('JIRA_API_TOKEN');
    });

    it('throws with JIRA_BASE_URL when all required vars are missing', async () => {
      const { loadConfig } = await import('../src/config.ts');
      // No env vars set — should throw mentioning first missing var
      expect(() => loadConfig()).toThrow(/JIRA_BASE_URL|JIRA_EMAIL|JIRA_API_TOKEN|JIRA_PROJECT_KEY|CONFLUENCE_BASE_URL|CONFLUENCE_SPACE_KEY/);
    });

    it('handles missing bmadConfigPath gracefully when file does not exist', async () => {
      Object.assign(process.env, REQUIRED_ENV);

      const { loadConfig } = await import('../src/config.ts');
      // Should not throw — non-existent BMAD config is optional
      const config = loadConfig({ bmadConfigPath: '/non/existent/config.yaml' });

      expect(config.jira.baseUrl).toBe('https://test.atlassian.net');
    });

    it('loads and applies overrides from a BMAD config.yaml atlassian_sync section', async () => {
      Object.assign(process.env, REQUIRED_ENV);
      process.env['OVERRIDE_TOKEN'] = 'overridden-token-xyz';

      const tmpDir = join(tmpdir(), `bmad-test-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });
      const configPath = join(tmpDir, 'config.yaml');

      writeFileSync(
        configPath,
        [
          'project: my-bmad-project',
          'atlassian_sync:',
          '  jira:',
          '    baseUrl: https://override.atlassian.net',
          '    apiToken: ${OVERRIDE_TOKEN}',
          '  confluence:',
          '    spaceKey: OVER',
          '  sync:',
          '    conflictStrategy: local-wins',
        ].join('\n'),
      );

      try {
        const { loadConfig } = await import('../src/config.ts');
        const config = loadConfig({ bmadConfigPath: configPath });

        // Overrides from BMAD config
        expect(config.jira.baseUrl).toBe('https://override.atlassian.net');
        expect(config.jira.apiToken).toBe('overridden-token-xyz');
        expect(config.confluence.spaceKey).toBe('OVER');
        expect(config.sync.conflictStrategy).toBe('local-wins');

        // Non-overridden values still come from env
        expect(config.jira.email).toBe('test@example.com');
        expect(config.jira.projectKey).toBe('TEST');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('loads a .env file from envPath', async () => {
      const tmpDir = join(tmpdir(), `bmad-env-test-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });
      const envPath = join(tmpDir, '.env');

      writeFileSync(
        envPath,
        [
          '# This is a comment',
          '',
          'JIRA_BASE_URL=https://env-file.atlassian.net',
          'JIRA_EMAIL=envfile@example.com',
          'JIRA_API_TOKEN=envfile-token',
          'JIRA_PROJECT_KEY=ENVF',
          'CONFLUENCE_BASE_URL=https://env-file.atlassian.net/wiki',
          'CONFLUENCE_SPACE_KEY=EF',
        ].join('\n'),
      );

      try {
        const { loadConfig } = await import('../src/config.ts');
        const config = loadConfig({ envPath });

        expect(config.jira.baseUrl).toBe('https://env-file.atlassian.net');
        expect(config.jira.email).toBe('envfile@example.com');
        expect(config.jira.projectKey).toBe('ENVF');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('getAuthHeader', () => {
    it('returns a valid Basic auth header', async () => {
      const { getAuthHeader } = await import('../src/config.ts');
      const header = getAuthHeader('user@example.com', 'my-api-token');

      const expected = `Basic ${Buffer.from('user@example.com:my-api-token').toString('base64')}`;
      expect(header).toBe(expected);
    });

    it('encodes email and token correctly', async () => {
      const { getAuthHeader } = await import('../src/config.ts');
      const header = getAuthHeader('admin@company.org', 'token-with-special:chars');

      expect(header).toMatch(/^Basic /);
      const encoded = header.slice('Basic '.length);
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      expect(decoded).toBe('admin@company.org:token-with-special:chars');
    });
  });
});
