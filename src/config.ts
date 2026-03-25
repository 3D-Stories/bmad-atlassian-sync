import { readFileSync, existsSync } from 'node:fs';

export interface AtlassianSyncConfig {
  jira: {
    baseUrl: string;
    email: string;
    apiToken: string;
    projectKey: string;
    cloudId: string;  // Atlassian Cloud ID (read by Python bridge from env; kept here for reference)
    boardId?: number;
  };
  confluence: {
    baseUrl: string;
    spaceKey: string;
    cloudId: string;
    spaceId?: string;
  };
  sync: {
    enabled: boolean;
    conflictStrategy: 'merge' | 'local-wins' | 'remote-wins' | 'ask';
  };
}

export interface LoadConfigOptions {
  bmadConfigPath?: string;
  envPath?: string;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Reads a .env file and sets process.env for keys not already set.
 * Skips blank lines and comments (#).
 */
function loadEnvFile(envPath: string): void {
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();

    // Only set if not already present in process.env
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

/**
 * Resolves ${ENV_VAR} placeholders in a string using process.env.
 */
function resolveEnvPlaceholders(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, varName: string) => {
    return process.env[varName] ?? '';
  });
}

// ---------------------------------------------------------------------------
// Minimal YAML parser for the atlassian_sync section
//
// Supports:
//   - Nested mappings (indented with spaces)
//   - Scalar string values
//   - Boolean values (true/false)
//   - The `atlassian_sync:` top-level key
// ---------------------------------------------------------------------------

type YamlValue = string | boolean | number | YamlObject;
interface YamlObject {
  [key: string]: YamlValue;
}

/**
 * Parses a simple YAML file into a plain JS object.
 * Only handles flat and single-level-nested key: value mappings.
 * Does not support arrays, multi-line strings, or anchors.
 */
function parseSimpleYaml(content: string): YamlObject {
  const lines = content.split('\n');
  const root: YamlObject = {};

  // Stack entries: { indent, obj }
  const stack: Array<{ indent: number; obj: YamlObject }> = [{ indent: -1, obj: root }];

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.trimStart().startsWith('#')) continue;

    const indent = trimmed.length - trimmed.trimStart().length;
    const keyValueMatch = trimmed.trimStart().match(/^([^:]+):\s*(.*)$/);
    if (!keyValueMatch) continue;

    const key = keyValueMatch[1].trim();
    const rawValue = keyValueMatch[2].trim();

    // Pop stack until we find the correct parent
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].obj;

    if (rawValue === '') {
      // This is a mapping node — create child object
      const child: YamlObject = {};
      parent[key] = child;
      stack.push({ indent, obj: child });
    } else {
      // Scalar value
      if (rawValue === 'true') {
        parent[key] = true;
      } else if (rawValue === 'false') {
        parent[key] = false;
      } else if (/^\d+$/.test(rawValue)) {
        parent[key] = parseInt(rawValue, 10);
      } else {
        // Strip optional surrounding quotes
        parent[key] = rawValue.replace(/^['"]|['"]$/g, '');
      }
    }
  }

  return root;
}

/**
 * Reads a BMAD config.yaml and extracts the `atlassian_sync:` section.
 * Returns null if the file doesn't exist or has no atlassian_sync section.
 * Resolves ${ENV_VAR} placeholders in string values.
 */
function loadBmadConfig(bmadConfigPath: string): Partial<AtlassianSyncConfig> | null {
  if (!existsSync(bmadConfigPath)) return null;

  let parsed: YamlObject;
  try {
    const raw = readFileSync(bmadConfigPath, 'utf8');
    parsed = parseSimpleYaml(raw);
  } catch {
    return null;
  }

  const syncSection = parsed['atlassian_sync'];
  if (!syncSection || typeof syncSection !== 'object') return null;

  const section = syncSection as YamlObject;

  // Recursively resolve env placeholders in all string leaves
  function resolveObj(obj: YamlObject): YamlObject {
    const result: YamlObject = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') {
        result[k] = resolveEnvPlaceholders(v);
      } else if (typeof v === 'object' && v !== null) {
        result[k] = resolveObj(v as YamlObject);
      } else {
        result[k] = v;
      }
    }
    return result;
  }

  const resolved = resolveObj(section);

  // Build partial config from the resolved section
  const partial: Partial<AtlassianSyncConfig> = {};

  if (resolved['jira'] && typeof resolved['jira'] === 'object') {
    const j = resolved['jira'] as YamlObject;
    partial.jira = {
      // These will be filled in from env vars; overrides applied after
      baseUrl: typeof j['baseUrl'] === 'string' ? j['baseUrl'] : '',
      email: typeof j['email'] === 'string' ? j['email'] : '',
      apiToken: typeof j['apiToken'] === 'string' ? j['apiToken'] : '',
      projectKey: typeof j['projectKey'] === 'string' ? j['projectKey'] : '',
      cloudId: typeof j['cloudId'] === 'string' ? j['cloudId'] : '',
      ...(j['boardId'] !== undefined ? { boardId: Number(j['boardId']) } : {}),
    };
  }

  if (resolved['confluence'] && typeof resolved['confluence'] === 'object') {
    const c = resolved['confluence'] as YamlObject;
    partial.confluence = {
      baseUrl: typeof c['baseUrl'] === 'string' ? c['baseUrl'] : '',
      spaceKey: typeof c['spaceKey'] === 'string' ? c['spaceKey'] : '',
      cloudId: typeof c['cloudId'] === 'string' ? c['cloudId'] : '',
      ...(c['spaceId'] !== undefined ? { spaceId: String(c['spaceId']) } : {}),
    };
  }

  if (resolved['sync'] && typeof resolved['sync'] === 'object') {
    const s = resolved['sync'] as YamlObject;
    const strategy = s['conflictStrategy'];
    const validStrategies = ['merge', 'local-wins', 'remote-wins', 'ask'] as const;
    partial.sync = {
      enabled: typeof s['enabled'] === 'boolean' ? s['enabled'] : true,
      conflictStrategy:
        typeof strategy === 'string' && (validStrategies as readonly string[]).includes(strategy)
          ? (strategy as AtlassianSyncConfig['sync']['conflictStrategy'])
          : 'merge',
    };
  }

  return partial;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Loads Atlassian sync configuration from environment variables,
 * optionally reading from a .env file first and then applying
 * overrides from a BMAD config.yaml.
 */
export function loadConfig(options: LoadConfigOptions = {}): AtlassianSyncConfig {
  const { bmadConfigPath, envPath } = options;

  // 1. Load .env file if specified (only sets vars not already in process.env)
  if (envPath) {
    loadEnvFile(envPath);
  }

  // 2. Load BMAD config overrides if specified
  const bmadOverrides = bmadConfigPath ? loadBmadConfig(bmadConfigPath) : null;

  // 3. Helper to get a required env var, with BMAD override taking precedence.
  //    Accepts multiple env var names to try in order (supports both naming conventions).
  function requireEnv(keys: string | string[], bmadValue?: string): string {
    // BMAD config value takes precedence over env var, but only if non-empty
    if (bmadValue && bmadValue.length > 0) return bmadValue;
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (const key of keyList) {
      const val = process.env[key];
      if (val) return val;
    }
    // Throw mentioning the primary key name
    throw new Error(`Missing required environment variable: ${keyList[0]}`);
  }

  function optionalEnv(keys: string | string[], bmadValue?: string): string | undefined {
    if (bmadValue && bmadValue.length > 0) return bmadValue;
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (const key of keyList) {
      const val = process.env[key];
      if (val) return val;
    }
    return undefined;
  }

  const jiraOverride = bmadOverrides?.jira;
  const confOverride = bmadOverrides?.confluence;
  const syncOverride = bmadOverrides?.sync;

  // 4. Build config — required vars throw if absent
  const boardIdStr = optionalEnv(
    'JIRA_BOARD_ID',
    jiraOverride?.boardId !== undefined ? String(jiraOverride.boardId) : undefined,
  );

  // cloudId is read by the Python bridge from its own .env; keep it optional here
  // so that configs without ATLASSIAN_CLOUD_ID still load (bridge handles it).
  const cloudId =
    optionalEnv(['ATLASSIAN_CLOUD_ID'], jiraOverride?.cloudId) ?? '';

  const jira: AtlassianSyncConfig['jira'] = {
    baseUrl: requireEnv(['JIRA_BASE_URL', 'ATLASSIAN_SITE_URL'], jiraOverride?.baseUrl),
    email: requireEnv(['JIRA_EMAIL', 'ATLASSIAN_SA_EMAIL'], jiraOverride?.email),
    apiToken: requireEnv(['JIRA_API_TOKEN', 'ATLASSIAN_API_TOKEN'], jiraOverride?.apiToken),
    projectKey: requireEnv('JIRA_PROJECT_KEY', jiraOverride?.projectKey),
    cloudId,
    ...(boardIdStr !== undefined ? { boardId: parseInt(boardIdStr, 10) } : {}),
  };

  const spaceId = optionalEnv('CONFLUENCE_SPACE_ID', confOverride?.spaceId);
  const confluenceBaseUrl = optionalEnv(['CONFLUENCE_BASE_URL', 'ATLASSIAN_SITE_URL'], confOverride?.baseUrl);
  const confluence: AtlassianSyncConfig['confluence'] = {
    baseUrl: confluenceBaseUrl ?? jira.baseUrl,
    spaceKey: requireEnv('CONFLUENCE_SPACE_KEY', confOverride?.spaceKey),
    cloudId,
    ...(spaceId !== undefined ? { spaceId } : {}),
  };

  const validStrategies = ['merge', 'local-wins', 'remote-wins', 'ask'] as const;
  const rawStrategy = syncOverride?.conflictStrategy ?? process.env['SYNC_CONFLICT_STRATEGY'] ?? 'merge';
  const conflictStrategy: AtlassianSyncConfig['sync']['conflictStrategy'] =
    (validStrategies as readonly string[]).includes(rawStrategy)
      ? (rawStrategy as AtlassianSyncConfig['sync']['conflictStrategy'])
      : 'merge';

  const rawEnabled = syncOverride?.enabled ?? process.env['SYNC_ENABLED'];
  const enabled = rawEnabled === false ? false : rawEnabled === 'false' ? false : true;

  const sync: AtlassianSyncConfig['sync'] = {
    enabled,
    conflictStrategy,
  };

  return { jira, confluence, sync };
}

/**
 * Returns a Basic auth header string for the given Atlassian credentials.
 */
export function getAuthHeader(email: string, apiToken: string): string {
  const encoded = Buffer.from(`${email}:${apiToken}`).toString('base64');
  return `Basic ${encoded}`;
}
